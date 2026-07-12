// Amounts are written as `<whole>_<7-decimal stroops>` to make the decimal
// boundary legible in a Stellar context; that grouping is intentional.
#![allow(clippy::inconsistent_digit_grouping)]

use crate::{Split, Splitter, SplitterClient, SplitterError, YieldClaim};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    Address, Env, Event,
};
use stellas_mock_yield_token::{MockYieldToken, MockYieldTokenClient, RATE_SCALE};
use stellas_sy_vault::{SyVault, SyVaultClient};

pub const BASE_TS: u64 = 1_700_000_000;
pub const INITIAL_RATE: i128 = RATE_SCALE; // 1.0
pub const SLOPE: i128 = 200_000_000; // +0.0002/s
pub const T_FAR: u64 = BASE_TS + 100_000; // maturity far in the future

pub struct TestCtx {
    pub env: Env,
    pub admin: Address,
    pub myt: MockYieldTokenClient<'static>,
    pub sy: SyVaultClient<'static>,
    pub splitter: SplitterClient<'static>,
    pub splitter_id: Address,
}

pub fn setup() -> TestCtx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(BASE_TS);

    let admin = Address::generate(&env);

    let myt_id = env.register(MockYieldToken, (admin.clone(), INITIAL_RATE, SLOPE));
    let myt = MockYieldTokenClient::new(&env, &myt_id);

    let sy_id = env.register(SyVault, (admin.clone(), myt_id.clone()));
    let sy = SyVaultClient::new(&env, &sy_id);

    let splitter_id = env.register(Splitter, (admin.clone(), sy_id.clone()));
    let splitter = SplitterClient::new(&env, &splitter_id);

    TestCtx {
        env,
        admin,
        myt,
        sy,
        splitter,
        splitter_id,
    }
}

/// Give `who` `amount` SY: faucet the underlying, then wrap it 1:1.
pub fn fund_sy(ctx: &TestCtx, who: &Address, amount: i128) {
    ctx.myt.faucet(who, &amount);
    ctx.sy.wrap(who, &amount);
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
fn test_split_mints_equal_pt_yt() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);

    let pt_out = ctx.splitter.split(&user, &T_FAR, &100_0000000);
    // At rate 1.0, 100 SY -> 100 PT + 100 YT.
    assert_eq!(pt_out, 100_0000000);
    let pos = ctx.splitter.get_position(&user, &T_FAR);
    assert_eq!(pos.pt, 100_0000000);
    assert_eq!(pos.yt, 100_0000000);
    assert_eq!(pos.reserve_sy, 100_0000000);
    assert_eq!(pos.accrued_sy, 0);
}

#[test]
fn test_split_amounts_exact_at_known_rate() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);

    // Warp to a rate of exactly 1.2 (t0 + 1000s).
    ctx.env.ledger().set_timestamp(BASE_TS + 1000);
    assert_eq!(ctx.myt.exchange_rate(), 1_200_000_000_000);

    let pt_out = ctx.splitter.split(&user, &T_FAR, &100_0000000);
    // 100 SY * 1.2 = 120 PT/YT; reserve = 120 / 1.2 = 100 SY.
    assert_eq!(pt_out, 120_0000000);
    let pos = ctx.splitter.get_position(&user, &T_FAR);
    assert_eq!(pos.yt, 120_0000000);
    assert_eq!(pos.reserve_sy, 100_0000000);
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
    // Cross-contract proof: SY moved from the user into the Splitter.
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
    let pos = ctx.splitter.get_position(&user, &T_FAR);
    assert_eq!(pos.pt, 0);
    assert_eq!(pos.yt, 0);
}

#[test]
fn test_merge_exceeding_position_rejected() {
    let ctx = setup();
    ctx.splitter.create_maturity(&T_FAR);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);
    ctx.splitter.split(&user, &T_FAR, &30_0000000);

    let result = ctx.splitter.try_merge(&user, &T_FAR, &30_0000001);
    assert_eq!(result, Err(Ok(SplitterError::InsufficientPt)));
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

    // Warp to rate 1.2; released yield = 100 - ceil(100/1.2) SY.
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

    // At exactly maturity, released = 100 - ceil(100/1.4).
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
    // 100 base units of principal at rate 1.4 = floor(100 / 1.4) SY = 71.4285714.
    assert_eq!(sy_out, 71_4285714);
    let pos = ctx.splitter.get_position(&user, &maturity);
    assert_eq!(pos.pt, 0);
}

#[test]
fn test_create_maturity_rejects_non_admin() {
    let ctx = setup();
    ctx.env.mock_auths(&[]);
    assert!(ctx.splitter.try_create_maturity(&T_FAR).is_err());
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
    ctx.splitter.redeem_pt(&user, &maturity, &40_0000000);
    assert_eq!(ctx.splitter.get_position(&user, &maturity).pt, 60_0000000);
    ctx.splitter.redeem_pt(&user, &maturity, &60_0000000);
    assert_eq!(ctx.splitter.get_position(&user, &maturity).pt, 0);
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

    assert_eq!(ctx.splitter.get_position(&user, &m1).pt, 100_0000000);
    assert_eq!(ctx.splitter.get_position(&user, &m2).pt, 50_0000000);
    // Merging one maturity leaves the other untouched.
    ctx.splitter.merge(&user, &m1, &40_0000000);
    assert_eq!(ctx.splitter.get_position(&user, &m1).pt, 60_0000000);
    assert_eq!(ctx.splitter.get_position(&user, &m2).pt, 50_0000000);
}

#[test]
fn test_claim_on_nonexistent_maturity_rejected() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    let result = ctx.splitter.try_claim_yield(&user, &(BASE_TS + 999));
    assert_eq!(result, Err(Ok(SplitterError::MaturityNotFound)));
}
