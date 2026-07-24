//! A stand-in for the Blend v2 lending pool, for tests only.
//!
//! Why this exists instead of `blend_contract_sdk::testutils::BlendFixture`:
//! that fixture is built against `soroban-sdk 25` (this workspace is on 27) and
//! would additionally drag in the backstop, emitter, comet and an oracle mock
//! just to open a reserve. See `docs/plan/blend-notes.md` §7.
//!
//! Fidelity is what matters here, so the parts that touch money are copied from
//! `blend-contracts-v2/pool/src/pool/{reserve,actions}.rs`:
//!
//! * `b_tokens = floor(amount · 1e12 / b_rate)` when supplying,
//! * `b_tokens = ceil(amount · 1e12 / b_rate)` when withdrawing, clamped to the
//!   position (so `i128::MAX` means "withdraw everything"),
//! * `assets = floor(b_tokens · b_rate / 1e12)`,
//! * an illiquid reserve panics with `InvalidUtilRate = 1207`.
//!
//! What is *not* copied is the interest-rate model: `b_rate` grows linearly
//! from a configured slope so tests stay deterministic. `test::rate_fixture_*`
//! pins the conversions against real on-chain numbers.

use soroban_sdk::{
    contract, contracterror, contractimpl, panic_with_error, token, Address, Env, Map, MuxedAddress,
    Vec,
};

use crate::blend::{Positions, Request, Reserve, ReserveConfig, ReserveData, REQUEST_SUPPLY};
use crate::RATE_SCALE;

/// Blend's own error codes, for the ones this mock can raise.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MockPoolError {
    BadRequest = 1200,
    /// Raised by `require_utilization_below_100` — the reserve cannot pay out.
    InvalidUtilRate = 1207,
}

#[soroban_sdk::contracttype]
#[derive(Clone)]
pub enum PoolKey {
    Asset,
    Index,
    StartTs,
    InitialRate,
    Slope,
    Illiquid,
    Supply(Address),
}

#[contract]
pub struct MockBlendPool;

#[contractimpl]
impl MockBlendPool {
    pub fn __constructor(
        env: Env,
        asset: Address,
        index: u32,
        initial_b_rate: i128,
        slope_per_sec: i128,
    ) {
        let s = env.storage().instance();
        s.set(&PoolKey::Asset, &asset);
        s.set(&PoolKey::Index, &index);
        s.set(&PoolKey::StartTs, &env.ledger().timestamp());
        s.set(&PoolKey::InitialRate, &initial_b_rate);
        s.set(&PoolKey::Slope, &slope_per_sec);
        s.set(&PoolKey::Illiquid, &false);
    }

    /// Simulate a fully utilized reserve, so withdrawals fail the way they do
    /// on a real pool with every asset lent out.
    pub fn set_illiquid(env: Env, illiquid: bool) {
        env.storage().instance().set(&PoolKey::Illiquid, &illiquid);
    }

    /// Re-base the rate curve from now. Only a test lever: it can also move the
    /// rate *down*, which the real pool will not do — that is exactly how the
    /// vault's monotonicity ratchet gets exercised.
    pub fn set_rate(env: Env, initial_b_rate: i128, slope_per_sec: i128) {
        let s = env.storage().instance();
        s.set(&PoolKey::StartTs, &env.ledger().timestamp());
        s.set(&PoolKey::InitialRate, &initial_b_rate);
        s.set(&PoolKey::Slope, &slope_per_sec);
    }

    pub fn get_reserve(env: Env, asset: Address) -> Reserve {
        Self::require_asset(&env, &asset);
        let b_rate = Self::b_rate(&env);
        Reserve {
            asset,
            config: ReserveConfig {
                c_factor: 0,
                decimals: 7,
                enabled: true,
                index: env.storage().instance().get(&PoolKey::Index).unwrap(),
                l_factor: 0,
                max_util: 9_500_000,
                r_base: 0,
                r_one: 0,
                r_three: 0,
                r_two: 0,
                reactivity: 0,
                supply_cap: i128::MAX,
                util: 0,
            },
            data: ReserveData {
                b_rate,
                b_supply: 0,
                backstop_credit: 0,
                d_rate: RATE_SCALE,
                d_supply: 0,
                ir_mod: RATE_SCALE,
                last_time: env.ledger().timestamp(),
            },
            scalar: 10_000_000,
        }
    }

    pub fn submit(
        env: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: Vec<Request>,
    ) -> Positions {
        from.require_auth();
        let asset: Address = env.storage().instance().get(&PoolKey::Asset).unwrap();
        let index: u32 = env.storage().instance().get(&PoolKey::Index).unwrap();
        let b_rate = Self::b_rate(&env);
        let token = token::TokenClient::new(&env, &asset);
        let pool = env.current_contract_address();
        let mut position = Self::supply_of(&env, &from);

        for request in requests.iter() {
            Self::require_asset(&env, &request.address);
            if request.amount <= 0 {
                panic_with_error!(&env, MockPoolError::BadRequest);
            }
            if request.request_type == REQUEST_SUPPLY {
                let minted = mul_div_floor(request.amount, RATE_SCALE, b_rate);
                position += minted;
                token.transfer(&spender, MuxedAddress::from(&pool), &request.amount);
            } else {
                if env
                    .storage()
                    .instance()
                    .get(&PoolKey::Illiquid)
                    .unwrap_or(false)
                {
                    panic_with_error!(&env, MockPoolError::InvalidUtilRate);
                }
                let mut burnt = mul_div_ceil(request.amount, RATE_SCALE, b_rate);
                let mut out = request.amount;
                if burnt > position {
                    burnt = position;
                    out = mul_div_floor(position, b_rate, RATE_SCALE);
                }
                position -= burnt;
                token.transfer(&pool, MuxedAddress::from(&to), &out);
            }
        }

        env.storage()
            .instance()
            .set(&PoolKey::Supply(from), &position);
        let mut supply: Map<u32, i128> = Map::new(&env);
        if position > 0 {
            supply.set(index, position);
        }
        Positions {
            collateral: Map::new(&env),
            liabilities: Map::new(&env),
            supply,
        }
    }

    fn b_rate(env: &Env) -> i128 {
        let s = env.storage().instance();
        let start: u64 = s.get(&PoolKey::StartTs).unwrap();
        let initial: i128 = s.get(&PoolKey::InitialRate).unwrap();
        let slope: i128 = s.get(&PoolKey::Slope).unwrap();
        initial + slope * (env.ledger().timestamp().saturating_sub(start)) as i128
    }

    fn supply_of(env: &Env, who: &Address) -> i128 {
        env.storage()
            .instance()
            .get(&PoolKey::Supply(who.clone()))
            .unwrap_or(0)
    }

    fn require_asset(env: &Env, asset: &Address) {
        let expected: Address = env.storage().instance().get(&PoolKey::Asset).unwrap();
        if *asset != expected {
            panic_with_error!(env, MockPoolError::BadRequest);
        }
    }
}

fn mul_div_floor(a: i128, b: i128, c: i128) -> i128 {
    a * b / c
}

fn mul_div_ceil(a: i128, b: i128, c: i128) -> i128 {
    let p = a.saturating_mul(b);
    if p == i128::MAX {
        return i128::MAX;
    }
    (p + c - 1) / c
}
