#![no_std]

//! Yield Token (YT): a SEP-41 token with a **settlement hook**, one instance
//! per maturity, factory-deployed by the Market (Splitter). A YT holder
//! receives all the yield its backing SY generates until maturity — so yield
//! entitlement must be settled for *both* parties whenever a balance changes
//! hands, or a transfer would silently reassign accrued-but-unclaimed yield.
//!
//! ## The hook, and why balances travel as arguments
//!
//! Every user-facing balance change (`transfer`, `transfer_from`, `burn`,
//! `burn_from`) first calls `Market.on_yt_transfer(yt_token, from, to,
//! from_bal, to_bal)` with the **pre-change** balances, and only then moves
//! the tokens. Soroban forbids reentering a contract already on the call
//! stack — including view calls — so while this token is mid-call the Market
//! cannot read `YT.balance()` back. The token therefore passes its own
//! authoritative pre-change balances as arguments; the Market trusts them
//! because it verifies the caller is its registered YT instance.
//!
//! `mint` and `market_burn` are **hook-free** by design: they are only ever
//! invoked *by* the Market (which settles internally first), and a hook there
//! would reenter the Market. `market_burn` requires both the Market's auth
//! (so outsiders cannot skip settlement) and the holder's nested auth.
//!
//! Burning YT directly (standard `burn`, hook fires first) forfeits the
//! remaining yield stream to the protocol as surplus — harmless to solvency.

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, token::TokenInterface, Address, Env, MuxedAddress, String,
};

/// TTL management (~5s per ledger on testnet): extend below ~14 days, up to ~30 days.
const TTL_THRESHOLD: u32 = 14 * 24 * 60 * 12;
const TTL_EXTEND_TO: u32 = 30 * 24 * 60 * 12;

/// Token metadata (7 decimals, Stellar-style).
const DECIMALS: u32 = 7;

/// The Market's settlement hook, called before any user-facing balance change.
#[contractclient(name = "MarketHookClient")]
pub trait MarketHookInterface {
    fn on_yt_transfer(
        env: Env,
        yt_token: Address,
        from: Address,
        to: Option<Address>,
        from_bal: i128,
        to_bal: i128,
    );
}

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
pub enum YtError {
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
pub struct YtToken;

// -- custom (non-SEP-41) methods --
#[contractimpl]
impl YtToken {
    /// Constructor: runs once, atomically, at factory deploy. Records the
    /// Market (sole minter, settlement hook target) and per-maturity metadata.
    pub fn __constructor(env: Env, market: Address, name: String, symbol: String) {
        env.storage().instance().set(&DataKey::Market, &market);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
        extend_instance(&env);
    }

    /// Market-only mint — hook-free: the Market settles the receiver before
    /// minting, and a hook here would reenter the Market.
    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), YtError> {
        let market = Self::require_market(&env)?;
        market.require_auth();
        if amount <= 0 {
            return Err(YtError::InvalidAmount);
        }
        credit(&env, &to, amount)?;
        add_supply(&env, amount)?;
        Mint { to, amount }.publish(&env);
        Ok(())
    }

    /// Market-initiated burn (merge / post-maturity flows) — hook-free for the
    /// same reentrancy reason; the Market settles `from` before calling this.
    /// Dual auth: the Market's (invoker) so outsiders cannot bypass the
    /// settlement hook, and the holder's (nested, one wallet signature).
    pub fn market_burn(env: Env, from: Address, amount: i128) -> Result<(), YtError> {
        let market = Self::require_market(&env)?;
        market.require_auth();
        from.require_auth();
        if amount <= 0 {
            return Err(YtError::InvalidAmount);
        }
        debit(&env, &from, amount)?;
        sub_supply(&env, amount)?;
        Burn { from, amount }.publish(&env);
        Ok(())
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    /// The Market this token belongs to (minter + hook target).
    pub fn market(env: Env) -> Result<Address, YtError> {
        Self::require_market(&env)
    }

    fn require_market(env: &Env) -> Result<Address, YtError> {
        env.storage()
            .instance()
            .get(&DataKey::Market)
            .ok_or(YtError::NotInitialized)
    }
}

// -- SEP-41 TokenInterface --
#[contractimpl]
impl TokenInterface for YtToken {
    fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        read_allowance(&env, &from, &spender).amount
    }

    fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        if amount < 0 {
            panic_with_error!(&env, YtError::InvalidAmount);
        }
        if amount > 0 && expiration_ledger < env.ledger().sequence() {
            panic_with_error!(&env, YtError::AllowanceExpired);
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
        read_balance(&env, &id)
    }

    fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
        from.require_auth();
        let to = to.address();
        settle_then_move(&env, &from, &to, amount);
    }

    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        spend_allowance(&env, &from, &spender, amount);
        settle_then_move(&env, &from, &to, amount);
    }

    fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        settle_then_burn(&env, &from, amount);
    }

    fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        spend_allowance(&env, &from, &spender, amount);
        settle_then_burn(&env, &from, amount);
    }

    fn decimals(_env: Env) -> u32 {
        DECIMALS
    }

    fn name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Name)
            .unwrap_or_else(|| panic_with_error!(&env, YtError::NotInitialized))
    }

    fn symbol(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Symbol)
            .unwrap_or_else(|| panic_with_error!(&env, YtError::NotInitialized))
    }
}

// -- internal helpers --

/// Settle both parties in the Market (pre-change balances as args), then move.
/// Self-transfers only check the balance — no hook, no move (a no-op).
fn settle_then_move(env: &Env, from: &Address, to: &Address, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, YtError::InvalidAmount);
    }
    let from_bal = read_balance(env, from);
    if from_bal < amount {
        panic_with_error!(env, YtError::InsufficientBalance);
    }
    if from != to {
        let to_bal = read_balance(env, to);
        call_hook(env, from, Some(to.clone()), from_bal, to_bal);
        debit(env, from, amount).unwrap_or_else(|e| panic_with_error!(env, e));
        credit(env, to, amount).unwrap_or_else(|e| panic_with_error!(env, e));
    }
    extend_instance(env);
    Transfer {
        from: from.clone(),
        to: to.clone(),
        amount,
    }
    .publish(env);
}

/// Settle `from` in the Market (pre-change balance as arg), then burn.
fn settle_then_burn(env: &Env, from: &Address, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, YtError::InvalidAmount);
    }
    let from_bal = read_balance(env, from);
    if from_bal < amount {
        panic_with_error!(env, YtError::InsufficientBalance);
    }
    call_hook(env, from, None, from_bal, 0);
    debit(env, from, amount).unwrap_or_else(|e| panic_with_error!(env, e));
    sub_supply(env, amount).unwrap_or_else(|e| panic_with_error!(env, e));
    Burn {
        from: from.clone(),
        amount,
    }
    .publish(env);
}

fn call_hook(env: &Env, from: &Address, to: Option<Address>, from_bal: i128, to_bal: i128) {
    let market: Address = env
        .storage()
        .instance()
        .get(&DataKey::Market)
        .unwrap_or_else(|| panic_with_error!(env, YtError::NotInitialized));
    MarketHookClient::new(env, &market).on_yt_transfer(
        &env.current_contract_address(),
        from,
        &to,
        &from_bal,
        &to_bal,
    );
}

fn read_balance(env: &Env, id: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Balance(id.clone()))
        .unwrap_or(0)
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
        panic_with_error!(env, YtError::InvalidAmount);
    }
    let allowance = read_allowance(env, from, spender);
    if allowance.amount < amount {
        panic_with_error!(env, YtError::InsufficientAllowance);
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

fn credit(env: &Env, to: &Address, amount: i128) -> Result<i128, YtError> {
    let key = DataKey::Balance(to.clone());
    let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    let new_balance = balance.checked_add(amount).ok_or(YtError::MathOverflow)?;
    env.storage().persistent().set(&key, &new_balance);
    extend_position(env, &key);
    Ok(new_balance)
}

fn debit(env: &Env, from: &Address, amount: i128) -> Result<i128, YtError> {
    let key = DataKey::Balance(from.clone());
    let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    if balance < amount {
        return Err(YtError::InsufficientBalance);
    }
    let new_balance = balance - amount;
    env.storage().persistent().set(&key, &new_balance);
    extend_position(env, &key);
    Ok(new_balance)
}

fn add_supply(env: &Env, amount: i128) -> Result<(), YtError> {
    let supply = YtToken::total_supply(env.clone());
    let new_supply = supply.checked_add(amount).ok_or(YtError::MathOverflow)?;
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &new_supply);
    extend_instance(env);
    Ok(())
}

fn sub_supply(env: &Env, amount: i128) -> Result<(), YtError> {
    let supply = YtToken::total_supply(env.clone());
    let new_supply = supply.checked_sub(amount).ok_or(YtError::MathOverflow)?;
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &new_supply);
    extend_instance(env);
    Ok(())
}

/// YT balances are topped up to the network maximum, not to the 30-day window
/// used for config: a YT holder waiting to claim accrued yield touches nothing
/// until they do, and only their own transfers would otherwise refresh the
/// entry. The 14-day threshold keeps the top-up rare rather than per-operation.
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
