#![no_std]

//! Principal Token (PT): a minimal SEP-41 token, one instance per maturity,
//! factory-deployed by the Market (Splitter). 1 PT redeems SY worth exactly
//! one asset unit at maturity, so holding PT bought at a discount is a fixed
//! rate. Minting is Market-only; transfers and burns are standard SEP-41 —
//! the Market burns a user's PT in `merge`/`redeem_pt` through the user's own
//! nested auth (one wallet signature covers the whole call tree).
//!
//! Burning PT directly forfeits the principal claim to the protocol (surplus);
//! `redeem_pt` on the Market is the value-preserving exit.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    token::TokenInterface, Address, Env, MuxedAddress, String,
};

/// TTL management (~5s per ledger on testnet): extend below ~14 days, up to ~30 days.
const TTL_THRESHOLD: u32 = 14 * 24 * 60 * 12;
const TTL_EXTEND_TO: u32 = 30 * 24 * 60 * 12;

/// Token metadata (7 decimals, Stellar-style).
const DECIMALS: u32 = 7;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Market,
    Name,
    Symbol,
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
pub enum PtError {
    NotInitialized = 1,
    InvalidAmount = 2,
    InsufficientBalance = 3,
    InsufficientAllowance = 4,
    AllowanceExpired = 5,
    MathOverflow = 6,
    Unauthorized = 7,
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
pub struct Mint {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Burn {
    #[topic]
    pub from: Address,
    pub amount: i128,
}

#[contract]
pub struct PtToken;

// -- custom (non-SEP-41) methods --
#[contractimpl]
impl PtToken {
    /// Constructor: runs once, atomically, at factory deploy. Records the
    /// Market (sole minter) and the per-maturity metadata.
    pub fn __constructor(env: Env, market: Address, name: String, symbol: String) {
        env.storage().instance().set(&DataKey::Market, &market);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
        extend_instance(&env);
    }

    /// Market-only mint. Passes automatically when the Market is the direct
    /// cross-contract invoker (invoker authorization).
    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), PtError> {
        let market = Self::require_market(&env)?;
        market.require_auth();
        if amount <= 0 {
            return Err(PtError::InvalidAmount);
        }
        credit(&env, &to, amount)?;
        add_supply(&env, amount)?;
        Mint { to, amount }.publish(&env);
        Ok(())
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    /// The Market this token belongs to (its sole minter).
    pub fn market(env: Env) -> Result<Address, PtError> {
        Self::require_market(&env)
    }

    fn require_market(env: &Env) -> Result<Address, PtError> {
        env.storage()
            .instance()
            .get(&DataKey::Market)
            .ok_or(PtError::NotInitialized)
    }
}

// -- SEP-41 TokenInterface --
#[contractimpl]
impl TokenInterface for PtToken {
    fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        read_allowance(&env, &from, &spender).amount
    }

    fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        if amount < 0 {
            panic_with_error!(&env, PtError::InvalidAmount);
        }
        if amount > 0 && expiration_ledger < env.ledger().sequence() {
            panic_with_error!(&env, PtError::AllowanceExpired);
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
        move_tokens(&env, &from, &to, amount);
    }

    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        spend_allowance(&env, &from, &spender, amount);
        move_tokens(&env, &from, &to, amount);
    }

    fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        burn_tokens(&env, &from, amount);
    }

    fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        spend_allowance(&env, &from, &spender, amount);
        burn_tokens(&env, &from, amount);
    }

    fn decimals(_env: Env) -> u32 {
        DECIMALS
    }

    fn name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Name)
            .unwrap_or_else(|| panic_with_error!(&env, PtError::NotInitialized))
    }

    fn symbol(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Symbol)
            .unwrap_or_else(|| panic_with_error!(&env, PtError::NotInitialized))
    }
}

// -- internal helpers --

fn move_tokens(env: &Env, from: &Address, to: &Address, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, PtError::InvalidAmount);
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

fn burn_tokens(env: &Env, from: &Address, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, PtError::InvalidAmount);
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
        panic_with_error!(env, PtError::InvalidAmount);
    }
    let allowance = read_allowance(env, from, spender);
    if allowance.amount < amount {
        panic_with_error!(env, PtError::InsufficientAllowance);
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

fn credit(env: &Env, to: &Address, amount: i128) -> Result<i128, PtError> {
    let key = DataKey::Balance(to.clone());
    let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    let new_balance = balance.checked_add(amount).ok_or(PtError::MathOverflow)?;
    env.storage().persistent().set(&key, &new_balance);
    extend_position(env, &key);
    Ok(new_balance)
}

fn debit(env: &Env, from: &Address, amount: i128) -> Result<i128, PtError> {
    let key = DataKey::Balance(from.clone());
    let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    if balance < amount {
        return Err(PtError::InsufficientBalance);
    }
    let new_balance = balance - amount;
    env.storage().persistent().set(&key, &new_balance);
    extend_position(env, &key);
    Ok(new_balance)
}

fn add_supply(env: &Env, amount: i128) -> Result<(), PtError> {
    let supply = PtToken::total_supply(env.clone());
    let new_supply = supply.checked_add(amount).ok_or(PtError::MathOverflow)?;
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &new_supply);
    extend_instance(env);
    Ok(())
}

fn sub_supply(env: &Env, amount: i128) -> Result<(), PtError> {
    let supply = PtToken::total_supply(env.clone());
    let new_supply = supply.checked_sub(amount).ok_or(PtError::MathOverflow)?;
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &new_supply);
    extend_instance(env);
    Ok(())
}

/// PT balances are topped up to the network maximum, not to the 30-day window
/// used for config. Holding PT untouched until maturity is the headline use
/// case, and only the holder's own transfers would otherwise refresh the entry.
/// The 14-day threshold keeps the top-up rare rather than per-operation.
fn extend_position(env: &Env, key: &DataKey) {
    let max = env.storage().max_ttl();
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, max);
}

fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;
