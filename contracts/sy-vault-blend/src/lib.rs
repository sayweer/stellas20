#![no_std]

//! SYVaultBlend: a Standardized-Yield wrapper over a **real** Blend lending
//! position.
//!
//! Same public surface as `sy-vault` (full SEP-41 + `wrap`/`unwrap`/
//! `exchange_rate`/`exchange_rate_at`), so the Market and the PT-AMM consume it
//! without knowing which yield source is behind it — per MASTERPLAN §3.7 the SY
//! interface *is* the adapter boundary, one vault per source.
//!
//! What differs from the mock-backed vault:
//!
//! * **Shares are bTokens.** `wrap` supplies the underlying into the Blend pool
//!   and credits the caller exactly the bTokens that deposit minted, so
//!   `wrap` is *not* 1:1 — 1 SY is worth `exchange_rate / RATE_SCALE` underlying
//!   and that ratio grows with Blend's accrued interest. Balances stay fixed;
//!   the yield is the rising rate, which is precisely what the Market's
//!   global-index accounting expects.
//! * **The rate comes from outside.** Blend exposes spot `b_rate` only, so this
//!   contract adds the two properties the settlement math depends on:
//!   monotonicity (a ratchet) and a recoverable past (a lazy frozen-rate cache).
//!   See `exchange_rate_at` — both are deliberate writes on a "view" path.
//! * **Exit can fail for real.** A fully utilized pool cannot pay a withdrawal;
//!   that surfaces as its own `LiquidityUnavailable` error rather than as a
//!   generic failure.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    token::TokenInterface, vec, Address, Env, MuxedAddress, String,
};

mod blend;
pub use blend::{
    BlendPoolClient, BlendPoolInterface, Positions, Request, Reserve, ReserveConfig, ReserveData,
};
use blend::{POOL_ERR_INVALID_UTIL_RATE, REQUEST_SUPPLY, REQUEST_WITHDRAW};

#[cfg(any(test, feature = "testutils"))]
pub mod mock_pool;

/// Exchange-rate fixed-point scale. Identical to Blend's `SCALAR_12`, which is
/// why `exchange_rate` can return `b_rate` unchanged.
pub const RATE_SCALE: i128 = 1_000_000_000_000;

/// TTL management (~5s per ledger on testnet): extend below ~14 days, up to ~30 days.
const TTL_THRESHOLD: u32 = 14 * 24 * 60 * 12;
const TTL_EXTEND_TO: u32 = 30 * 24 * 60 * 12;

/// Token metadata (7 decimals, Stellar-style — matches every Blend reserve).
const DECIMALS: u32 = 7;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    /// The Blend lending pool this vault holds its position in.
    Pool,
    /// The underlying asset supplied into the pool.
    Asset,
    Name,
    Symbol,
    TotalSupply,
    /// The vault's bToken position, as last reported by the pool. Always
    /// `>= TotalSupply`: exits round the burn up and the payout down, so the
    /// rounding surplus stays in the position.
    Position,
    /// Highest `b_rate` ever observed — the monotonicity ratchet.
    LastRate,
    /// Rate frozen for a past timestamp, recorded on first lookup.
    FrozenRate(u64),
    Balance(Address),
    Allowance(Address, Address),
}

/// Stored allowance: how much `spender` may pull, until which ledger.
#[contracttype]
#[derive(Clone)]
pub struct AllowanceValue {
    pub amount: i128,
    pub expiration_ledger: u32,
}

/// Codes 1–7 deliberately match `sy-vault`'s `SyError`, so the frontend's
/// error table is shared; 8+ are Blend-specific.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SyBlendError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InsufficientBalance = 4,
    MathOverflow = 5,
    InsufficientAllowance = 6,
    AllowanceExpired = 7,
    /// The Blend pool cannot pay out right now (reserve at 100% utilization).
    LiquidityUnavailable = 8,
    /// The Blend pool rejected the request for any other reason.
    PoolCallFailed = 9,
    /// The pool reported a non-positive exchange rate, or a supply that minted
    /// nothing — never expected; refuse rather than mint against garbage.
    InvalidRate = 10,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Wrap {
    #[topic]
    pub from: Address,
    /// Underlying supplied into Blend.
    pub asset_in: i128,
    /// SY (bTokens) minted for it.
    pub sy_out: i128,
    pub new_total_supply: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Unwrap {
    #[topic]
    pub from: Address,
    /// SY burnt.
    pub sy_in: i128,
    /// Underlying withdrawn from Blend and paid to `from`.
    pub asset_out: i128,
    pub new_total_supply: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Transfer {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Approve {
    #[topic]
    pub from: Address,
    #[topic]
    pub spender: Address,
    pub amount: i128,
    pub expiration_ledger: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Burn {
    #[topic]
    pub from: Address,
    pub amount: i128,
}

#[contract]
pub struct SyVaultBlend;

// -- custom (non-SEP-41) methods --
#[contractimpl]
impl SyVaultBlend {
    /// Constructor: runs once at deploy (no front-run). `pool` and `asset` are
    /// arguments rather than constants so a testnet reset — or a second
    /// underlying — is a redeploy, never a code change.
    pub fn __constructor(
        env: Env,
        admin: Address,
        pool: Address,
        asset: Address,
        name: String,
        symbol: String,
    ) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Pool, &pool);
        env.storage().instance().set(&DataKey::Asset, &asset);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
        env.storage().instance().set(&DataKey::Position, &0i128);
        extend_instance(&env);
    }

    /// Supply `amount` of the underlying into the Blend pool and mint the
    /// bTokens it produced as SY. Returns the caller's new SY balance.
    ///
    /// The pool pulls the underlying from `from` directly (`spender = from`),
    /// which the caller's own signature covers as a nested auth entry — so the
    /// vault never has to authorize a transfer of its own funds.
    pub fn wrap(env: Env, from: Address, amount: i128) -> Result<i128, SyBlendError> {
        from.require_auth();
        if amount <= 0 {
            return Err(SyBlendError::InvalidAmount);
        }
        let asset = Self::require_asset(&env)?;
        let vault = env.current_contract_address();
        let index = Self::reserve(&env)?.config.index;

        let before = Self::position(env.clone());
        let positions = Self::submit(
            &env,
            &vault,
            &from,
            &vault,
            Request {
                address: asset,
                amount,
                request_type: REQUEST_SUPPLY,
            },
        )?;
        let after = positions.supply.get(index).unwrap_or(0);
        let minted = after
            .checked_sub(before)
            .ok_or(SyBlendError::MathOverflow)?;
        if minted <= 0 {
            return Err(SyBlendError::InvalidRate);
        }
        env.storage().instance().set(&DataKey::Position, &after);

        let new_balance = credit(&env, &from, minted)?;
        let new_total = add_supply(&env, minted)?;
        Wrap {
            from,
            asset_in: amount,
            sy_out: minted,
            new_total_supply: new_total,
        }
        .publish(&env);
        Ok(new_balance)
    }

    /// Burn `amount` SY and withdraw the underlying it is worth from Blend
    /// straight to the caller. Returns the caller's new SY balance.
    ///
    /// The payout floors (`floor(sy · R / SCALE)`) while the pool burns
    /// `ceil(payout · SCALE / R) <= amount` bTokens, so the vault's position
    /// can only ever drift *above* its SY supply — the same "floor out, ceil
    /// liabilities" law the Market runs on.
    pub fn unwrap(env: Env, from: Address, amount: i128) -> Result<i128, SyBlendError> {
        from.require_auth();
        if amount <= 0 {
            return Err(SyBlendError::InvalidAmount);
        }
        let asset = Self::require_asset(&env)?;
        let vault = env.current_contract_address();
        let index = Self::reserve(&env)?.config.index;
        let rate = Self::exchange_rate(env.clone())?;

        let asset_out = mul_div_floor(amount, rate, RATE_SCALE)?;
        if asset_out <= 0 {
            return Err(SyBlendError::InvalidAmount);
        }

        // Burn the shares before the external call: nothing about the payout
        // depends on the post-state, and it keeps checks-effects ordering.
        let new_balance = debit(&env, &from, amount)?;
        let new_total = sub_supply(&env, amount)?;

        let positions = Self::submit(
            &env,
            &vault,
            &vault,
            &from,
            Request {
                address: asset,
                amount: asset_out,
                request_type: REQUEST_WITHDRAW,
            },
        )?;
        let after = positions.supply.get(index).unwrap_or(0);
        env.storage().instance().set(&DataKey::Position, &after);

        Unwrap {
            from,
            sy_in: amount,
            asset_out,
            new_total_supply: new_total,
        }
        .publish(&env);
        Ok(new_balance)
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    /// The vault's bToken position in the Blend pool, as last reported by it.
    pub fn position(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Position)
            .unwrap_or(0)
    }

    /// The Blend lending pool backing this vault.
    pub fn pool(env: Env) -> Result<Address, SyBlendError> {
        env.storage()
            .instance()
            .get(&DataKey::Pool)
            .ok_or(SyBlendError::NotInitialized)
    }

    /// The underlying asset supplied into the pool.
    pub fn underlying(env: Env) -> Result<Address, SyBlendError> {
        Self::require_asset(&env)
    }

    /// Current exchange rate: Blend's live `b_rate`, ratcheted so it can never
    /// move backwards (MASTERPLAN §3.2 makes a monotonic rate binding for every
    /// SY source; `b_rate` is monotonic in practice, and this makes it so by
    /// construction). **Writes** when the rate advances — a spot-only source
    /// cannot be made monotone otherwise.
    pub fn exchange_rate(env: Env) -> Result<i128, SyBlendError> {
        let spot = Self::reserve(&env)?.data.b_rate;
        let last: i128 = env
            .storage()
            .instance()
            .get(&DataKey::LastRate)
            .unwrap_or(0);
        if spot > last {
            env.storage().instance().set(&DataKey::LastRate, &spot);
            extend_instance(&env);
            return Ok(spot);
        }
        if last <= 0 {
            return Err(SyBlendError::InvalidRate);
        }
        Ok(last)
    }

    /// Exchange rate at `ts` — what makes maturity settlement deterministic.
    ///
    /// Blend keeps no rate history, so this contract creates one lazily: a past
    /// timestamp **freezes at the first rate observed after it**, and every
    /// later lookup returns that same value. Calling this at or after a
    /// maturity is therefore all it takes to pin `R_T` forever — the Market's
    /// first post-maturity settlement does it in the same transaction that
    /// reads it, and anyone may pin it earlier by invoking this directly.
    ///
    /// Freezing *upward* (never below what `exchange_rate` returned at that
    /// moment) is the safe direction: the Market's per-user index is set from
    /// live reads, and a later lookup that came back lower would make a
    /// settlement release negative — silently shifting SY to PT holders that
    /// nobody deposited. See `docs/plan/blend-notes.md` §6.
    pub fn exchange_rate_at(env: Env, ts: u64) -> Result<i128, SyBlendError> {
        if ts >= env.ledger().timestamp() {
            return Self::exchange_rate(env);
        }
        let key = DataKey::FrozenRate(ts);
        if let Some(rate) = env.storage().persistent().get::<_, i128>(&key) {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
            return Ok(rate);
        }
        let rate = Self::exchange_rate(env.clone())?;
        env.storage().persistent().set(&key, &rate);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(rate)
    }

    // -- internal --

    /// One `submit` request against the pool, with Blend's failure codes mapped
    /// onto ours: an illiquid reserve is a distinct, honest error rather than a
    /// generic one. `try_submit` rolls the sub-invocation back, so the mapping
    /// costs nothing on the happy path.
    fn submit(
        env: &Env,
        from: &Address,
        spender: &Address,
        to: &Address,
        request: Request,
    ) -> Result<Positions, SyBlendError> {
        let pool = Self::pool(env.clone())?;
        let client = BlendPoolClient::new(env, &pool);
        match client.try_submit(from, spender, to, &vec![env, request]) {
            Ok(Ok(positions)) => Ok(positions),
            Err(Ok(err)) => Err(
                if err == soroban_sdk::Error::from_contract_error(POOL_ERR_INVALID_UTIL_RATE) {
                    SyBlendError::LiquidityUnavailable
                } else {
                    SyBlendError::PoolCallFailed
                },
            ),
            _ => Err(SyBlendError::PoolCallFailed),
        }
    }

    /// The pool's live reserve for our underlying (interest already accrued to
    /// the current ledger timestamp by the pool itself).
    fn reserve(env: &Env) -> Result<Reserve, SyBlendError> {
        let pool = Self::pool(env.clone())?;
        let asset = Self::require_asset(env)?;
        Ok(BlendPoolClient::new(env, &pool).get_reserve(&asset))
    }

    fn require_asset(env: &Env) -> Result<Address, SyBlendError> {
        env.storage()
            .instance()
            .get(&DataKey::Asset)
            .ok_or(SyBlendError::NotInitialized)
    }
}

// -- SEP-41 TokenInterface --
//
// SEP-41 methods panic with `SyBlendError` codes (per the interface contract)
// while the custom wrap/unwrap surface stays Result-based; on the wire both
// surface identically as `Error(Contract, #N)`.
#[contractimpl]
impl TokenInterface for SyVaultBlend {
    fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        read_allowance(&env, &from, &spender).amount
    }

    fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        if amount < 0 {
            panic_with_error!(&env, SyBlendError::InvalidAmount);
        }
        if amount > 0 && expiration_ledger < env.ledger().sequence() {
            panic_with_error!(&env, SyBlendError::AllowanceExpired);
        }
        let key = DataKey::Allowance(from.clone(), spender.clone());
        env.storage().temporary().set(
            &key,
            &AllowanceValue {
                amount,
                expiration_ledger,
            },
        );
        if amount > 0 {
            // Clamp to the network's max entry TTL so a far-future expiration
            // doesn't trap the host on extend_ttl.
            let live_for =
                (expiration_ledger - env.ledger().sequence()).min(env.storage().max_ttl());
            env.storage()
                .temporary()
                .extend_ttl(&key, live_for, live_for);
        }
        Approve {
            from,
            spender,
            amount,
            expiration_ledger,
        }
        .publish(&env);
    }

    fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
        from.require_auth();
        let to = to.address();
        move_sy(&env, &from, &to, amount);
    }

    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        spend_allowance(&env, &from, &spender, amount);
        move_sy(&env, &from, &to, amount);
    }

    /// Burning SY destroys the shares and **forfeits the claim on the vault's
    /// Blend position** (the bTokens stay put and become protocol surplus).
    /// `unwrap` remains the way to exit to the underlying; burn deliberately
    /// has no hidden withdrawal side-effects.
    fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        burn_sy(&env, &from, amount);
    }

    fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        spend_allowance(&env, &from, &spender, amount);
        burn_sy(&env, &from, amount);
    }

    fn decimals(_env: Env) -> u32 {
        DECIMALS
    }

    fn name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Name)
            .unwrap_or_else(|| panic_with_error!(&env, SyBlendError::NotInitialized))
    }

    fn symbol(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Symbol)
            .unwrap_or_else(|| panic_with_error!(&env, SyBlendError::NotInitialized))
    }
}

// -- internal SY balance helpers (mirror `sy-vault`) --

/// `floor(a · b / c)` with checked math throughout.
fn mul_div_floor(a: i128, b: i128, c: i128) -> Result<i128, SyBlendError> {
    if c <= 0 {
        return Err(SyBlendError::InvalidRate);
    }
    a.checked_mul(b)
        .map(|p| p / c)
        .ok_or(SyBlendError::MathOverflow)
}

fn move_sy(env: &Env, from: &Address, to: &Address, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, SyBlendError::InvalidAmount);
    }
    debit(env, from, amount).unwrap_or_else(|e| panic_with_error!(env, e));
    credit(env, to, amount).unwrap_or_else(|e| panic_with_error!(env, e));
    extend_instance(env);
    Transfer {
        from: from.clone(),
        to: to.clone(),
        amount,
    }
    .publish(env);
}

fn burn_sy(env: &Env, from: &Address, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, SyBlendError::InvalidAmount);
    }
    debit(env, from, amount).unwrap_or_else(|e| panic_with_error!(env, e));
    sub_supply(env, amount).unwrap_or_else(|e| panic_with_error!(env, e));
    Burn {
        from: from.clone(),
        amount,
    }
    .publish(env);
}

fn read_allowance(env: &Env, from: &Address, spender: &Address) -> AllowanceValue {
    let key = DataKey::Allowance(from.clone(), spender.clone());
    match env.storage().temporary().get::<_, AllowanceValue>(&key) {
        Some(a) if a.expiration_ledger >= env.ledger().sequence() => a,
        _ => AllowanceValue {
            amount: 0,
            expiration_ledger: 0,
        },
    }
}

fn spend_allowance(env: &Env, from: &Address, spender: &Address, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, SyBlendError::InvalidAmount);
    }
    let allowance = read_allowance(env, from, spender);
    if allowance.amount < amount {
        panic_with_error!(env, SyBlendError::InsufficientAllowance);
    }
    let key = DataKey::Allowance(from.clone(), spender.clone());
    env.storage().temporary().set(
        &key,
        &AllowanceValue {
            amount: allowance.amount - amount,
            expiration_ledger: allowance.expiration_ledger,
        },
    );
}

fn credit(env: &Env, to: &Address, amount: i128) -> Result<i128, SyBlendError> {
    let key = DataKey::Balance(to.clone());
    let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    let new_balance = balance
        .checked_add(amount)
        .ok_or(SyBlendError::MathOverflow)?;
    env.storage().persistent().set(&key, &new_balance);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    Ok(new_balance)
}

fn debit(env: &Env, from: &Address, amount: i128) -> Result<i128, SyBlendError> {
    let key = DataKey::Balance(from.clone());
    let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    if balance < amount {
        return Err(SyBlendError::InsufficientBalance);
    }
    let new_balance = balance - amount;
    env.storage().persistent().set(&key, &new_balance);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    Ok(new_balance)
}

fn add_supply(env: &Env, amount: i128) -> Result<i128, SyBlendError> {
    let supply = SyVaultBlend::total_supply(env.clone());
    let new_supply = supply
        .checked_add(amount)
        .ok_or(SyBlendError::MathOverflow)?;
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &new_supply);
    extend_instance(env);
    Ok(new_supply)
}

fn sub_supply(env: &Env, amount: i128) -> Result<i128, SyBlendError> {
    let supply = SyVaultBlend::total_supply(env.clone());
    let new_supply = supply
        .checked_sub(amount)
        .ok_or(SyBlendError::MathOverflow)?;
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &new_supply);
    extend_instance(env);
    Ok(new_supply)
}

fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;
