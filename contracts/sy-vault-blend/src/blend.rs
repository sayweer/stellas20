//! Minimal, hand-written client for the Blend v2 lending pool.
//!
//! Why not `blend-contract-sdk`: the published crate (2.25.0) pins
//! `soroban-sdk 25`, while this workspace is on 27 — two SDK majors cannot
//! share an `Env`, so its generated client is unusable here. The types below
//! mirror the **deployed** pool spec exactly (verified with
//! `stellar contract info interface --id <pool>`; see `docs/plan/blend-notes.md`).
//! Soroban encodes `#[contracttype]` structs as name-keyed maps, so declaring
//! only the entry points we call is wire-compatible with the real contract.

use soroban_sdk::{contractclient, contracttype, Address, Env, Map, Vec};

/// `RequestType::Supply` — deposit underlying, receive bTokens.
pub const REQUEST_SUPPLY: u32 = 0;
/// `RequestType::Withdraw` — burn bTokens, receive underlying.
pub const REQUEST_WITHDRAW: u32 = 1;

/// `PoolError::InvalidUtilRate` — raised when a withdrawal would push the
/// reserve to 100% utilization, i.e. the pool is temporarily illiquid.
pub const POOL_ERR_INVALID_UTIL_RATE: u32 = 1207;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Request {
    pub address: Address,
    pub amount: i128,
    pub request_type: u32,
}

/// A user's pool positions, denominated in protocol tokens (b/d tokens) and
/// keyed by reserve index.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Positions {
    pub collateral: Map<u32, i128>,
    pub liabilities: Map<u32, i128>,
    pub supply: Map<u32, i128>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReserveConfig {
    pub c_factor: u32,
    pub decimals: u32,
    pub enabled: bool,
    pub index: u32,
    pub l_factor: u32,
    pub max_util: u32,
    pub r_base: u32,
    pub r_one: u32,
    pub r_three: u32,
    pub r_two: u32,
    pub reactivity: u32,
    pub supply_cap: i128,
    pub util: u32,
}

/// Live reserve accounting. `b_rate` is the supply-side exchange rate, scaled
/// by 1e12 (Blend's `SCALAR_12`) — the same scale this protocol already uses
/// for `RATE_SCALE`, so no normalization factor is needed anywhere.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReserveData {
    pub b_rate: i128,
    pub b_supply: i128,
    pub backstop_credit: i128,
    pub d_rate: i128,
    pub d_supply: i128,
    pub ir_mod: i128,
    pub last_time: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reserve {
    pub asset: Address,
    pub config: ReserveConfig,
    pub data: ReserveData,
    pub scalar: i128,
}

/// The slice of the Blend pool this protocol talks to.
///
/// `submit(from, spender, to, requests)`: `from` owns the resulting position
/// (and must authorize), `spender` pays tokens in, `to` receives tokens out.
/// `get_reserve` accrues interest to the current ledger timestamp before
/// returning, so `data.b_rate` is live rather than stale.
#[contractclient(name = "BlendPoolClient")]
pub trait BlendPoolInterface {
    fn submit(
        env: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: Vec<Request>,
    ) -> Positions;

    fn get_reserve(env: Env, asset: Address) -> Reserve;
}
