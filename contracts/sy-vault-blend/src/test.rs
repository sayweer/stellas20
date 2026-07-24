// Amounts are written as `<whole>_<7-decimal stroops>` to make the decimal
// boundary legible in a Stellar context; that grouping is intentional.
#![allow(clippy::inconsistent_digit_grouping)]

use crate::mock_pool::{MockBlendPool, MockBlendPoolClient};
use crate::{SyBlendError, SyVaultBlend, SyVaultBlendClient, Unwrap, Wrap, RATE_SCALE};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    token, Address, Env, Event, MuxedAddress, String,
};

const BASE_TS: u64 = 1_700_000_000;
/// 2.0 — a wrap of 100 underlying mints exactly 50 SY.
const INITIAL_RATE: i128 = 2 * RATE_SCALE;
/// +0.0005/s: after 1000s the rate is 2.5.
const SLOPE: i128 = 500_000_000;
/// Interest the pool pays out beyond what was supplied has to come from
/// somewhere; on a real pool it comes from borrowers.
const POOL_BUFFER: i128 = 1_000_000_0000000;

struct Ctx {
    env: Env,
    asset: Address,
    minter: token::StellarAssetClient<'static>,
    token: token::TokenClient<'static>,
    pool: MockBlendPoolClient<'static>,
    vault: SyVaultBlendClient<'static>,
    vault_id: Address,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(BASE_TS);

    let admin = Address::generate(&env);
    let asset = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let pool_id = env.register(MockBlendPool, (asset.clone(), 0u32, INITIAL_RATE, SLOPE));
    let vault_id = env.register(
        SyVaultBlend,
        (
            admin.clone(),
            pool_id.clone(),
            asset.clone(),
            String::from_str(&env, "Standardized Yield Blend XLM"),
            String::from_str(&env, "SY-bXLM"),
        ),
    );

    let minter = token::StellarAssetClient::new(&env, &asset);
    minter.mint(&pool_id, &POOL_BUFFER);

    let token = token::TokenClient::new(&env, &asset);
    let pool = MockBlendPoolClient::new(&env, &pool_id);
    let vault = SyVaultBlendClient::new(&env, &vault_id);

    Ctx {
        env,
        asset,
        minter,
        token,
        pool,
        vault,
        vault_id,
    }
}

/// A funded user holding `amount` of the underlying.
fn user_with(ctx: &Ctx, amount: i128) -> Address {
    let user = Address::generate(&ctx.env);
    ctx.minter.mint(&user, &amount);
    user
}

/// The vault's core solvency law: its Blend position always covers every SY
/// share outstanding (exits floor the payout and ceil the burn, so the dust
/// stays in the position).
fn assert_backed(ctx: &Ctx) {
    assert!(
        ctx.vault.position() >= ctx.vault.total_supply(),
        "position {} < SY supply {}",
        ctx.vault.position(),
        ctx.vault.total_supply()
    );
}

// -- scale fixture (the guard against a silent fixed-point mistake) --

/// Pinned to the live testnet numbers in `docs/plan/blend-notes.md` §3:
/// supplying 100.0000000 XLM at `b_rate = 1_613_236_390_974` minted
/// 619_870_358 bXLM on chain. The rate ticked up a few units between the read
/// and the transaction, so the match is asserted within a tight tolerance
/// rather than exactly — plenty to catch a wrong scale, which would be off by
/// orders of magnitude, while staying honest about what was observed.
#[test]
fn test_b_rate_scale_fixture() {
    let b_rate: i128 = 1_613_236_390_974;
    let supplied: i128 = 1_000_000_000;
    let observed: i128 = 619_870_358;

    let minted = supplied * RATE_SCALE / b_rate;
    assert_eq!(minted, 619_871_957, "scale is 1e12, same as RATE_SCALE");
    assert!(
        (minted - observed).abs() < minted / 100_000,
        "minted {minted} is not within 0.001% of the on-chain {observed}"
    );
    // Converting back always floors — a round trip can never gain value.
    assert!(minted * b_rate / RATE_SCALE <= supplied);
}

// -- wrap / unwrap --

#[test]
fn test_wrap_mints_btokens_at_the_pool_rate() {
    let ctx = setup();
    let user = user_with(&ctx, 100_0000000);

    let sy = ctx.vault.wrap(&user, &100_0000000);

    // rate 2.0: 100 underlying is worth 50 bTokens.
    assert_eq!(sy, 50_0000000);
    assert_eq!(ctx.vault.balance(&user), 50_0000000);
    assert_eq!(ctx.vault.total_supply(), 50_0000000);
    assert_eq!(ctx.vault.position(), 50_0000000);
    // The pool pulled the underlying straight from the user; the vault holds none.
    assert_eq!(ctx.token.balance(&user), 0);
    assert_eq!(ctx.token.balance(&ctx.vault_id), 0);
    assert_backed(&ctx);
}

#[test]
fn test_wrap_after_yield_mints_fewer_shares() {
    let ctx = setup();
    let early = user_with(&ctx, 100_0000000);
    let late = user_with(&ctx, 100_0000000);

    ctx.vault.wrap(&early, &100_0000000);
    ctx.env.ledger().set_timestamp(BASE_TS + 1000); // rate 2.5
    ctx.vault.wrap(&late, &100_0000000);

    assert_eq!(ctx.vault.balance(&early), 50_0000000);
    assert_eq!(ctx.vault.balance(&late), 40_0000000);
    // Same shares, more value: the early wrapper's 50 SY is now worth 125.
    assert_eq!(ctx.vault.exchange_rate(), 2_500_000_000_000);
    assert_backed(&ctx);
}

#[test]
fn test_unwrap_pays_underlying_including_accrued_yield() {
    let ctx = setup();
    let user = user_with(&ctx, 100_0000000);
    ctx.vault.wrap(&user, &100_0000000);

    ctx.env.ledger().set_timestamp(BASE_TS + 1000); // rate 2.5
    let remaining = ctx.vault.unwrap(&user, &50_0000000);

    assert_eq!(remaining, 0);
    // 50 SY * 2.5 = 125 underlying — 25 of it is Blend interest.
    assert_eq!(ctx.token.balance(&user), 125_0000000);
    assert_eq!(ctx.vault.total_supply(), 0);
    assert_backed(&ctx);
}

#[test]
fn test_unwrap_partial_keeps_the_rest_invested() {
    let ctx = setup();
    let user = user_with(&ctx, 100_0000000);
    ctx.vault.wrap(&user, &100_0000000);

    let remaining = ctx.vault.unwrap(&user, &20_0000000);

    assert_eq!(remaining, 30_0000000);
    assert_eq!(ctx.token.balance(&user), 40_0000000); // 20 SY * 2.0
    assert_eq!(ctx.vault.total_supply(), 30_0000000);
    assert_backed(&ctx);
}

/// The rounding law at the vault boundary: a wrap/unwrap round trip never
/// returns more than went in, and the dust it leaves behind stays inside the
/// Blend position rather than being mintable by anyone.
#[test]
fn test_roundtrip_never_returns_more_than_deposited() {
    let ctx = setup();
    ctx.pool.set_rate(&1_613_236_390_974, &0); // an awkward, real-world rate
    let user = user_with(&ctx, 100_0000000);

    let sy = ctx.vault.wrap(&user, &100_0000000);
    ctx.vault.unwrap(&user, &sy);

    assert!(ctx.token.balance(&user) <= 100_0000000);
    assert!(100_0000000 - ctx.token.balance(&user) <= 2, "dust is bounded");
    assert_eq!(ctx.vault.total_supply(), 0);
    assert_backed(&ctx);
}

#[test]
fn test_wrap_rejects_non_positive_amount() {
    let ctx = setup();
    let user = user_with(&ctx, 100_0000000);

    assert_eq!(
        ctx.vault.try_wrap(&user, &0),
        Err(Ok(SyBlendError::InvalidAmount))
    );
    assert_eq!(
        ctx.vault.try_wrap(&user, &-5),
        Err(Ok(SyBlendError::InvalidAmount))
    );
}

#[test]
fn test_unwrap_more_than_balance_rejected() {
    let ctx = setup();
    let user = user_with(&ctx, 100_0000000);
    ctx.vault.wrap(&user, &100_0000000);

    assert_eq!(
        ctx.vault.try_unwrap(&user, &50_0000001),
        Err(Ok(SyBlendError::InsufficientBalance))
    );
    assert_eq!(ctx.vault.balance(&user), 50_0000000);
}

// -- 6.2: withdrawal liquidity honesty --

/// A fully utilized Blend reserve cannot pay out. That has to reach the user as
/// its own message, not as a generic "transaction failed".
#[test]
fn test_unwrap_on_illiquid_pool_maps_to_liquidity_error() {
    let ctx = setup();
    let user = user_with(&ctx, 100_0000000);
    ctx.vault.wrap(&user, &100_0000000);

    ctx.pool.set_illiquid(&true);
    assert_eq!(
        ctx.vault.try_unwrap(&user, &10_0000000),
        Err(Ok(SyBlendError::LiquidityUnavailable))
    );

    // Nothing was consumed: the failed sub-invocation rolled back with the call.
    assert_eq!(ctx.vault.balance(&user), 50_0000000);

    // ...and the position is exitable again once the pool has liquidity.
    ctx.pool.set_illiquid(&false);
    ctx.vault.unwrap(&user, &10_0000000);
    assert_eq!(ctx.vault.balance(&user), 40_0000000);
}

/// Any other pool failure stays a *different* error — the liquidity message is
/// never used as a catch-all.
#[test]
fn test_other_pool_failures_are_not_reported_as_liquidity() {
    let ctx = setup();
    let user = user_with(&ctx, 100_0000000);

    // More underlying than the user owns: the pool's token transfer fails.
    assert_eq!(
        ctx.vault.try_wrap(&user, &200_0000000),
        Err(Ok(SyBlendError::PoolCallFailed))
    );
}

// -- exchange rate: monotonicity and the frozen past --

#[test]
fn test_exchange_rate_tracks_b_rate() {
    let ctx = setup();
    assert_eq!(ctx.vault.exchange_rate(), INITIAL_RATE);

    ctx.env.ledger().set_timestamp(BASE_TS + 600);
    assert_eq!(ctx.vault.exchange_rate(), 2_300_000_000_000);
}

/// MASTERPLAN §3.2 makes a non-decreasing rate binding for every SY source.
/// Blend's `b_rate` is non-decreasing in practice; the vault makes it so by
/// construction, so a source-side hiccup can never rewind settled accounting.
#[test]
fn test_exchange_rate_never_moves_backwards() {
    let ctx = setup();
    ctx.env.ledger().set_timestamp(BASE_TS + 1000);
    let high = ctx.vault.exchange_rate();
    assert_eq!(high, 2_500_000_000_000);

    ctx.pool.set_rate(&(RATE_SCALE * 2), &0); // the pool dips back to 2.0
    assert_eq!(ctx.vault.exchange_rate(), high);
}

/// I4's foundation: once a past timestamp has been looked up, its rate is
/// pinned forever — which is what freezes a matured market's settlement.
#[test]
fn test_exchange_rate_at_freezes_a_past_timestamp() {
    let ctx = setup();
    let maturity = BASE_TS + 1000;

    // Before maturity the "past" rate is simply the live one.
    ctx.env.ledger().set_timestamp(maturity - 1);
    assert_eq!(ctx.vault.exchange_rate_at(&maturity), 2_499_500_000_000);

    // First lookup after maturity pins R_T...
    ctx.env.ledger().set_timestamp(maturity + 10);
    let r_t = ctx.vault.exchange_rate_at(&maturity);
    assert_eq!(r_t, 2_505_000_000_000);

    // ...and it stays put however far the live rate runs on.
    ctx.env.ledger().set_timestamp(maturity + 100_000);
    assert_eq!(ctx.vault.exchange_rate_at(&maturity), r_t);
    assert!(ctx.vault.exchange_rate() > r_t);
}

#[test]
fn test_exchange_rate_at_future_is_live() {
    let ctx = setup();
    assert_eq!(
        ctx.vault.exchange_rate_at(&(BASE_TS + 10_000)),
        ctx.vault.exchange_rate()
    );
}

// -- SEP-41 surface --

#[test]
fn test_transfer_and_allowance_flow() {
    let ctx = setup();
    let alice = user_with(&ctx, 100_0000000);
    let bob = Address::generate(&ctx.env);
    let spender = Address::generate(&ctx.env);
    ctx.vault.wrap(&alice, &100_0000000);

    ctx.vault
        .transfer(&alice, MuxedAddress::from(&bob), &10_0000000);
    assert_eq!(ctx.vault.balance(&alice), 40_0000000);
    assert_eq!(ctx.vault.balance(&bob), 10_0000000);

    ctx.vault
        .approve(&alice, &spender, &5_0000000, &(ctx.env.ledger().sequence() + 100));
    assert_eq!(ctx.vault.allowance(&alice, &spender), 5_0000000);
    ctx.vault
        .transfer_from(&spender, &alice, &bob, &5_0000000);
    assert_eq!(ctx.vault.balance(&bob), 15_0000000);
    assert_eq!(ctx.vault.allowance(&alice, &spender), 0);
}

#[test]
fn test_metadata_comes_from_the_constructor() {
    let ctx = setup();
    assert_eq!(ctx.vault.decimals(), 7);
    assert_eq!(
        ctx.vault.symbol(),
        String::from_str(&ctx.env, "SY-bXLM")
    );
    assert_eq!(ctx.vault.underlying(), ctx.asset);
}

/// Burning forfeits the claim; the backing bTokens stay in the position as
/// protocol surplus rather than being silently withdrawn.
#[test]
fn test_burn_leaves_the_position_untouched() {
    let ctx = setup();
    let user = user_with(&ctx, 100_0000000);
    ctx.vault.wrap(&user, &100_0000000);

    ctx.vault.burn(&user, &10_0000000);

    assert_eq!(ctx.vault.balance(&user), 40_0000000);
    assert_eq!(ctx.vault.total_supply(), 40_0000000);
    assert_eq!(ctx.vault.position(), 50_0000000);
    assert_backed(&ctx);
}

// -- events --

#[test]
fn test_wrap_and_unwrap_events_published() {
    let ctx = setup();
    let user = user_with(&ctx, 100_0000000);

    ctx.vault.wrap(&user, &100_0000000);
    let wrap_event = Wrap {
        from: user.clone(),
        asset_in: 100_0000000,
        sy_out: 50_0000000,
        new_total_supply: 50_0000000,
    };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.vault_id),
        [wrap_event.to_xdr(&ctx.env, &ctx.vault_id)]
    );

    ctx.vault.unwrap(&user, &20_0000000);
    let unwrap_event = Unwrap {
        from: user,
        sy_in: 20_0000000,
        asset_out: 40_0000000,
        new_total_supply: 30_0000000,
    };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.vault_id),
        [unwrap_event.to_xdr(&ctx.env, &ctx.vault_id)]
    );
}
