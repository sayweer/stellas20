// Amounts use the `<whole>_<7-decimal stroops>` grouping convention.
#![allow(clippy::inconsistent_digit_grouping)]

use crate::{
    AmmError, DataKey, MaturityTokens, PtAmm, PtAmmClient, SwapSide, MINIMUM_LIQUIDITY,
    TTL_EXTEND_TO,
};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{storage::Persistent as _, Address as _, Ledger},
    token, Address, Env,
};
use stellas_pt_token::{PtToken, PtTokenClient};

/// A stub Market exposing the two views the AMM consumes: `get_market` and
/// `sy_vault`. Unknown maturities panic, exactly like the real Market's trap,
/// so the AMM's try_-mapping is exercised. (The real-stack integration is
/// proven on testnet in the phase's deploy smoke.)
#[contract]
pub struct MockMarket;

const SY_VAULT_KEY: soroban_sdk::Symbol = soroban_sdk::symbol_short!("syvault");

#[contractimpl]
impl MockMarket {
    pub fn set_market(env: Env, maturity: u64, pt: Address, yt: Address) {
        env.storage()
            .instance()
            .set(&maturity, &MaturityTokens { pt, yt });
    }

    pub fn set_sy_vault(env: Env, sy: Address) {
        env.storage().instance().set(&SY_VAULT_KEY, &sy);
    }

    pub fn get_market(env: Env, maturity: u64) -> MaturityTokens {
        env.storage().instance().get(&maturity).unwrap()
    }

    pub fn sy_vault(env: Env) -> Address {
        env.storage().instance().get(&SY_VAULT_KEY).unwrap()
    }
}

const BASE_TS: u64 = 1_700_000_000;
const MATURITY: u64 = BASE_TS + 100_000;

struct TestCtx {
    env: Env,
    amm: PtAmmClient<'static>,
    amm_id: Address,
    /// SEP-41 clients: the maturity's PT and the SY stand-in.
    pt: token::TokenClient<'static>,
    sy: token::TokenClient<'static>,
    /// Mint handles for funding users.
    pt_mint: PtTokenClient<'static>,
    sy_mint: PtTokenClient<'static>,
}

fn setup() -> TestCtx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(BASE_TS);
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);

    // Two freely-mintable SEP-41 tokens stand in for PT and SY.
    let mk = |sym: &str| {
        let name = soroban_sdk::String::from_str(&env, sym);
        env.register(PtToken, (minter.clone(), name.clone(), name))
    };
    let pt_id = mk("PT-TEST");
    let sy_id = mk("SY-TEST");
    let yt_id = Address::generate(&env); // unused by the AMM

    let market_id = env.register(MockMarket, ());
    let market = MockMarketClient::new(&env, &market_id);
    market.set_market(&MATURITY, &pt_id, &yt_id);
    market.set_sy_vault(&sy_id);

    let amm_id = env.register(PtAmm, (admin.clone(), market_id, sy_id.clone()));
    let amm = PtAmmClient::new(&env, &amm_id);

    TestCtx {
        pt: token::TokenClient::new(&env, &pt_id),
        sy: token::TokenClient::new(&env, &sy_id),
        pt_mint: PtTokenClient::new(&env, &pt_id),
        sy_mint: PtTokenClient::new(&env, &sy_id),
        env,
        amm,
        amm_id,
    }
}

fn fund(ctx: &TestCtx, who: &Address, pt: i128, sy: i128) {
    if pt > 0 {
        ctx.pt_mint.mint(who, &pt);
    }
    if sy > 0 {
        ctx.sy_mint.mint(who, &sy);
    }
}

/// Seed the standard pool: PT 90, SY 40 → lp_total 600_000_000 (perfect square).
fn seed_pool(ctx: &TestCtx, lp_provider: &Address) -> i128 {
    ctx.amm.create_pool(&MATURITY);
    fund(ctx, lp_provider, 90_0000000, 40_0000000);
    ctx.amm
        .add_liquidity(lp_provider, &MATURITY, &90_0000000, &40_0000000, &0, &0)
}

#[test]
fn test_isqrt_edges() {
    use crate::isqrt;
    assert_eq!(isqrt(0), 0);
    assert_eq!(isqrt(1), 1);
    assert_eq!(isqrt(2), 1);
    assert_eq!(isqrt(3), 1);
    assert_eq!(isqrt(4), 2);
    assert_eq!(isqrt(15), 3);
    assert_eq!(isqrt(16), 4);
    assert_eq!(isqrt(36_0000000_0000000), 600_000_00); // 3.6e15 -> 6e7
    let big: i128 = 1_000_000_000_000_000_000_000_000_000_000; // 1e30
    assert_eq!(isqrt(big), 1_000_000_000_000_000); // 1e15 exactly
    assert_eq!(isqrt(big - 1), 999_999_999_999_999);
}

#[test]
fn test_create_pool_ok_duplicate_unknown_matured() {
    let ctx = setup();
    ctx.amm.create_pool(&MATURITY);
    let pool = ctx.amm.get_pool(&MATURITY);
    assert_eq!(pool.pt_reserve, 0);
    assert_eq!(pool.lp_total, 0);

    assert_eq!(
        ctx.amm.try_create_pool(&MATURITY),
        Err(Ok(AmmError::PoolAlreadyExists))
    );
    // Unknown maturity: the Market stub traps, mapped to a clean error.
    assert_eq!(
        ctx.amm.try_create_pool(&(MATURITY + 1)),
        Err(Ok(AmmError::MaturityNotFound))
    );
    // Matured maturity rejected outright.
    ctx.env.ledger().set_timestamp(MATURITY + 1);
    assert_eq!(
        ctx.amm.try_create_pool(&MATURITY),
        Err(Ok(AmmError::MaturityPassed))
    );
}

#[test]
fn test_create_pool_requires_admin() {
    let ctx = setup();
    ctx.env.mock_auths(&[]);
    assert!(ctx.amm.try_create_pool(&MATURITY).is_err());
}

#[test]
fn test_first_add_locks_minimum_liquidity() {
    let ctx = setup();
    let lp = Address::generate(&ctx.env);
    // 90 PT · 40 SY -> isqrt(9e8 · 4e8) = 6e8 shares exactly.
    let minted = seed_pool(&ctx, &lp);
    assert_eq!(minted, 600_000_000 - MINIMUM_LIQUIDITY);
    let pool = ctx.amm.get_pool(&MATURITY);
    assert_eq!(pool.lp_total, 600_000_000);
    assert_eq!(pool.pt_reserve, 90_0000000);
    assert_eq!(pool.sy_reserve, 40_0000000);
    assert_eq!(ctx.amm.lp_balance(&lp, &MATURITY), minted);
    // The tokens actually moved into the AMM.
    assert_eq!(ctx.pt.balance(&ctx.amm_id), 90_0000000);
    assert_eq!(ctx.sy.balance(&ctx.amm_id), 40_0000000);
}

#[test]
fn test_second_add_pro_rata_with_optimal_leg() {
    let ctx = setup();
    let first = Address::generate(&ctx.env);
    seed_pool(&ctx, &first);

    // Pool ratio is 9:4. Desire (9 PT, 10 SY): SY leg optimizes down to 4.
    let second = Address::generate(&ctx.env);
    fund(&ctx, &second, 9_0000000, 10_0000000);
    let minted = ctx
        .amm
        .add_liquidity(&second, &MATURITY, &9_0000000, &10_0000000, &0, &4_0000000);
    // minted = min(9e7·6e8/9e8, 4e7·6e8/4e8) = 6e7.
    assert_eq!(minted, 60_000_000);
    let pool = ctx.amm.get_pool(&MATURITY);
    assert_eq!(pool.pt_reserve, 99_0000000);
    assert_eq!(pool.sy_reserve, 44_0000000);
    assert_eq!(pool.lp_total, 660_000_000);
    // The unused 6 SY stayed with the provider.
    assert_eq!(ctx.sy.balance(&second), 6_0000000);
}

#[test]
fn test_add_liquidity_min_guard_reverts() {
    let ctx = setup();
    let first = Address::generate(&ctx.env);
    seed_pool(&ctx, &first);

    let second = Address::generate(&ctx.env);
    fund(&ctx, &second, 9_0000000, 10_0000000);
    // SY leg would optimize to 4, but the provider demands at least 5.
    let result =
        ctx.amm
            .try_add_liquidity(&second, &MATURITY, &9_0000000, &10_0000000, &0, &5_0000000);
    assert_eq!(result, Err(Ok(AmmError::SlippageExceeded)));
}

#[test]
fn test_remove_liquidity_pro_rata_and_bounded() {
    let ctx = setup();
    let first = Address::generate(&ctx.env);
    seed_pool(&ctx, &first);
    let second = Address::generate(&ctx.env);
    fund(&ctx, &second, 9_0000000, 4_0000000);
    ctx.amm
        .add_liquidity(&second, &MATURITY, &9_0000000, &4_0000000, &0, &0);

    // Burning second's full 6e7 shares returns exactly the pro-rata legs.
    let (pt_out, sy_out) = ctx
        .amm
        .remove_liquidity(&second, &MATURITY, &60_000_000, &0, &0);
    assert_eq!(pt_out, 9_0000000);
    assert_eq!(sy_out, 4_0000000);
    assert_eq!(ctx.amm.lp_balance(&second, &MATURITY), 0);

    // I5: nobody can withdraw beyond their share.
    let result = ctx.amm.try_remove_liquidity(&second, &MATURITY, &1, &0, &0);
    assert_eq!(result, Err(Ok(AmmError::InsufficientLpBalance)));
}

#[test]
fn test_swap_exact_in_hand_computed_fixture() {
    let ctx = setup();
    ctx.amm.create_pool(&MATURITY);
    let lp = Address::generate(&ctx.env);
    // Symmetric 1000/1000 pool for a clean fixture.
    fund(&ctx, &lp, 1000_0000000, 1000_0000000);
    ctx.amm
        .add_liquidity(&lp, &MATURITY, &1000_0000000, &1000_0000000, &0, &0);

    let trader = Address::generate(&ctx.env);
    fund(&ctx, &trader, 1_0000000, 0);
    // out = 1e7·997·1e10 / (1e10·1000 + 1e7·997) = 9_960_069 (hand-derived).
    let quoted = ctx.amm.quote_swap(&MATURITY, &SwapSide::PtToSy, &1_0000000);
    assert_eq!(quoted, 9_960_069);
    let out = ctx
        .amm
        .swap_exact_in(&trader, &MATURITY, &SwapSide::PtToSy, &1_0000000, &quoted);
    assert_eq!(out, quoted); // quote == execution in the same state
    assert_eq!(ctx.sy.balance(&trader), 9_960_069);

    // k never decreases (grows with the fee).
    let pool = ctx.amm.get_pool(&MATURITY);
    let k_after = pool.pt_reserve * pool.sy_reserve;
    assert!(k_after >= 1000_0000000i128 * 1000_0000000i128);
}

#[test]
fn test_swap_min_out_reverts() {
    let ctx = setup();
    let lp = Address::generate(&ctx.env);
    seed_pool(&ctx, &lp);
    let trader = Address::generate(&ctx.env);
    fund(&ctx, &trader, 1_0000000, 0);

    let quoted = ctx.amm.quote_swap(&MATURITY, &SwapSide::PtToSy, &1_0000000);
    let result = ctx.amm.try_swap_exact_in(
        &trader,
        &MATURITY,
        &SwapSide::PtToSy,
        &1_0000000,
        &(quoted + 1),
    );
    assert_eq!(result, Err(Ok(AmmError::SlippageExceeded)));
}

#[test]
fn test_swap_round_trip_never_profits() {
    let ctx = setup();
    let lp = Address::generate(&ctx.env);
    seed_pool(&ctx, &lp);
    let trader = Address::generate(&ctx.env);
    fund(&ctx, &trader, 2_0000000, 0);

    // A true round trip: PT in -> SY out -> that exact SY back in -> PT out.
    let sy_out = ctx
        .amm
        .swap_exact_in(&trader, &MATURITY, &SwapSide::PtToSy, &2_0000000, &0);
    assert!(sy_out > 0);
    let pt_back = ctx
        .amm
        .swap_exact_in(&trader, &MATURITY, &SwapSide::SyToPt, &sy_out, &0);
    assert!(pt_back > 0);
    // Two 30 bps fees + rounding: the trader always ends with less PT.
    assert!(pt_back < 2_0000000);
    assert_eq!(ctx.pt.balance(&trader), pt_back);
    assert_eq!(ctx.sy.balance(&trader), 0);
}

#[test]
fn test_maturity_freeze_swaps_and_adds_but_not_removes() {
    let ctx = setup();
    let lp = Address::generate(&ctx.env);
    let minted = seed_pool(&ctx, &lp);
    let trader = Address::generate(&ctx.env);
    fund(&ctx, &trader, 1_0000000, 1_0000000);

    ctx.env.ledger().set_timestamp(MATURITY);
    assert_eq!(
        ctx.amm
            .try_swap_exact_in(&trader, &MATURITY, &SwapSide::PtToSy, &1_0000000, &0),
        Err(Ok(AmmError::MaturityPassed))
    );
    assert_eq!(
        ctx.amm
            .try_add_liquidity(&trader, &MATURITY, &1_0000000, &1_0000000, &0, &0),
        Err(Ok(AmmError::MaturityPassed))
    );
    // LPs are never trapped: removal still works after maturity.
    let (pt_out, sy_out) = ctx.amm.remove_liquidity(&lp, &MATURITY, &minted, &0, &0);
    assert!(pt_out > 0 && sy_out > 0);
}

#[test]
fn test_swap_on_missing_pool_rejected() {
    let ctx = setup();
    let trader = Address::generate(&ctx.env);
    assert_eq!(
        ctx.amm
            .try_swap_exact_in(&trader, &MATURITY, &SwapSide::PtToSy, &1_0000000, &0),
        Err(Ok(AmmError::PoolNotFound))
    );
}

// -- randomized harness: I5 under interleaved swaps/adds/removes --

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

    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }

    fn amount(&mut self, max: i128) -> i128 {
        if max <= 0 {
            return 0;
        }
        1 + (self.below(max as u64)) as i128
    }

    /// As `amount`, but biased towards the values that break rounding: a few
    /// stroops of dust, and the exact balance. A uniform draw over a 50-token
    /// range picks 1 stroop with probability ~2e-9.
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

/// Knobs for the AMM harness — see `HarnessCfg` in the Market's harness for the
/// same idea. `fast()` is CI; `slow()` is the `#[ignore]`d deep tier.
struct AmmCfg {
    ops: usize,
    /// 1-in-N chance an amount is dust or an exact balance. 0 disables.
    dust_every: u64,
    /// 1-in-N chance a swap demands a `min_out` derived from the live quote,
    /// so `SlippageExceeded` is actually reachable. 0 disables.
    slippage_every: u64,
    /// 1-in-N chance the clock advances. 0 keeps the pool permanently
    /// pre-maturity, which is how this harness used to run.
    time_every: u64,
}

impl AmmCfg {
    fn fast() -> Self {
        Self {
            ops: 200,
            dust_every: 0,
            slippage_every: 0,
            time_every: 0,
        }
    }

    fn adversarial() -> Self {
        Self {
            ops: 200,
            dust_every: 3,
            slippage_every: 4,
            time_every: 25,
        }
    }

    fn slow() -> Self {
        Self {
            ops: 5000,
            dust_every: 3,
            slippage_every: 4,
            time_every: 40,
        }
    }
}

/// Random swaps (both directions), adds and removes; after every op assert:
/// internal reserves == actual token balances (no leakage), k non-decreasing
/// across swaps, and lp_total == Σ user shares + MINIMUM_LIQUIDITY.
fn run_harness(seed: u64, cfg: AmmCfg) {
    let ctx = setup();
    let lp0 = Address::generate(&ctx.env);
    seed_pool(&ctx, &lp0);
    let users: [Address; 3] = [
        lp0,
        Address::generate(&ctx.env),
        Address::generate(&ctx.env),
    ];
    for u in &users {
        fund(&ctx, u, 500_0000000, 500_0000000);
    }
    let mut rng = Rng(seed);

    for op_index in 0..cfg.ops {
        let actor = &users[rng.below(3) as usize];
        let pool_before = ctx.amm.get_pool(&MATURITY);
        let k_before = pool_before.pt_reserve * pool_before.sy_reserve;
        let mut swapped = false;

        match rng.below(5) {
            0 => {
                let amt = rng.biased_amount(ctx.pt.balance(actor).min(50_0000000), cfg.dust_every);
                if amt > 0 {
                    let min_out = quote_floor(&ctx, SwapSide::PtToSy, amt, &mut rng, &cfg);
                    swapped = ctx
                        .amm
                        .try_swap_exact_in(actor, &MATURITY, &SwapSide::PtToSy, &amt, &min_out)
                        .is_ok();
                }
            }
            1 => {
                let amt = rng.biased_amount(ctx.sy.balance(actor).min(50_0000000), cfg.dust_every);
                if amt > 0 {
                    let min_out = quote_floor(&ctx, SwapSide::SyToPt, amt, &mut rng, &cfg);
                    swapped = ctx
                        .amm
                        .try_swap_exact_in(actor, &MATURITY, &SwapSide::SyToPt, &amt, &min_out)
                        .is_ok();
                }
            }
            2 => {
                let pt = rng.biased_amount(ctx.pt.balance(actor).min(50_0000000), cfg.dust_every);
                let sy = rng.biased_amount(ctx.sy.balance(actor).min(50_0000000), cfg.dust_every);
                if pt > 0 && sy > 0 {
                    let _ = ctx
                        .amm
                        .try_add_liquidity(actor, &MATURITY, &pt, &sy, &0, &0);
                }
            }
            3 => {
                let amt = rng.biased_amount(ctx.amm.lp_balance(actor, &MATURITY), cfg.dust_every);
                if amt > 0 {
                    let _ = ctx.amm.try_remove_liquidity(actor, &MATURITY, &amt, &0, &0);
                }
            }
            _ => {
                // Crossing maturity mid-run is the only way the harness reaches
                // the frozen pool: swaps and adds must start failing while
                // remove_liquidity keeps working, so LPs can always exit.
                if cfg.time_every > 0 && rng.below(cfg.time_every) == 0 {
                    let now = ctx.env.ledger().timestamp();
                    ctx.env
                        .ledger()
                        .set_timestamp(now + 60 * (1 + rng.below(400)));
                }
            }
        }

        let pool = ctx.amm.get_pool(&MATURITY);
        // Internal accounting matches reality exactly.
        assert_eq!(
            ctx.pt.balance(&ctx.amm_id),
            pool.pt_reserve,
            "PT reserve drift [seed {seed:#x} op {op_index}]"
        );
        assert_eq!(
            ctx.sy.balance(&ctx.amm_id),
            pool.sy_reserve,
            "SY reserve drift [seed {seed:#x} op {op_index}]"
        );
        // I5: swaps never shrink k.
        if swapped {
            assert!(
                pool.pt_reserve * pool.sy_reserve >= k_before,
                "k decreased [seed {seed:#x} op {op_index}]"
            );
        }
        // Share conservation.
        let user_shares: i128 = users.iter().map(|u| ctx.amm.lp_balance(u, &MATURITY)).sum();
        assert_eq!(
            pool.lp_total,
            user_shares + MINIMUM_LIQUIDITY,
            "share conservation [seed {seed:#x} op {op_index}]"
        );
    }
}

/// A `min_out` that is sometimes exactly the live quote and sometimes one
/// stroop above it — the second case must always revert, which is what makes
/// `SlippageExceeded` reachable from the randomized sequence at all.
fn quote_floor(
    ctx: &TestCtx,
    side: SwapSide,
    amount_in: i128,
    rng: &mut Rng,
    cfg: &AmmCfg,
) -> i128 {
    if cfg.slippage_every == 0 || rng.below(cfg.slippage_every) != 0 {
        return 0;
    }
    match ctx.amm.try_quote_swap(&MATURITY, &side, &amount_in) {
        Ok(Ok(quote)) => quote + (rng.below(2) as i128),
        _ => 0,
    }
}

// -- fast tier: runs in CI on every push --

#[test]
fn test_harness_seed_1() {
    run_harness(0x000A_1414_0001, AmmCfg::fast());
}

#[test]
fn test_harness_seed_2() {
    run_harness(0x000A_1414_0002, AmmCfg::fast());
}

#[test]
fn test_harness_adversarial() {
    run_harness(0x000A_1414_00A1, AmmCfg::adversarial());
}

// -- slow tier: `cargo test --release -- --ignored` (see README) --

#[test]
#[ignore = "slow tier: cargo test --release -- --ignored"]
fn test_harness_deep() {
    for seed in [
        0x000A_1414_1001u64,
        0x000A_1414_1002,
        0x000A_1414_1003,
        0x000A_1414_1004,
    ] {
        run_harness(seed, AmmCfg::slow());
    }
}

/// Audit round 2, F-1. Other traders' swaps extend the pool, never the ledger
/// of who owns it — an LP who seeds a pool and walks away is refreshed by
/// nothing at all, so LP shares are topped up to the network maximum.
#[test]
fn test_lp_balance_ttl_outlives_the_config_window() {
    let ctx = setup();
    let lp = Address::generate(&ctx.env);
    seed_pool(&ctx, &lp);

    let ttl = ctx.env.as_contract(&ctx.amm_id, || {
        ctx.env
            .storage()
            .persistent()
            .get_ttl(&DataKey::LpBalance(lp.clone(), MATURITY))
    });
    let max = ctx
        .env
        .as_contract(&ctx.amm_id, || ctx.env.storage().max_ttl());

    assert_eq!(ttl, max, "LP shares should be extended to the maximum");
    assert!(ttl > TTL_EXTEND_TO);
}

/// Audit round 2, F-3. The two halves of a pool come from two sources of truth:
/// PT from the Market, SY from a constructor argument. A pool trading real PT
/// against an SY the Market does not settle in would let the deployer drain
/// every LP, and there is no upgrade path to fix it afterwards — so the pairing
/// is rejected at construction.
#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_constructor_rejects_sy_the_market_does_not_settle_in() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(BASE_TS);
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);

    let mk = |sym: &str| {
        let name = soroban_sdk::String::from_str(&env, sym);
        env.register(PtToken, (minter.clone(), name.clone(), name))
    };
    let pt_id = mk("PT-TEST");
    let real_sy = mk("SY-TEST");
    let impostor_sy = mk("SY-FAKE");

    let market_id = env.register(MockMarket, ());
    let market = MockMarketClient::new(&env, &market_id);
    market.set_market(&MATURITY, &pt_id, &Address::generate(&env));
    market.set_sy_vault(&real_sy);

    env.register(PtAmm, (admin, market_id, impostor_sy));
}
