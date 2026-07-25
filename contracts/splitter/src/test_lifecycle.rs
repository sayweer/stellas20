// Full-lifecycle integration tests driving all contracts together — including
// the factory-deployed PT/YT tokens — plus the randomized invariant harness.
// Amounts use the `<whole>_<7-decimal stroops>` grouping convention.
#![allow(clippy::inconsistent_digit_grouping)]

use crate::test::{fund_sy, setup, setup_over_blend, setup_over_mock, tokens, TestCtx, BASE_TS};
use crate::RATE_SCALE;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, MuxedAddress,
};
use std::vec::Vec;

/// Invariant I1, asserted as what users could actually extract right now:
/// the Market's SY holdings must cover every current claim plus the full
/// principal at the effective (maturity-frozen) rate.
/// `held >= Σ preview_claimable(u) + floor(pt_supply·S/R_eff)`.
fn assert_solvent(ctx: &TestCtx, maturity: u64, users: &[&Address]) {
    assert_solvent_across(ctx, &[maturity], users, 0, 0);
}

/// The same check across several maturities at once. The Market holds **one**
/// SY pot for all of them, so with more than one maturity live the liability
/// has to be summed before comparing — checking each maturity against the whole
/// balance would pass even while the pot is double-counted.
/// `seed`/`op_index` are echoed in the failure message so a red run in the slow
/// tier can be replayed directly instead of re-instrumented.
fn assert_solvent_across(
    ctx: &TestCtx,
    maturities: &[u64],
    users: &[&Address],
    seed: u64,
    op_index: usize,
) {
    let held = ctx.sy.balance(&ctx.splitter_id);
    let mut owed: i128 = 0;
    for &maturity in maturities {
        for u in users {
            owed += ctx.splitter.preview_claimable(u, &maturity);
        }
        let totals = ctx.splitter.get_totals(&maturity);
        let t_eff = ctx.env.ledger().timestamp().min(maturity);
        let r_eff = ctx.sy.exchange_rate_at(&t_eff);
        owed += totals.pt_supply * RATE_SCALE / r_eff;
    }
    assert!(
        held >= owed,
        "insolvent [seed {seed:#x} op {op_index}]: held {held} < owed {owed}"
    );
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

    // Claim once at rate 1.2 (t0 + 1000s): floor(100/1.0) - ceil(100/1.2).
    ctx.env.ledger().set_timestamp(BASE_TS + 1000);
    assert_eq!(ctx.splitter.preview_claimable(&user, &maturity), 16_6666666);
    let claim1 = ctx.splitter.claim_yield(&user, &maturity);
    assert_eq!(claim1, 16_6666666);

    // Claim again at maturity (rate 1.4): floor(100/1.2) - ceil(100/1.4).
    ctx.env.ledger().set_timestamp(maturity);
    let claim2 = ctx.splitter.claim_yield(&user, &maturity);
    assert_eq!(claim2, 11_9047618);

    // Redeem the fixed principal after maturity.
    ctx.env.ledger().set_timestamp(maturity + 100);
    let redeemed = ctx.splitter.redeem_pt(&user, &maturity, &100_0000000);
    assert_eq!(redeemed, 71_4285714);

    // Total SY returned = original minus the rounding dust (each settlement
    // floors the entitlement and ceils the retained backing).
    let total_out = claim1 + claim2 + redeemed;
    assert_eq!(total_out, 99_9999998); // exactly 2 stroops to protocol surplus
    assert_eq!(ctx.sy.balance(&user), 99_9999998);
    // Protocol keeps exactly the rounding dust.
    assert_eq!(ctx.sy.balance(&ctx.splitter_id), 2);
}

/// The headline v1 scenario: a YT transfer mid-accrual settles both parties,
/// each earns exactly their own rate window, and PT redeems independently.
#[test]
fn test_yt_transfer_settles_both_parties_exactly() {
    let ctx = setup();
    let maturity = BASE_TS + 2000; // rate 1.4 at maturity
    ctx.splitter.create_maturity(&maturity);
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    fund_sy(&ctx, &a, 100_0000000);

    // A splits 100 SY at rate 1.0 -> 100 PT + 100 YT, index_A = 1.0.
    ctx.splitter.split(&a, &maturity, &100_0000000);

    // At rate 1.2, A transfers half the YT to B. The hook settles BOTH:
    //   A: released = floor(100/1.0) - ceil(100/1.2) = 16_6666666 (accrued),
    //      index_A -> 1.2 — the pre-transfer yield stays with A.
    //   B: first touch at index 1.2 — B earns only from here on.
    ctx.env.ledger().set_timestamp(BASE_TS + 1000);
    let (_, yt) = tokens(&ctx, maturity);
    yt.transfer(&a, MuxedAddress::from(&b), &50_0000000);

    let a_state = ctx.splitter.get_user_yield(&a, &maturity);
    assert_eq!(a_state.accrued_sy, 16_6666666);
    assert_eq!(a_state.index, 1_200_000_000_000);
    let b_state = ctx.splitter.get_user_yield(&b, &maturity);
    assert_eq!(b_state.accrued_sy, 0);
    assert_eq!(b_state.index, 1_200_000_000_000);
    assert_solvent(&ctx, maturity, &[&a, &b]);

    // At maturity (rate 1.4) both claim. Identical halves over the identical
    // 1.2 -> 1.4 window release identically: floor(50/1.2) - ceil(50/1.4).
    ctx.env.ledger().set_timestamp(maturity);
    let window_release = 41_6666666 - 35_7142858; // = 5_9523808
    let a_claim = ctx.splitter.claim_yield(&a, &maturity);
    assert_eq!(a_claim, 16_6666666 + window_release);
    let b_claim = ctx.splitter.claim_yield(&b, &maturity);
    assert_eq!(b_claim, window_release);

    // A still holds all 100 PT and redeems the fixed principal at R_T.
    ctx.env.ledger().set_timestamp(maturity + 100);
    let redeemed = ctx.splitter.redeem_pt(&a, &maturity, &100_0000000);
    assert_eq!(redeemed, 71_4285714);

    // Everything is settled and frozen — nobody has anything left to claim.
    assert!(ctx.splitter.try_claim_yield(&a, &maturity).is_err());
    assert!(ctx.splitter.try_claim_yield(&b, &maturity).is_err());

    // Conservation: 100 SY in, 99_9999996 out, 4 stroops of dust retained.
    let total_out = a_claim + b_claim + redeemed;
    assert_eq!(total_out, 99_9999996);
    assert_eq!(ctx.sy.balance(&ctx.splitter_id), 4);
    assert_solvent(&ctx, maturity, &[&a, &b]);
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

    // Bob splits later, at rate 1.2 — a different entry index.
    ctx.env.ledger().set_timestamp(BASE_TS + 1000);
    ctx.splitter.split(&bob, &maturity, &100_0000000);

    // Warp further and compare their accrued yield.
    ctx.env.ledger().set_timestamp(BASE_TS + 2000);
    let alice_claimable = ctx.splitter.preview_claimable(&alice, &maturity);
    let bob_claimable = ctx.splitter.preview_claimable(&bob, &maturity);

    // Alice entered earlier (lower index) so her position released more yield.
    assert!(alice_claimable > bob_claimable);
    assert!(bob_claimable > 0);

    // Claims are independent: Alice claiming doesn't touch Bob's state.
    ctx.splitter.claim_yield(&alice, &maturity);
    assert_eq!(
        ctx.splitter.preview_claimable(&bob, &maturity),
        bob_claimable
    );

    assert_solvent(&ctx, maturity, &[&alice, &bob]);
}

#[test]
fn test_solvency_invariant_scripted() {
    scripted_solvency(setup_over_mock());
}

/// Every invariant the Market relies on is a property of the SY *interface*,
/// not of the mock behind it — so the same script has to survive a real
/// Blend-backed vault, where shares are bTokens and the rate comes from a
/// lending pool (Phase 6 DoD).
#[test]
fn test_solvency_invariant_scripted_over_blend() {
    scripted_solvency(setup_over_blend());
}

fn scripted_solvency(ctx: TestCtx) {
    let maturity = BASE_TS + 3000;
    ctx.splitter.create_maturity(&maturity);
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    fund_sy(&ctx, &alice, 200_0000000);
    fund_sy(&ctx, &bob, 200_0000000);
    let users: [&Address; 2] = [&alice, &bob];

    // A scripted sequence of every operation, asserting solvency after each —
    // including the new YT transfer.
    ctx.splitter.split(&alice, &maturity, &123_4567891);
    assert_solvent(&ctx, maturity, &users);

    ctx.env.ledger().set_timestamp(BASE_TS + 700);
    ctx.splitter.split(&bob, &maturity, &77_7777777);
    assert_solvent(&ctx, maturity, &users);

    ctx.env.ledger().set_timestamp(BASE_TS + 1100);
    let (_, yt) = tokens(&ctx, maturity);
    yt.transfer(&alice, MuxedAddress::from(&bob), &41_4141414);
    assert_solvent(&ctx, maturity, &users);

    ctx.env.ledger().set_timestamp(BASE_TS + 1500);
    ctx.splitter.merge(&alice, &maturity, &23_4567891);
    assert_solvent(&ctx, maturity, &users);

    ctx.env.ledger().set_timestamp(BASE_TS + 2200);
    ctx.splitter.claim_yield(&alice, &maturity);
    assert_solvent(&ctx, maturity, &users);
    ctx.splitter.claim_yield(&bob, &maturity);
    assert_solvent(&ctx, maturity, &users);

    // After maturity, redeem what each still holds.
    ctx.env.ledger().set_timestamp(maturity + 50);
    let (pt, _) = tokens(&ctx, maturity);
    let alice_pt = pt.balance(&alice);
    let bob_pt = pt.balance(&bob);
    ctx.splitter.redeem_pt(&alice, &maturity, &alice_pt);
    assert_solvent(&ctx, maturity, &users);
    ctx.splitter.redeem_pt(&bob, &maturity, &bob_pt);
    assert_solvent(&ctx, maturity, &users);
}

// -- randomized op-sequence harness (invariants I1/I2 under fire) --

/// Deterministic xorshift64 — no external RNG dependency, reproducible seeds.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    /// Uniform-ish in [0, n).
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }

    /// A random amount in [1, max], or 0 if max <= 0.
    fn amount(&mut self, max: i128) -> i128 {
        if max <= 0 {
            return 0;
        }
        1 + (self.below(max as u64)) as i128
    }

    /// As `amount`, but with a deliberate bias towards the values that actually
    /// break rounding: a few stroops of dust, and the exact balance. A uniform
    /// draw over a 100-SY range picks 1 stroop with probability ~1e-9, so
    /// without this the harness never visits the interesting end of the range.
    fn biased_amount(&mut self, max: i128, dust_every: u64) -> i128 {
        if max <= 0 {
            return 0;
        }
        if dust_every > 0 {
            match self.below(dust_every) {
                0 => return (1 + self.below(3) as i128).min(max),
                1 => return max,
                _ => {}
            }
        }
        self.amount(max)
    }
}

/// Knobs for the randomized harness.
///
/// `fast()` is what CI runs on every push; `adversarial()` turns on the levers
/// that make sequences nasty at a size CI can still afford; `slow()` is the
/// `#[ignore]`d deep tier (`cargo test --release -- --ignored`).
pub struct HarnessCfg {
    pub ops: usize,
    pub users: usize,
    pub maturities: usize,
    /// Cap on a single split, in stroops.
    pub split_cap: i128,
    /// 1-in-N chance an amount is dust or an exact balance. 0 disables.
    pub dust_every: u64,
    /// Upper bound on how many 60s ticks a time warp advances.
    pub max_step_ticks: u64,
    /// 1-in-N chance a warp lands exactly on `T-1`, `T` or `T+1`. 0 disables.
    pub boundary_every: u64,
    /// 1-in-N chance the yield curve is re-based mid-sequence. 0 disables.
    pub rate_change_every: u64,
}

impl HarnessCfg {
    fn fast() -> Self {
        Self {
            ops: 200,
            users: 3,
            maturities: 1,
            split_cap: 100_0000000,
            dust_every: 0,
            max_step_ticks: 30,
            boundary_every: 0,
            rate_change_every: 0,
        }
    }

    fn adversarial() -> Self {
        Self {
            ops: 150,
            users: 3,
            maturities: 2,
            split_cap: 100_0000000,
            dust_every: 3,
            max_step_ticks: 30,
            boundary_every: 5,
            rate_change_every: 11,
        }
    }

    fn slow() -> Self {
        Self {
            ops: 4000,
            users: 5,
            maturities: 3,
            split_cap: 100_0000000,
            dust_every: 3,
            max_step_ticks: 40,
            boundary_every: 7,
            rate_change_every: 13,
        }
    }
}

/// Random ops (split / merge / claim / YT transfer / redeem / time warp)
/// against one maturity with three users; after every op assert solvency
/// (I1) and, pre-maturity, PT/YT supply equality (I2). Expected-failure ops
/// (over-balance, wrong phase) go through try_ and are ignored — the point
/// is that no sequence, valid or sloppy, can break the invariants.
fn run_harness(seed: u64, cfg: HarnessCfg) {
    run_harness_over(setup_over_mock(), seed, cfg);
}

fn run_harness_over(ctx: TestCtx, seed: u64, cfg: HarnessCfg) {
    // The factory-deployed tokens execute as real wasm; lift the test budget
    // so a long randomized sequence can't spuriously run out of gas.
    ctx.env.cost_estimate().budget().reset_unlimited();

    // Staggered maturities so a single run spans "all live", "some settled"
    // and "all settled" without needing a separate test for each phase.
    let maturities: Vec<u64> = (0..cfg.maturities)
        .map(|i| BASE_TS + 10_000 + (i as u64) * 7_000)
        .collect();
    for m in &maturities {
        ctx.splitter.create_maturity(m);
    }

    let users: Vec<Address> = (0..cfg.users)
        .map(|_| Address::generate(&ctx.env))
        .collect();
    for u in &users {
        fund_sy(&ctx, u, 500_0000000);
    }
    let user_refs: Vec<&Address> = users.iter().collect();
    let markets: Vec<(u64, _, _)> = maturities
        .iter()
        .map(|&m| {
            let (pt, yt) = tokens(&ctx, m);
            (m, pt, yt)
        })
        .collect();

    let mut rng = Rng(seed);
    let n_users = cfg.users as u64;
    let n_markets = markets.len() as u64;

    for op_index in 0..cfg.ops {
        let actor = &users[rng.below(n_users) as usize];
        let (maturity, pt, yt) = &markets[rng.below(n_markets) as usize];
        let maturity = *maturity;

        match rng.below(7) {
            0 => {
                let max = ctx.sy.balance(actor).min(cfg.split_cap);
                let amt = rng.biased_amount(max, cfg.dust_every);
                if amt > 0 {
                    let _ = ctx.splitter.try_split(actor, &maturity, &amt);
                }
            }
            1 => {
                let max = pt.balance(actor).min(yt.balance(actor));
                let amt = rng.biased_amount(max, cfg.dust_every);
                if amt > 0 {
                    let _ = ctx.splitter.try_merge(actor, &maturity, &amt);
                }
            }
            2 => {
                let _ = ctx.splitter.try_claim_yield(actor, &maturity);
            }
            3 => {
                let to = &users[rng.below(n_users) as usize];
                let amt = rng.biased_amount(yt.balance(actor), cfg.dust_every);
                if amt > 0 && to != actor {
                    let _ = yt.try_transfer(actor, MuxedAddress::from(to), &amt);
                }
            }
            4 => {
                let amt = rng.biased_amount(pt.balance(actor), cfg.dust_every);
                if amt > 0 {
                    let _ = ctx.splitter.try_redeem_pt(actor, &maturity, &amt);
                }
            }
            5 => {
                // PT moves between holders too. The Market has no hook on PT
                // (only YT carries the yield stream), so this must be a pure
                // balance move that changes nothing about solvency.
                let to = &users[rng.below(n_users) as usize];
                let amt = rng.biased_amount(pt.balance(actor), cfg.dust_every);
                if amt > 0 && to != actor {
                    let _ = pt.try_transfer(actor, MuxedAddress::from(to), &amt);
                }
            }
            _ => {
                let now = ctx.env.ledger().timestamp();
                let land_on_boundary = cfg.boundary_every > 0 && rng.below(cfg.boundary_every) == 0;
                if land_on_boundary {
                    // Every ordinary warp is a multiple of 60s from BASE_TS, so
                    // the plain path can never land on a maturity: with
                    // T - BASE_TS = 10_000 and 10_000 % 60 == 40, the exact
                    // `now == T` branch would otherwise be dead code.
                    let target = maturities[rng.below(n_markets) as usize];
                    let offset = rng.below(3);
                    let ts = target + offset - 1;
                    if ts > now {
                        ctx.env.ledger().set_timestamp(ts);
                    }
                } else {
                    ctx.env
                        .ledger()
                        .set_timestamp(now + 60 * (1 + rng.below(cfg.max_step_ticks)));
                }
            }
        }

        // Re-base the yield curve occasionally: a constant slope for a whole
        // run never exercises a rate that changes gradient mid-position, and on
        // the Blend source it never fires the monotonicity ratchet.
        if cfg.rate_change_every > 0 && rng.below(cfg.rate_change_every) == 0 {
            let slope = (rng.below(4) as i128) * 100_000_000;
            let bps = 9_500 + rng.below(1_500);
            ctx.rebase_rate(slope, bps);
        }

        // I1 after every single op, summed over every live maturity.
        assert_solvent_across(&ctx, &maturities, &user_refs, seed, op_index);
        // I2 pre-maturity: split/merge always move PT and YT together.
        for (m, _, _) in &markets {
            if ctx.env.ledger().timestamp() < *m {
                let totals = ctx.splitter.get_totals(m);
                assert_eq!(
                    totals.pt_supply, totals.yt_supply,
                    "I2 broken [seed {seed:#x} op {op_index}]"
                );
            }
        }
    }
}

// -- fast tier: runs in CI on every push --

#[test]
fn test_harness_seed_1() {
    run_harness(0x5EED_0001, HarnessCfg::fast());
}

#[test]
fn test_harness_seed_2() {
    run_harness(0x5EED_0002, HarnessCfg::fast());
}

#[test]
fn test_harness_seed_3() {
    run_harness(0x5EED_0003, HarnessCfg::fast());
}

#[test]
fn test_harness_seed_1_over_blend() {
    run_harness_over(setup_over_blend(), 0x5EED_0001, HarnessCfg::fast());
}

#[test]
fn test_harness_seed_2_over_blend() {
    run_harness_over(setup_over_blend(), 0x5EED_0002, HarnessCfg::fast());
}

#[test]
fn test_harness_adversarial_mock() {
    run_harness(0x5EED_00A1, HarnessCfg::adversarial());
}

#[test]
fn test_harness_adversarial_over_blend() {
    run_harness_over(setup_over_blend(), 0x5EED_00A2, HarnessCfg::adversarial());
}

// -- slow tier: `cargo test --release -- --ignored` (see README) --

#[test]
#[ignore = "slow tier: cargo test --release -- --ignored"]
fn test_harness_deep_mock() {
    for seed in [0x5EED_1001u64, 0x5EED_1002, 0x5EED_1003, 0x5EED_1004] {
        run_harness(seed, HarnessCfg::slow());
    }
}

#[test]
#[ignore = "slow tier: cargo test --release -- --ignored"]
fn test_harness_deep_over_blend() {
    for seed in [0x5EED_2001u64, 0x5EED_2002] {
        run_harness_over(setup_over_blend(), seed, HarnessCfg::slow());
    }
}

/// I4 over the Blend vault: yield accrual stops dead at maturity and the
/// principal redeems at the rate the vault froze there, however long after the
/// fact the holder shows up.
#[test]
fn test_maturity_rate_frozen_over_blend() {
    let ctx = setup_over_blend();
    let maturity = BASE_TS + 2000;
    ctx.splitter.create_maturity(&maturity);
    let user = Address::generate(&ctx.env);
    fund_sy(&ctx, &user, 100_0000000);
    ctx.splitter.split(&user, &maturity, &100_0000000);

    ctx.env.ledger().set_timestamp(maturity + 10);
    let claimable_at_maturity = ctx.splitter.preview_claimable(&user, &maturity);
    let (pt, _) = tokens(&ctx, maturity);
    let pt_balance = pt.balance(&user);

    // Long after maturity, with the live rate far higher, nothing has moved.
    ctx.env.ledger().set_timestamp(maturity + 500_000);
    assert_eq!(
        ctx.splitter.preview_claimable(&user, &maturity),
        claimable_at_maturity,
        "I4: YT accrual must freeze at maturity"
    );
    let redeemed = ctx.splitter.redeem_pt(&user, &maturity, &pt_balance);
    let claimed = ctx.splitter.claim_yield(&user, &maturity);
    assert_eq!(claimed, claimable_at_maturity);
    // Everything the position was ever worth comes back, minus rounding dust.
    assert!(redeemed + claimed <= 100_0000000);
    assert!(100_0000000 - (redeemed + claimed) <= 2);
}
