#![no_std]

//! SYVault: a Standardized-Yield wrapper over a yield-bearing token.
//!
//! Users `wrap` the underlying yield token (the MockYieldToken) into SY at a
//! 1:1 ratio and `unwrap` back. SY is an internal balance ledger inside this
//! contract, with a `transfer` entry point so the Splitter can pull SY from a
//! user and pay it back cross-contract. The vault delegates its exchange rate
//! to the underlying token, so `value(SY) == value(underlying)` always holds.
//! This is the direct evolution of the Yellow-belt crowdfunding vault.

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token,
    Address, Env, MuxedAddress,
};

/// TTL management (~5s per ledger on testnet): extend below ~14 days, up to ~30 days.
const TTL_THRESHOLD: u32 = 14 * 24 * 60 * 12;
const TTL_EXTEND_TO: u32 = 30 * 24 * 60 * 12;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    YieldToken,
    TotalSupply,
    Balance(Address),
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
pub struct SyTransfer {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contract]
pub struct SyVault;

#[contractimpl]
impl SyVault {
    /// One-time setup: record the admin and the underlying yield token.
    pub fn initialize(env: Env, admin: Address, yield_token: Address) -> Result<(), SyError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(SyError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::YieldToken, &yield_token);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
        extend_instance(&env);
        Ok(())
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
        let new_total = sub_supply(&env, amount);

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

    /// Move `amount` SY from `from` to `to`. `from.require_auth()` — when the
    /// Splitter calls this with itself as `from`, invoker-contract auth passes
    /// with no signature; when it moves a user's SY, the user's wallet covers
    /// the nested auth entry in one signature.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), SyError> {
        from.require_auth();
        if amount <= 0 {
            return Err(SyError::InvalidAmount);
        }
        debit(&env, &from, amount)?;
        credit(&env, &to, amount)?;
        SyTransfer { from, to, amount }.publish(&env);
        Ok(())
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
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

// -- internal SY balance helpers --

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

fn sub_supply(env: &Env, amount: i128) -> i128 {
    let supply = SyVault::total_supply(env.clone());
    let new_supply = supply - amount;
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &new_supply);
    extend_instance(env);
    new_supply
}

fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;
