#![no_std]

//! MockYieldToken (mUSDY): a demo yield-bearing token that simulates a
//! real-world asset like USDY or a Blend position.
//!
//! It implements the full SEP-41 token interface (so `token::TokenClient`
//! works against it and wallets/explorers can render it), plus an
//! **exchange rate** that grows linearly with ledger time. Balances are fixed
//! integers — the "yield" is expressed by the rising exchange rate, not by
//! rebasing balances. The rate history is checkpointed so any past rate can
//! be recovered exactly, which is what lets the Splitter settle a matured
//! position at its frozen maturity rate.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    token::TokenInterface, Address, Env, MuxedAddress, String,
};

/// Exchange-rate fixed-point scale: `rate == RATE_SCALE` means 1.0.
/// 1e12 gives far more precision than the 7-decimal token amounts, so the
/// rate ticks smoothly instead of stair-stepping at demo speeds.
pub const RATE_SCALE: i128 = 1_000_000_000_000;

/// Max tokens a single `faucet` call may mint (10,000 tokens, 7 decimals).
const FAUCET_MAX: i128 = 100_000_000_000;

/// Token metadata (7 decimals, Stellar-style).
const DECIMALS: u32 = 7;

/// TTL management (~5s per ledger on testnet): extend below ~14 days, up to ~30 days.
const TTL_THRESHOLD: u32 = 14 * 24 * 60 * 12;
const TTL_EXTEND_TO: u32 = 30 * 24 * 60 * 12;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Checkpoints,
    TotalSupply,
    Balance(Address),
    Allowance(Address, Address),
}

/// A point from which the exchange rate grows linearly until the next
/// checkpoint (or forever, for the last one).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RateCheckpoint {
    /// Unix timestamp this checkpoint takes effect.
    pub since: u64,
    /// Exchange rate at `since` (scaled by `RATE_SCALE`).
    pub rate: i128,
    /// Rate increase per second (scaled by `RATE_SCALE`).
    pub slope_per_sec: i128,
}

/// Stored allowance: how much `spender` may pull, until which ledger.
#[contracttype]
#[derive(Clone)]
pub struct AllowanceValue {
    pub amount: i128,
    pub expiration_ledger: u32,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokenError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InsufficientBalance = 4,
    InsufficientAllowance = 5,
    FaucetLimitExceeded = 6,
    Unauthorized = 7,
    MathOverflow = 8,
    AllowanceExpired = 9,
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
pub struct Mint {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Faucet {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RateSet {
    pub rate: i128,
    pub slope_per_sec: i128,
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
pub struct MockYieldToken;

// -- custom (non-SEP-41) methods --
#[contractimpl]
impl MockYieldToken {
    /// Constructor: runs once, atomically, at deploy — so admin/config can't be
    /// front-run by a separate initialize call. Seeds the first rate checkpoint.
    pub fn __constructor(
        env: Env,
        admin: Address,
        initial_rate: i128,
        slope_per_sec: i128,
    ) -> Result<(), TokenError> {
        if initial_rate <= 0 || slope_per_sec < 0 {
            return Err(TokenError::InvalidAmount);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);

        let mut checkpoints = soroban_sdk::Vec::new(&env);
        checkpoints.push_back(RateCheckpoint {
            since: env.ledger().timestamp(),
            rate: initial_rate,
            slope_per_sec,
        });
        env.storage()
            .instance()
            .set(&DataKey::Checkpoints, &checkpoints);
        extend_instance(&env);
        Ok(())
    }

    /// Admin-only mint of new tokens to `to`.
    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), TokenError> {
        let admin = Self::require_admin(&env)?;
        admin.require_auth();
        if amount <= 0 {
            return Err(TokenError::InvalidAmount);
        }
        credit(&env, &to, amount)?;
        Mint { to, amount }.publish(&env);
        Ok(())
    }

    /// Public self-service faucet (capped per call) so demo users can get tokens.
    pub fn faucet(env: Env, to: Address, amount: i128) -> Result<(), TokenError> {
        to.require_auth();
        if amount <= 0 {
            return Err(TokenError::InvalidAmount);
        }
        if amount > FAUCET_MAX {
            return Err(TokenError::FaucetLimitExceeded);
        }
        credit(&env, &to, amount)?;
        Faucet { to, amount }.publish(&env);
        Ok(())
    }

    /// Current exchange rate (scaled by `RATE_SCALE`).
    pub fn exchange_rate(env: Env) -> i128 {
        rate_at(&env, env.ledger().timestamp())
    }

    /// Exchange rate at an arbitrary past-or-future timestamp, computed from
    /// the checkpoint history — this is what makes maturity settlement exact.
    pub fn exchange_rate_at(env: Env, ts: u64) -> i128 {
        rate_at(&env, ts)
    }

    /// Admin-only: change the slope going forward, preserving rate continuity
    /// by snapshotting the current rate into a fresh checkpoint.
    pub fn set_rate(env: Env, slope_per_sec: i128) -> Result<(), TokenError> {
        let admin = Self::require_admin(&env)?;
        admin.require_auth();
        if slope_per_sec < 0 {
            return Err(TokenError::InvalidAmount);
        }
        let now = env.ledger().timestamp();
        let rate = rate_at(&env, now);
        let mut checkpoints = load_checkpoints(&env);
        checkpoints.push_back(RateCheckpoint {
            since: now,
            rate,
            slope_per_sec,
        });
        env.storage()
            .instance()
            .set(&DataKey::Checkpoints, &checkpoints);
        extend_instance(&env);
        RateSet {
            rate,
            slope_per_sec,
        }
        .publish(&env);
        Ok(())
    }

    /// The active checkpoint, for a frontend to run a client-side live ticker.
    pub fn get_rate_info(env: Env) -> RateCheckpoint {
        let now = env.ledger().timestamp();
        let checkpoints = load_checkpoints(&env);
        active_checkpoint(&checkpoints, now)
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    fn require_admin(env: &Env) -> Result<Address, TokenError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(TokenError::NotInitialized)
    }
}

// -- SEP-41 TokenInterface --
#[contractimpl]
impl TokenInterface for MockYieldToken {
    fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        read_allowance(&env, &from, &spender).amount
    }

    fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        if amount < 0 {
            panic_with_error!(&env, TokenError::InvalidAmount);
        }
        if amount > 0 && expiration_ledger < env.ledger().sequence() {
            panic_with_error!(&env, TokenError::AllowanceExpired);
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
            let live_for = expiration_ledger - env.ledger().sequence();
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
        move_tokens(&env, &from, &to, amount);
    }

    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        spend_allowance(&env, &from, &spender, amount);
        move_tokens(&env, &from, &to, amount);
    }

    fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        debit(&env, &from, amount);
        Burn { from, amount }.publish(&env);
    }

    fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        spend_allowance(&env, &from, &spender, amount);
        debit(&env, &from, amount);
        Burn { from, amount }.publish(&env);
    }

    fn decimals(_env: Env) -> u32 {
        DECIMALS
    }

    fn name(env: Env) -> String {
        String::from_str(&env, "Mock USDY")
    }

    fn symbol(env: Env) -> String {
        String::from_str(&env, "mUSDY")
    }
}

// -- internal helpers --

/// Compute the rate at `ts` from the checkpoint history.
fn rate_at(env: &Env, ts: u64) -> i128 {
    let checkpoints = load_checkpoints(env);
    let cp = active_checkpoint(&checkpoints, ts);
    // Clamp elapsed to 0 for timestamps before the first checkpoint.
    let elapsed = ts.saturating_sub(cp.since) as i128;
    cp.rate
        .checked_add(cp.slope_per_sec.checked_mul(elapsed).unwrap_or(i128::MAX))
        .unwrap_or(i128::MAX)
}

/// The last checkpoint effective at or before `ts` (or the first, if `ts`
/// precedes all of them).
fn active_checkpoint(checkpoints: &soroban_sdk::Vec<RateCheckpoint>, ts: u64) -> RateCheckpoint {
    let mut chosen = checkpoints.get(0).unwrap();
    for cp in checkpoints.iter() {
        if cp.since <= ts {
            chosen = cp;
        } else {
            break;
        }
    }
    chosen
}

fn load_checkpoints(env: &Env) -> soroban_sdk::Vec<RateCheckpoint> {
    env.storage()
        .instance()
        .get(&DataKey::Checkpoints)
        .unwrap_or_else(|| panic_with_error!(env, TokenError::NotInitialized))
}

fn move_tokens(env: &Env, from: &Address, to: &Address, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, TokenError::InvalidAmount);
    }
    debit(env, from, amount);
    credit(env, to, amount).unwrap_or_else(|e| panic_with_error!(env, e));
    Transfer {
        from: from.clone(),
        to: to.clone(),
        amount,
    }
    .publish(env);
}

fn credit(env: &Env, to: &Address, amount: i128) -> Result<(), TokenError> {
    let key = DataKey::Balance(to.clone());
    let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    let new_balance = balance
        .checked_add(amount)
        .ok_or(TokenError::MathOverflow)?;
    env.storage().persistent().set(&key, &new_balance);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

    let supply = MockYieldToken::total_supply(env.clone());
    let new_supply = supply.checked_add(amount).ok_or(TokenError::MathOverflow)?;
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &new_supply);
    extend_instance(env);
    Ok(())
}

fn debit(env: &Env, from: &Address, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, TokenError::InvalidAmount);
    }
    let key = DataKey::Balance(from.clone());
    let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    if balance < amount {
        panic_with_error!(env, TokenError::InsufficientBalance);
    }
    env.storage().persistent().set(&key, &(balance - amount));
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

    let supply = MockYieldToken::total_supply(env.clone());
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &(supply - amount));
    extend_instance(env);
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
        panic_with_error!(env, TokenError::InvalidAmount);
    }
    let allowance = read_allowance(env, from, spender);
    if allowance.amount < amount {
        panic_with_error!(env, TokenError::InsufficientAllowance);
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

fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;
