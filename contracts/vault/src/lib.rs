#![no_std]

//! stellas-vault: a crowdfunding-style deposit/withdraw vault for native XLM.
//!
//! Users deposit and withdraw the vault's configured token (the native XLM
//! Stellar Asset Contract on testnet); the contract tracks a running total,
//! a per-user balance, and a contributor count, and publishes an event on
//! every deposit/withdraw so a frontend can drive a live activity feed.

use soroban_sdk::{contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env, MuxedAddress};

/// Ledger counts for TTL management (~5s per ledger on testnet).
/// Extend once the remaining TTL drops below ~14 days, back up to ~30 days.
const TTL_THRESHOLD: u32 = 14 * 24 * 60 * 12; // ~241_920 ledgers
const TTL_EXTEND_TO: u32 = 30 * 24 * 60 * 12; // ~518_400 ledgers

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Goal,
    Token,
    Total,
    Contributors,
    Balance(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VaultError {
    /// The vault has already been initialized and cannot be reconfigured.
    AlreadyInitialized = 1,
    /// The vault has not been initialized yet.
    NotInitialized = 2,
    /// The amount must be greater than zero.
    InvalidAmount = 3,
    /// The requested amount exceeds your recorded balance in the vault.
    InsufficientBalance = 4,
}

/// Published on every successful deposit. `new_total` lets a frontend update
/// the funding-pot progress bar from the event alone, without a re-read.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposit {
    #[topic]
    pub from: Address,
    pub amount: i128,
    pub new_total: i128,
}

/// Published on every successful withdrawal.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Withdraw {
    #[topic]
    pub to: Address,
    pub amount: i128,
    pub new_total: i128,
}

#[contract]
pub struct VaultContract;

#[contractimpl]
impl VaultContract {
    /// One-time setup. Rejects a second call so the vault's config can never
    /// be silently replaced.
    pub fn initialize(env: Env, admin: Address, goal: i128, token: Address) -> Result<(), VaultError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(VaultError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Goal, &goal);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Total, &0i128);
        env.storage().instance().set(&DataKey::Contributors, &0u32);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Deposit `amount` of the vault's token from `from` into the vault.
    /// Requires `from`'s authorization. Returns the new running total.
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<i128, VaultError> {
        from.require_auth();
        if amount <= 0 {
            return Err(VaultError::InvalidAmount);
        }
        let token_address = Self::require_token(&env)?;

        let token_client = token::TokenClient::new(&env, &token_address);
        token_client.transfer(&from, &MuxedAddress::from(&env.current_contract_address()), &amount);

        let balance_key = DataKey::Balance(from.clone());
        let prev_balance: i128 = env.storage().persistent().get(&balance_key).unwrap_or(0);
        if prev_balance == 0 {
            let contributors: u32 = env.storage().instance().get(&DataKey::Contributors).unwrap_or(0);
            env.storage().instance().set(&DataKey::Contributors, &(contributors + 1));
        }
        let new_balance = prev_balance + amount;
        env.storage().persistent().set(&balance_key, &new_balance);
        env.storage().persistent().extend_ttl(&balance_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        let total: i128 = env.storage().instance().get(&DataKey::Total).unwrap_or(0);
        let new_total = total + amount;
        env.storage().instance().set(&DataKey::Total, &new_total);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        Deposit { from, amount, new_total }.publish(&env);

        Ok(new_total)
    }

    /// Withdraw `amount` of the vault's token back to `to`, from `to`'s own
    /// recorded balance. Requires `to`'s authorization. Returns the new
    /// running total.
    pub fn withdraw(env: Env, to: Address, amount: i128) -> Result<i128, VaultError> {
        to.require_auth();
        if amount <= 0 {
            return Err(VaultError::InvalidAmount);
        }
        let token_address = Self::require_token(&env)?;

        let balance_key = DataKey::Balance(to.clone());
        let prev_balance: i128 = env.storage().persistent().get(&balance_key).unwrap_or(0);
        if amount > prev_balance {
            return Err(VaultError::InsufficientBalance);
        }

        let new_balance = prev_balance - amount;
        env.storage().persistent().set(&balance_key, &new_balance);
        env.storage().persistent().extend_ttl(&balance_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        let total: i128 = env.storage().instance().get(&DataKey::Total).unwrap_or(0);
        let new_total = total - amount;
        env.storage().instance().set(&DataKey::Total, &new_total);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        let token_client = token::TokenClient::new(&env, &token_address);
        token_client.transfer(
            &env.current_contract_address(),
            &MuxedAddress::from(&to),
            &amount,
        );

        Withdraw { to, amount, new_total }.publish(&env);

        Ok(new_total)
    }

    pub fn get_total(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Total).unwrap_or(0)
    }

    pub fn get_goal(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Goal).unwrap_or(0)
    }

    pub fn get_contributors(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Contributors).unwrap_or(0)
    }

    pub fn get_balance(env: Env, addr: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(addr))
            .unwrap_or(0)
    }

    fn require_token(env: &Env) -> Result<Address, VaultError> {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(VaultError::NotInitialized)
    }
}

#[cfg(test)]
mod test;
