// Full-lifecycle integration tests driving all three contracts together.
// Amounts use the `<whole>_<7-decimal stroops>` grouping convention.
#![allow(clippy::inconsistent_digit_grouping)]

use crate::test::{fund_sy, setup, TestCtx, BASE_TS};
use soroban_sdk::{testutils::Address as _, testutils::Ledger, Address};

/// Assert the Splitter holds at least the SY it owes across the given
/// positions: `balance(splitter) >= sum(reserve_sy + accrued_sy)`.
fn assert_solvent(ctx: &TestCtx, positions: &[(Address, u64)]) {
    let mut owed: i128 = 0;
    for (addr, maturity) in positions {
        let pos = ctx.splitter.get_position(addr, maturity);
        owed += pos.reserve_sy + pos.accrued_sy;
    }
    let held = ctx.sy.balance(&ctx.splitter_id);
    assert!(held >= owed, "insolvent: held {held} < owed {owed}");
}

#[test]
fn test_full_lifecycle() {
    let ctx = setup();
    let maturity = BASE_TS + 2000; // rate 1.4 at maturity
    ctx.splitter.create_maturity(&maturity);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);

    // Split all 100 SY at rate 1.0.
    ctx.splitter.split(&user, &maturity, &100_0000000);

    // Claim once at rate 1.2 (t0 + 1000s).
    ctx.env.ledger().set_timestamp(BASE_TS + 1000);
    assert_eq!(ctx.splitter.preview_claimable(&user, &maturity), 16_6666666);
    let claim1 = ctx.splitter.claim_yield(&user, &maturity);
    assert_eq!(claim1, 16_6666666);

    // Claim again at maturity (rate 1.4).
    ctx.env.ledger().set_timestamp(maturity);
    let claim2 = ctx.splitter.claim_yield(&user, &maturity);
    assert_eq!(claim2, 11_9047619);

    // Redeem the fixed principal after maturity.
    ctx.env.ledger().set_timestamp(maturity + 100);
    let redeemed = ctx.splitter.redeem_pt(&user, &maturity, &100_0000000);
    assert_eq!(redeemed, 71_4285714);

    // Total SY returned = original minus at most a couple stroops of rounding.
    let total_out = claim1 + claim2 + redeemed;
    assert_eq!(total_out, 99_9999999); // exactly 1 stroop to protocol surplus
    assert_eq!(ctx.sy.balance(&user), 99_9999999);
    // Protocol keeps exactly the rounding dust.
    assert_eq!(ctx.sy.balance(&ctx.splitter_id), 1);
}

#[test]
fn test_two_users_independent_positions() {
    let ctx = setup();
    let maturity = BASE_TS + 5000;
    ctx.splitter.create_maturity(&maturity);
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    fund_sy(&ctx, &alice, 100_0000000);
    fund_sy(&ctx, &bob, 100_0000000);

    // Alice splits at rate 1.0.
    ctx.splitter.split(&alice, &maturity, &100_0000000);

    // Bob splits later, at rate 1.2 — a different entry rate.
    ctx.env.ledger().set_timestamp(BASE_TS + 1000);
    ctx.splitter.split(&bob, &maturity, &100_0000000);

    // Warp further and compare their accrued yield.
    ctx.env.ledger().set_timestamp(BASE_TS + 2000);
    let alice_claimable = ctx.splitter.preview_claimable(&alice, &maturity);
    let bob_claimable = ctx.splitter.preview_claimable(&bob, &maturity);

    // Alice entered earlier (lower rate) so her position released more yield.
    assert!(alice_claimable > bob_claimable);
    assert!(bob_claimable > 0);

    // Claims are independent: Alice claiming doesn't touch Bob's position.
    ctx.splitter.claim_yield(&alice, &maturity);
    assert_eq!(
        ctx.splitter.preview_claimable(&bob, &maturity),
        bob_claimable
    );

    assert_solvent(&ctx, &[(alice, maturity), (bob, maturity)]);
}

#[test]
fn test_solvency_invariant() {
    let ctx = setup();
    let maturity = BASE_TS + 3000;
    ctx.splitter.create_maturity(&maturity);
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    fund_sy(&ctx, &alice, 200_0000000);
    fund_sy(&ctx, &bob, 200_0000000);
    let positions = [(alice.clone(), maturity), (bob.clone(), maturity)];

    // A scripted sequence of every operation, asserting solvency after each.
    ctx.splitter.split(&alice, &maturity, &123_4567891);
    assert_solvent(&ctx, &positions);

    ctx.env.ledger().set_timestamp(BASE_TS + 700);
    ctx.splitter.split(&bob, &maturity, &77_7777777);
    assert_solvent(&ctx, &positions);

    ctx.env.ledger().set_timestamp(BASE_TS + 1500);
    ctx.splitter.merge(&alice, &maturity, &23_4567891);
    assert_solvent(&ctx, &positions);

    ctx.env.ledger().set_timestamp(BASE_TS + 2200);
    ctx.splitter.claim_yield(&alice, &maturity);
    assert_solvent(&ctx, &positions);
    ctx.splitter.claim_yield(&bob, &maturity);
    assert_solvent(&ctx, &positions);

    // After maturity, redeem PT for both.
    ctx.env.ledger().set_timestamp(maturity + 50);
    ctx.splitter.redeem_pt(&alice, &maturity, &100_0000000);
    assert_solvent(&ctx, &positions);
    ctx.splitter.redeem_pt(&bob, &maturity, &77_7777777);
    assert_solvent(&ctx, &positions);
}
