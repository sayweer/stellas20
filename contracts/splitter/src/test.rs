// Amounts are written as `<whole>_<7-decimal stroops>` to make the decimal
// boundary legible in a Stellar context; that grouping is intentional.
//
// NOTE: these tests factory-deploy the real PT/YT token wasm — run
// `stellar contract build` once before `cargo test` so the imported wasm
// files exist (CI builds wasm first for the same reason).
#![allow(clippy::inconsistent_digit_grouping)]

use crate::{
    MaturityTokens, Split, Splitter, SplitterClient, SplitterError, SyVaultClient, YieldClaim,
};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    token, Address, Env, Event, MuxedAddress, String,
};
use stellas_mock_yield_token::{MockYieldToken, MockYieldTokenClient, RATE_SCALE};
use stellas_sy_vault::SyVault;
use stellas_sy_vault_blend::{mock_pool::MockBlendPool, SyVaultBlend, SyVaultBlendClient};

/// The real PT/YT token wasm, exactly what testnet runs.
pub mod pt_wasm {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/stellas_pt_token.wasm");
}
pub mod yt_wasm {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/stellas_yt_token.wasm");
}

pub const BASE_TS: u64 = 1_700_000_000;
pub const INITIAL_RATE: i128 = RATE_SCALE; // 1.0
pub const SLOPE: i128 = 200_000_000; // +0.0002/s
pub const T_FAR: u64 = BASE_TS + 100_000; // maturity far in the future

/// Which SY vault — and therefore which yield source — the Market runs over.
/// The Market only ever sees the SY interface, so every invariant has to hold
/// for both (MASTERPLAN §3.7).
pub enum Source {
    /// `sy-vault` over the MockYieldToken: a linear, exactly-predictable rate.
    Mock {
        myt: MockYieldTokenClient<'static>,
        vault: stellas_sy_vault::SyVaultClient<'static>,
    },
    /// `sy-vault-blend` over a Blend lending position: shares are bTokens, so
    /// wrapping is not 1:1 and the rate is whatever the pool reports.
    Blend {
        minter: token::StellarAssetClient<'static>,
        vault: SyVaultBlendClient<'static>,
    },
}

pub struct TestCtx {
    pub env: Env,
    pub admin: Address,
    /// The vault as the Market sees it — the interface client, not a concrete
    /// vault type, so the same assertions run against either source.
    pub sy: SyVaultClient<'static>,
    pub splitter: SplitterClient<'static>,
    pub splitter_id: Address,
    pub source: Source,
}

impl TestCtx {
    /// The underlying mock yield token. Mock-source tests only — the Blend
    /// source has no such thing.
    pub fn myt(&self) -> &MockYieldTokenClient<'static> {
        match &self.source {
            Source::Mock { myt, .. } => myt,
            Source::Blend { .. } => panic!("myt() is only available on the mock source"),
        }
    }
}

pub fn setup() -> TestCtx {
    setup_over_mock()
}

pub fn setup_over_mock() -> TestCtx {
    let (env, admin) = new_env();

    let myt_id = env.register(MockYieldToken, (admin.clone(), INITIAL_RATE, SLOPE));
    let sy_id = env.register(SyVault, (admin.clone(), myt_id.clone()));

    let source = Source::Mock {
        myt: MockYieldTokenClient::new(&env, &myt_id),
        vault: stellas_sy_vault::SyVaultClient::new(&env, &sy_id),
    };
    finish_setup(env, admin, sy_id, source)
}

/// The same Market, over a Blend-backed vault driven by the mock pool (which
/// reproduces Blend's exact rounding — see `sy-vault-blend/src/mock_pool.rs`).
/// The rate curve is deliberately identical to the mock source's, so a failure
/// here means the *vault swap* broke something, not the numbers.
pub fn setup_over_blend() -> TestCtx {
    let (env, admin) = new_env();

    let asset = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let pool_id = env.register(MockBlendPool, (asset.clone(), 0u32, INITIAL_RATE, SLOPE));
    let minter = token::StellarAssetClient::new(&env, &asset);
    // Interest paid out beyond what was supplied comes from borrowers on a real
    // pool; here it is pre-funded.
    minter.mint(&pool_id, &1_000_000_0000000);

    let sy_id = env.register(
        SyVaultBlend,
        (
            admin.clone(),
            pool_id,
            asset,
            String::from_str(&env, "Standardized Yield Blend"),
            String::from_str(&env, "SY-bTEST"),
        ),
    );

    let source = Source::Blend {
        minter,
        vault: SyVaultBlendClient::new(&env, &sy_id),
    };
    finish_setup(env, admin, sy_id, source)
}

fn new_env() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(BASE_TS);
    let admin = Address::generate(&env);
    (env, admin)
}

fn finish_setup(env: Env, admin: Address, sy_id: Address, source: Source) -> TestCtx {
    let pt_hash = env.deployer().upload_contract_wasm(pt_wasm::WASM);
    let yt_hash = env.deployer().upload_contract_wasm(yt_wasm::WASM);
    let splitter_id = env.register(Splitter, (admin.clone(), sy_id.clone(), pt_hash, yt_hash));

    let sy = SyVaultClient::new(&env, &sy_id);
    let splitter = SplitterClient::new(&env, &splitter_id);
    TestCtx {
        env,
        admin,
        sy,
        splitter,
        splitter_id,
        source,
    }
}

/// Give `who` exactly `amount` SY, whichever source is behind the vault.
///
/// The mock wraps 1:1. Blend mints bTokens, so the deposit is grossed up by the
/// rate — `ceil(amount · R / SCALE)` in, which mints back exactly `amount`
/// shares for any rate at or above 1.0.
pub fn fund_sy(ctx: &TestCtx, who: &Address, amount: i128) {
    match &ctx.source {
        Source::Mock { myt, vault } => {
            myt.faucet(who, &amount);
            vault.wrap(who, &amount);
        }
        Source::Blend { minter, vault } => {
            let rate = ctx.sy.exchange_rate();
            let deposit = (amount * RATE_SCALE + rate - 1) / rate;
            minter.mint(who, &deposit);
            vault.wrap(who, &deposit);
        }
    }
}

/// SEP-41 clients for a maturity's factory-deployed PT and YT tokens.
pub fn tokens(
    ctx: &TestCtx,
    maturity: u64,
) -> (token::TokenClient<'static>, token::TokenClient<'static>) {
    let mt: MaturityTokens = ctx.splitter.get_market(&maturity);
    (
        token::TokenClient::new(&ctx.env, &mt.pt),
        token::TokenClient::new(&ctx.env, &mt.yt),
    )
}

#[test]
fn test_create_maturity_deploys_wired_tokens() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);

    let mt: MaturityTokens = ctx.splitter.get_market(&T_FAR);
    let (pt, yt) = tokens(&ctx, T_FAR);
    // Metadata follows the convention and the Market is the recorded minter.
    assert_eq!(
        pt.symbol(),
        String::from_str(&ctx.env, "PT-mUSDY-1700100000")
    );
    assert_eq!(
        yt.symbol(),
        String::from_str(&ctx.env, "YT-mUSDY-1700100000")
    );
    assert_eq!(pt.decimals(), 7);
    assert_eq!(
        pt_wasm::Client::new(&ctx.env, &mt.pt).market(),
        ctx.splitter_id
    );
    assert_eq!(
        yt_wasm::Client::new(&ctx.env, &mt.yt).market(),
        ctx.splitter_id
    );
    let totals = ctx.splitter.get_totals(&T_FAR);
    assert_eq!(totals.pt_supply, 0);
    assert_eq!(totals.yt_supply, 0);
}

#[test]
fn test_create_maturity_and_list() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    ctx.splitter.create_maturity(&(BASE_TS + 500));
    let maturities = ctx.splitter.get_maturities();
    assert_eq!(maturities.len(), 2);
    assert!(maturities.iter().any(|m| m == T_FAR));
    assert!(maturities.iter().any(|m| m == BASE_TS + 500));
}

#[test]
fn test_create_maturity_in_past_rejected() {
    let ctx = setup();
    let result = ctx.splitter.try_create_maturity(&(BASE_TS - 1));
    assert_eq!(result, Err(Ok(SplitterError::MaturityInPast)));
    // Duplicates are also rejected.
    ctx.splitter.create_maturity(&T_FAR);
    assert_eq!(
        ctx.splitter.try_create_maturity(&T_FAR),
        Err(Ok(SplitterError::MaturityAlreadyExists))
    );
}

#[test]
fn test_create_maturity_requires_admin() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let auths = ctx.env.auths();
    assert!(auths.iter().any(|(addr, _)| *addr == ctx.admin));
}

#[test]
fn test_create_maturity_rejects_non_admin() {
    let ctx = setup();
    ctx.env.mock_auths(&[]);
    assert!(ctx.splitter.try_create_maturity(&T_FAR).is_err());
}

#[test]
fn test_split_mints_equal_pt_yt_tokens() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);

    let pt_out = ctx.splitter.split(&user, &T_FAR, &100_0000000);
    // At rate 1.0, 100 SY -> 100 PT + 100 YT — real, transferable tokens.
    assert_eq!(pt_out, 100_0000000);
    let (pt, yt) = tokens(&ctx, T_FAR);
    assert_eq!(pt.balance(&user), 100_0000000);
    assert_eq!(yt.balance(&user), 100_0000000);

    let account = ctx.splitter.get_account(&user, &T_FAR);
    assert_eq!(account.pt, 100_0000000);
    assert_eq!(account.yt, 100_0000000);
    assert_eq!(account.index, INITIAL_RATE);
    assert_eq!(account.accrued_sy, 0);
    assert_eq!(account.claimable, 0);
}

#[test]
fn test_split_amounts_exact_at_known_rate() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);

    // Warp to a rate of exactly 1.2 (t0 + 1000s).
    ctx.env.ledger().set_timestamp(BASE_TS + 1000);
    assert_eq!(ctx.myt().exchange_rate(), 1_200_000_000_000);

    let pt_out = ctx.splitter.split(&user, &T_FAR, &100_0000000);
    // 100 SY * 1.2 = 120 PT/YT, entered at index 1.2.
    assert_eq!(pt_out, 120_0000000);
    let account = ctx.splitter.get_account(&user, &T_FAR);
    assert_eq!(account.yt, 120_0000000);
    assert_eq!(account.index, 1_200_000_000_000);
}

#[test]
fn test_split_after_maturity_rejected() {
    let ctx = setup();
    let maturity = BASE_TS + 500;
    ctx.splitter.create_maturity(&maturity);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);

    ctx.env.ledger().set_timestamp(maturity);
    let result = ctx.splitter.try_split(&user, &maturity, &10_0000000);
    assert_eq!(result, Err(Ok(SplitterError::MaturityPassed)));
}

#[test]
fn test_split_pulls_sy_cross_contract() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);
    assert_eq!(ctx.sy.balance(&user), 100_0000000);

    ctx.splitter.split(&user, &T_FAR, &60_0000000);
    // Cross-contract proof: SY moved from the user into the Market.
    assert_eq!(ctx.sy.balance(&user), 40_0000000);
    assert_eq!(ctx.sy.balance(&ctx.splitter_id), 60_0000000);
}

#[test]
fn test_merge_roundtrip_within_2_stroops() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);
    let start_sy = ctx.sy.balance(&user);

    let pt = ctx.splitter.split(&user, &T_FAR, &50_0000000);
    let sy_back = ctx.splitter.merge(&user, &T_FAR, &pt);
    // Split-then-immediate-merge loses at most 2 stroops (one floor each way).
    let end_sy = ctx.sy.balance(&user);
    assert!(start_sy - end_sy <= 2, "lost {} stroops", start_sy - end_sy);
    assert!(sy_back >= 50_0000000 - 2);
    let (pt_token, yt_token) = tokens(&ctx, T_FAR);
    assert_eq!(pt_token.balance(&user), 0);
    assert_eq!(yt_token.balance(&user), 0);
}

#[test]
fn test_merge_exceeding_balance_rejected() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);
    ctx.splitter.split(&user, &T_FAR, &30_0000000);

    let result = ctx.splitter.try_merge(&user, &T_FAR, &30_0000001);
    assert_eq!(result, Err(Ok(SplitterError::InsufficientPt)));
}

#[test]
fn test_merge_without_yt_rejected() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    fund_sy(&ctx, &a, 100_0000000);
    ctx.splitter.split(&a, &T_FAR, &30_0000000);

    // A gives away half their YT — merging the full PT now lacks YT backing.
    let (_, yt) = tokens(&ctx, T_FAR);
    yt.transfer(&a, MuxedAddress::from(&b), &20_0000000);
    let result = ctx.splitter.try_merge(&a, &T_FAR, &30_0000000);
    assert_eq!(result, Err(Ok(SplitterError::InsufficientYt)));
}

#[test]
fn test_pt_yt_supplies_equal_through_all_premature_ops() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    fund_sy(&ctx, &a, 100_0000000);
    fund_sy(&ctx, &b, 100_0000000);

    ctx.splitter.split(&a, &T_FAR, &40_0000000);
    let totals = ctx.splitter.get_totals(&T_FAR);
    assert_eq!(totals.pt_supply, totals.yt_supply);

    ctx.splitter.split(&b, &T_FAR, &25_0000000);
    let totals = ctx.splitter.get_totals(&T_FAR);
    assert_eq!(totals.pt_supply, totals.yt_supply);

    ctx.splitter.merge(&a, &T_FAR, &10_0000000);
    let totals = ctx.splitter.get_totals(&T_FAR);
    assert_eq!(totals.pt_supply, totals.yt_supply);
}

#[test]
fn test_claim_yield_exact_after_warp() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);
    ctx.splitter.split(&user, &T_FAR, &100_0000000);

    // Warp to rate 1.2; released = floor(100/1.0) - ceil(100/1.2) SY.
    ctx.env.ledger().set_timestamp(BASE_TS + 1000);
    let expected = 100_0000000 - 83_3333334; // = 16_6666666
    assert_eq!(ctx.splitter.preview_claimable(&user, &T_FAR), expected);

    let claimed = ctx.splitter.claim_yield(&user, &T_FAR);
    assert_eq!(claimed, expected);
    // The claimed SY landed in the user's SY balance.
    assert_eq!(ctx.sy.balance(&user), expected);
}

#[test]
fn test_claim_twice_second_is_nothing_to_claim() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);
    ctx.splitter.split(&user, &T_FAR, &100_0000000);

    ctx.env.ledger().set_timestamp(BASE_TS + 1000);
    ctx.splitter.claim_yield(&user, &T_FAR);
    // Immediately claiming again (same ledger) has nothing new.
    let result = ctx.splitter.try_claim_yield(&user, &T_FAR);
    assert_eq!(result, Err(Ok(SplitterError::NothingToClaim)));
}

#[test]
fn test_yield_stops_at_maturity() {
    let ctx = setup();
    let maturity = BASE_TS + 2000; // rate 1.4 at maturity
    ctx.splitter.create_maturity(&maturity);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);
    ctx.splitter.split(&user, &maturity, &100_0000000);

    // At exactly maturity, released = floor(100/1.0) - ceil(100/1.4).
    ctx.env.ledger().set_timestamp(maturity);
    let at_maturity = ctx.splitter.preview_claimable(&user, &maturity);
    // Far past maturity — accrual is frozen at the maturity value.
    ctx.env.ledger().set_timestamp(maturity + 5000);
    let long_after = ctx.splitter.preview_claimable(&user, &maturity);
    assert_eq!(at_maturity, long_after);
    assert!(at_maturity > 0);
}

#[test]
fn test_redeem_before_maturity_rejected() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);
    ctx.splitter.split(&user, &T_FAR, &50_0000000);

    let result = ctx.splitter.try_redeem_pt(&user, &T_FAR, &10_0000000);
    assert_eq!(result, Err(Ok(SplitterError::MaturityNotReached)));
}

#[test]
fn test_redeem_pays_fixed_principal_at_maturity_rate() {
    let ctx = setup();
    let maturity = BASE_TS + 2000; // rate 1.4 at maturity
    ctx.splitter.create_maturity(&maturity);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);
    ctx.splitter.split(&user, &maturity, &100_0000000);

    // Move past maturity and redeem all 100 PT.
    ctx.env.ledger().set_timestamp(maturity + 100);
    let sy_out = ctx.splitter.redeem_pt(&user, &maturity, &100_0000000);
    // 100 base units of principal at rate 1.4 = floor(100 / 1.4) SY.
    assert_eq!(sy_out, 71_4285714);
    let (pt, _) = tokens(&ctx, maturity);
    assert_eq!(pt.balance(&user), 0);
}

#[test]
fn test_split_and_claim_events_published() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);

    ctx.splitter.split(&user, &T_FAR, &100_0000000);
    let split_event = Split {
        from: user.clone(),
        maturity: T_FAR,
        sy_in: 100_0000000,
        pt_out: 100_0000000,
    };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.splitter_id),
        [split_event.to_xdr(&ctx.env, &ctx.splitter_id)]
    );

    ctx.env.ledger().set_timestamp(BASE_TS + 1000);
    let claimed = ctx.splitter.claim_yield(&user, &T_FAR);
    let claim_event = YieldClaim {
        from: user,
        maturity: T_FAR,
        sy_out: claimed,
    };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.splitter_id),
        [claim_event.to_xdr(&ctx.env, &ctx.splitter_id)]
    );
}

#[test]
fn test_redeem_twice_rejected() {
    let ctx = setup();
    let maturity = BASE_TS + 2000;
    ctx.splitter.create_maturity(&maturity);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);
    ctx.splitter.split(&user, &maturity, &100_0000000);

    ctx.env.ledger().set_timestamp(maturity + 100);
    ctx.splitter.redeem_pt(&user, &maturity, &100_0000000);
    // No PT left after redeeming it all.
    let result = ctx.splitter.try_redeem_pt(&user, &maturity, &1);
    assert_eq!(result, Err(Ok(SplitterError::InsufficientPt)));
}

#[test]
fn test_partial_redeem_then_remainder() {
    let ctx = setup();
    let maturity = BASE_TS + 2000;
    ctx.splitter.create_maturity(&maturity);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);
    ctx.splitter.split(&user, &maturity, &100_0000000);

    ctx.env.ledger().set_timestamp(maturity + 100);
    let (pt, _) = tokens(&ctx, maturity);
    ctx.splitter.redeem_pt(&user, &maturity, &40_0000000);
    assert_eq!(pt.balance(&user), 60_0000000);
    ctx.splitter.redeem_pt(&user, &maturity, &60_0000000);
    assert_eq!(pt.balance(&user), 0);
}

#[test]
fn test_claim_after_redeem_has_nothing_new() {
    let ctx = setup();
    let maturity = BASE_TS + 2000;
    ctx.splitter.create_maturity(&maturity);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);
    ctx.splitter.split(&user, &maturity, &100_0000000);

    ctx.env.ledger().set_timestamp(maturity + 100);
    // Claim all yield first (frozen at maturity), then redeem.
    ctx.splitter.claim_yield(&user, &maturity);
    ctx.splitter.redeem_pt(&user, &maturity, &100_0000000);
    // Rate is frozen post-maturity, so no further yield accrues.
    let result = ctx.splitter.try_claim_yield(&user, &maturity);
    assert_eq!(result, Err(Ok(SplitterError::NothingToClaim)));
}

#[test]
fn test_one_user_two_maturities_independent() {
    let ctx = setup();
    let m1 = BASE_TS + 2000;
    let m2 = BASE_TS + 5000;
    ctx.splitter.create_maturity(&m1);
    ctx.splitter.create_maturity(&m2);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 200_0000000);

    ctx.splitter.split(&user, &m1, &100_0000000);
    ctx.splitter.split(&user, &m2, &50_0000000);

    let (pt1, _) = tokens(&ctx, m1);
    let (pt2, _) = tokens(&ctx, m2);
    assert_eq!(pt1.balance(&user), 100_0000000);
    assert_eq!(pt2.balance(&user), 50_0000000);
    // Merging one maturity leaves the other untouched.
    ctx.splitter.merge(&user, &m1, &40_0000000);
    assert_eq!(pt1.balance(&user), 60_0000000);
    assert_eq!(pt2.balance(&user), 50_0000000);
}

#[test]
fn test_claim_on_nonexistent_maturity_rejected() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    let result = ctx.splitter.try_claim_yield(&user, &(BASE_TS + 999));
    assert_eq!(result, Err(Ok(SplitterError::MaturityNotFound)));
}

#[test]
fn test_hook_from_unregistered_address_rejected() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let impostor = Address::generate(&ctx.env);
    let user = Address::generate(&ctx.env);
    // An address that is not a registered YT token cannot reach settlement.
    // (On-chain the require_auth that follows the registry lookup additionally
    // guarantees the *caller* is the registered contract itself.)
    let result = ctx
        .splitter
        .try_on_yt_transfer(&impostor, &user, &None, &100_0000000, &0);
    assert_eq!(result, Err(Ok(SplitterError::Unauthorized)));
}
