#![no_std]

//! SYVault: a Standardized-Yield wrapper over a yield-bearing token.
//!
//! Users `wrap` the underlying yield token (the MockYieldToken) into SY at a
//! 1:1 ratio and `unwrap` back. SY is a **full SEP-41 token** (transfer,
//! allowances, burn, metadata), so any contract — the Splitter, the PT-AMM —
//! or wallet can hold and move it like any other token. The vault delegates
//! its exchange rate to the underlying token, so `value(SY) == value(underlying)`
//! always holds. This is the direct evolution of the Yellow-belt crowdfunding
//! vault, upgraded per MASTERPLAN Phase 1.

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, token, token::TokenInterface, Address, Env, MuxedAddress, String,
};

/// TTL management (~5s per ledger on testnet): extend below ~14 days, up to ~30 days.
const TTL_THRESHOLD: u32 = 14 * 24 * 60 * 12;
const TTL_EXTEND_TO: u32 = 30 * 24 * 60 * 12;

/// Token metadata (7 decimals, Stellar-style).
const DECIMALS: u32 = 7;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    YieldToken,
    TotalSupply,
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

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SyError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InsufficientBalance = 4,
    MathOverflow = 5,
    InsufficientAllowance = 6,
    AllowanceExpired = 7,
}

/// Minimal view of the underlying yield token, for exchange-rate delegation.
#[contractclient(name = "YieldRateClient")]
pub trait YieldRateInterface {
    fn exchange_rate(env: Env) -> i128;
    fn exchange_rate_at(env: Env, ts: u64) -> i128;
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Wrap {
    #[topic]
    pub from: Address,
    pub amount: i128,
    pub new_total_supply: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Unwrap {
    #[topic]
    pub from: Address,
    pub amount: i128,
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
pub struct SyVault;

// -- custom (non-SEP-41) methods --
#[contractimpl]
impl SyVault {
    /// Constructor: runs once at deploy (no front-run). Records the admin and
    /// the underlying yield token.
    pub fn __constructor(env: Env, admin: Address, yield_token: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::YieldToken, &yield_token);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
        extend_instance(&env);
    }

    /// Wrap `amount` of the underlying yield token into SY (1:1).
    /// Pulls the underlying from `from` into the vault (cross-contract) and
    /// credits SY. Returns the caller's new SY balance.
    pub fn wrap(env: Env, from: Address, amount: i128) -> Result<i128, SyError> {
        from.require_auth();
        if amount <= 0 {
            return Err(SyError::InvalidAmount);
        }
        let yield_token = Self::require_yield_token(&env)?;
        token::TokenClient::new(&env, &yield_token).transfer(
            &from,
            MuxedAddress::from(&env.current_contract_address()),
            &amount,
        );

        let new_balance = credit(&env, &from, amount)?;
        let new_total = add_supply(&env, amount)?;
        Wrap {
            from,
            amount,
            new_total_supply: new_total,
        }
        .publish(&env);
        Ok(new_balance)
    }

    /// Unwrap `amount` of SY back into the underlying yield token (1:1).
    /// Burns SY and sends the underlying back to `from` (cross-contract).
    /// Returns the caller's new SY balance.
    pub fn unwrap(env: Env, from: Address, amount: i128) -> Result<i128, SyError> {
        from.require_auth();
        if amount <= 0 {
            return Err(SyError::InvalidAmount);
        }
        let yield_token = Self::require_yield_token(&env)?;
        let new_balance = debit(&env, &from, amount)?;
        let new_total = sub_supply(&env, amount)?;

        token::TokenClient::new(&env, &yield_token).transfer(
            &env.current_contract_address(),
            MuxedAddress::from(&from),
            &amount,
        );
        Unwrap {
            from,
            amount,
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

    pub fn yield_token(env: Env) -> Result<Address, SyError> {
        Self::require_yield_token(&env)
    }

    /// Current exchange rate — delegated to the underlying yield token.
    pub fn exchange_rate(env: Env) -> Result<i128, SyError> {
        let yield_token = Self::require_yield_token(&env)?;
        Ok(YieldRateClient::new(&env, &yield_token).exchange_rate())
    }

    /// Exchange rate at `ts` — delegated to the underlying yield token.
    pub fn exchange_rate_at(env: Env, ts: u64) -> Result<i128, SyError> {
        let yield_token = Self::require_yield_token(&env)?;
        Ok(YieldRateClient::new(&env, &yield_token).exchange_rate_at(&ts))
    }

    fn require_yield_token(env: &Env) -> Result<Address, SyError> {
        env.storage()
            .instance()
            .get(&DataKey::YieldToken)
            .ok_or(SyError::NotInitialized)
    }
}

// -- SEP-41 TokenInterface --
//
// SEP-41 methods panic with `SyError` codes (per the interface contract) while
// the custom wrap/unwrap surface stays Result-based; on the wire both surface
// identically as `Error(Contract, #N)`.
#[contractimpl]
impl TokenInterface for SyVault {
    fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        read_allowance(&env, &from, &spender).amount
    }

    fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        if amount < 0 {
            panic_with_error!(&env, SyError::InvalidAmount);
        }
        if amount > 0 && expiration_ledger < env.ledger().sequence() {
            panic_with_error!(&env, SyError::AllowanceExpired);
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

    /// Burning SY destroys the shares and **forfeits the underlying claim to
    /// the vault** (the backing tokens stay put and become protocol surplus).
    /// `unwrap` remains the way to exit to the underlying; burn deliberately
    /// has no hidden transfer side-effects.
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
        String::from_str(&env, "Standardized Yield mUSDY")
    }

    fn symbol(env: Env) -> String {
        String::from_str(&env, "SY-mUSDY")
    }
}

// -- internal SY balance helpers --

fn move_sy(env: &Env, from: &Address, to: &Address, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, SyError::InvalidAmount);
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
        panic_with_error!(env, SyError::InvalidAmount);
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
        panic_with_error!(env, SyError::InvalidAmount);
    }
    let allowance = read_allowance(env, from, spender);
    if allowance.amount < amount {
        panic_with_error!(env, SyError::InsufficientAllowance);
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

fn credit(env: &Env, to: &Address, amount: i128) -> Result<i128, SyError> {
    let key = DataKey::Balance(to.clone());
    let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    let new_balance = balance.checked_add(amount).ok_or(SyError::MathOverflow)?;
    env.storage().persistent().set(&key, &new_balance);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    Ok(new_balance)
}

fn debit(env: &Env, from: &Address, amount: i128) -> Result<i128, SyError> {
    let key = DataKey::Balance(from.clone());
    let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    if balance < amount {
        return Err(SyError::InsufficientBalance);
    }
    let new_balance = balance - amount;
    env.storage().persistent().set(&key, &new_balance);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    Ok(new_balance)
}

fn add_supply(env: &Env, amount: i128) -> Result<i128, SyError> {
    let supply = SyVault::total_supply(env.clone());
    let new_supply = supply.checked_add(amount).ok_or(SyError::MathOverflow)?;
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &new_supply);
    extend_instance(env);
    Ok(new_supply)
}

fn sub_supply(env: &Env, amount: i128) -> Result<i128, SyError> {
    let supply = SyVault::total_supply(env.clone());
    let new_supply = supply.checked_sub(amount).ok_or(SyError::MathOverflow)?;
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
