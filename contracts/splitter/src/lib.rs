#![no_std]

//! Splitter/Market: splits Standardized-Yield (SY) into a Principal Token (PT)
//! and a Yield Token (YT) for a chosen maturity, the core of a Pendle-style
//! fixed-income primitive.
//!
//! ## Mechanism (reserve accounting)
//!
//! PT and YT are internal, non-transferable per-`(user, maturity)` balances in
//! this v0 (transferable tokens + an AMM are a later belt). Since they only
//! ever change together before maturity, `pt == yt` per position pre-maturity,
//! which lets us account yield with a simple per-user reserve instead of a
//! global index:
//!
//! For a position holding `yt` principal units, the protocol reserves
//! `reserve_sy = ceil(yt * RATE_SCALE / R)` SY — the SY needed to back the
//! principal at the current exchange rate `R`. As `R` grows the required
//! reserve shrinks, and **the released difference is the yield**, moved to
//! `accrued_sy` on every settle. This is the Pendle mechanism expressed as a
//! reserve delta, exact under integer math.
//!
//! ## Rounding law
//!
//! Every amount that leaves the protocol is rounded **down** (floor); every
//! amount reserved against a liability is rounded **up** (ceil). Consequence:
//! the SY the contract holds is always `>= sum(reserve_sy) + sum(accrued_sy)`,
//! so there is never mintable dust. Post-maturity, YT stops accruing and PT
//! redeems the fixed principal at the frozen maturity rate.

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, Address,
    Env, Vec,
};

/// Exchange-rate fixed-point scale (must match the yield token's `RATE_SCALE`).
pub const RATE_SCALE: i128 = 1_000_000_000_000;

/// TTL management (~5s per ledger on testnet): extend below ~14 days, up to ~30 days.
const TTL_THRESHOLD: u32 = 14 * 24 * 60 * 12;
const TTL_EXTEND_TO: u32 = 30 * 24 * 60 * 12;

/// Cap on registered maturities to keep the instance entry bounded.
const MAX_MATURITIES: u32 = 32;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    SyVault,
    Maturities,
    Totals(u64),
    Position(Address, u64),
}

/// Per-user, per-maturity position.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Position {
    /// Principal-token balance (asset-denominated, 7 decimals).
    pub pt: i128,
    /// Yield-token balance (asset-denominated, 7 decimals).
    pub yt: i128,
    /// SY reserved to back the principal at the last settle.
    pub reserve_sy: i128,
    /// SY yield accrued and claimable so far.
    pub accrued_sy: i128,
}

/// Aggregate PT/YT supplies for a maturity.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MaturityTotals {
    pub pt_supply: i128,
    pub yt_supply: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SplitterError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    MaturityNotFound = 4,
    MaturityAlreadyExists = 5,
    MaturityInPast = 6,
    MaturityPassed = 7,
    MaturityNotReached = 8,
    InsufficientPt = 9,
    InsufficientYt = 10,
    NothingToClaim = 11,
    Unauthorized = 12,
    MathOverflow = 13,
}

/// Cross-contract view of the SY vault the Splitter operates on.
///
/// `transfer` matches the vault's SEP-41 entry point: declaring `to` as a
/// plain `Address` here is wire-compatible with the vault's `MuxedAddress`
/// parameter (an Address ScVal is a valid MuxedAddress — the same guarantee
/// the vault itself relies on when calling the underlying token).
#[contractclient(name = "SyVaultClient")]
pub trait SyVaultInterface {
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
    fn exchange_rate(env: Env) -> i128;
    fn exchange_rate_at(env: Env, ts: u64) -> i128;
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MaturityCreated {
    pub maturity: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Split {
    #[topic]
    pub from: Address,
    pub maturity: u64,
    pub sy_in: i128,
    pub pt_out: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Merge {
    #[topic]
    pub from: Address,
    pub maturity: u64,
    pub pt_in: i128,
    pub sy_out: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldClaim {
    #[topic]
    pub from: Address,
    pub maturity: u64,
    pub sy_out: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PtRedeem {
    #[topic]
    pub from: Address,
    pub maturity: u64,
    pub pt_in: i128,
    pub sy_out: i128,
}

#[contract]
pub struct Splitter;

#[contractimpl]
impl Splitter {
    /// Constructor: runs once at deploy (no front-run). Records the admin and
    /// the SY vault this Splitter operates on.
    pub fn __constructor(env: Env, admin: Address, sy_vault: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::SyVault, &sy_vault);
        env.storage()
            .instance()
            .set(&DataKey::Maturities, &Vec::<u64>::new(&env));
        extend_instance(&env);
    }

    /// Admin-only: register a new maturity timestamp (must be in the future).
    pub fn create_maturity(env: Env, maturity: u64) -> Result<(), SplitterError> {
        let admin = Self::require_admin(&env)?;
        admin.require_auth();
        if maturity <= env.ledger().timestamp() {
            return Err(SplitterError::MaturityInPast);
        }
        let mut maturities = Self::load_maturities(&env);
        if maturities.iter().any(|m| m == maturity) {
            return Err(SplitterError::MaturityAlreadyExists);
        }
        // Bound the instance-stored list (admin-only, but keep the entry small).
        if maturities.len() >= MAX_MATURITIES {
            return Err(SplitterError::MathOverflow);
        }
        maturities.push_back(maturity);
        env.storage()
            .instance()
            .set(&DataKey::Maturities, &maturities);
        extend_instance(&env);
        MaturityCreated { maturity }.publish(&env);
        Ok(())
    }

    /// Split `sy_amount` SY into equal PT and YT for `maturity` (pre-maturity).
    /// Pulls the SY into the Splitter (cross-contract) and mints PT/YT.
    /// Returns the PT (== YT) amount minted.
    pub fn split(
        env: Env,
        from: Address,
        maturity: u64,
        sy_amount: i128,
    ) -> Result<i128, SplitterError> {
        from.require_auth();
        if sy_amount <= 0 {
            return Err(SplitterError::InvalidAmount);
        }
        Self::require_maturity(&env, maturity)?;
        if env.ledger().timestamp() >= maturity {
            return Err(SplitterError::MaturityPassed);
        }
        let sy = Self::sy_client(&env)?;
        let r = sy.exchange_rate();

        // PT/YT minted = principal value of the deposited SY at rate r (floor).
        let pt_out = mul_div_floor(sy_amount, r, RATE_SCALE)?;
        if pt_out <= 0 {
            return Err(SplitterError::InvalidAmount);
        }
        // SY reserved to back that principal (ceil; provably <= sy_amount).
        let reserve_add = mul_div_ceil(pt_out, RATE_SCALE, r)?;

        // Pull the full SY in; the (sy_amount - reserve_add) dust is surplus.
        sy.transfer(&from, &env.current_contract_address(), &sy_amount);

        let mut pos = Self::load_position(&env, &from, maturity);
        Self::settle(&env, &mut pos, maturity, &sy)?;
        pos.pt = pos
            .pt
            .checked_add(pt_out)
            .ok_or(SplitterError::MathOverflow)?;
        pos.yt = pos
            .yt
            .checked_add(pt_out)
            .ok_or(SplitterError::MathOverflow)?;
        pos.reserve_sy = pos
            .reserve_sy
            .checked_add(reserve_add)
            .ok_or(SplitterError::MathOverflow)?;
        Self::save_position(&env, &from, maturity, &pos);
        Self::adjust_totals(&env, maturity, pt_out, pt_out)?;

        Split {
            from,
            maturity,
            sy_in: sy_amount,
            pt_out,
        }
        .publish(&env);
        Ok(pt_out)
    }

    /// Merge `pt_amount` PT + `pt_amount` YT back into SY (pre-maturity).
    /// Returns the SY paid out.
    pub fn merge(
        env: Env,
        from: Address,
        maturity: u64,
        pt_amount: i128,
    ) -> Result<i128, SplitterError> {
        from.require_auth();
        if pt_amount <= 0 {
            return Err(SplitterError::InvalidAmount);
        }
        Self::require_maturity(&env, maturity)?;
        if env.ledger().timestamp() >= maturity {
            return Err(SplitterError::MaturityPassed);
        }
        let sy = Self::sy_client(&env)?;
        let mut pos = Self::load_position(&env, &from, maturity);
        Self::settle(&env, &mut pos, maturity, &sy)?;
        if pos.pt < pt_amount {
            return Err(SplitterError::InsufficientPt);
        }
        if pos.yt < pt_amount {
            return Err(SplitterError::InsufficientYt);
        }

        let r = sy.exchange_rate();
        let sy_out = mul_div_floor(pt_amount, RATE_SCALE, r)?;

        pos.pt = pos
            .pt
            .checked_sub(pt_amount)
            .ok_or(SplitterError::MathOverflow)?;
        pos.yt = pos
            .yt
            .checked_sub(pt_amount)
            .ok_or(SplitterError::MathOverflow)?;
        // Recompute the reserve for the remaining YT; the released reserve
        // covers sy_out (any excess stays as protocol surplus).
        let new_reserve = mul_div_ceil(pos.yt, RATE_SCALE, r)?;
        pos.reserve_sy = new_reserve;
        Self::save_position(&env, &from, maturity, &pos);
        Self::adjust_totals(&env, maturity, -pt_amount, -pt_amount)?;

        if sy_out > 0 {
            sy.transfer(&env.current_contract_address(), &from, &sy_out);
        }
        Merge {
            from,
            maturity,
            pt_in: pt_amount,
            sy_out,
        }
        .publish(&env);
        Ok(sy_out)
    }

    /// Claim all yield accrued by the caller's YT for `maturity` (any time;
    /// accrual is capped at maturity). Returns the SY paid out.
    pub fn claim_yield(env: Env, from: Address, maturity: u64) -> Result<i128, SplitterError> {
        from.require_auth();
        Self::require_maturity(&env, maturity)?;
        let sy = Self::sy_client(&env)?;
        let mut pos = Self::load_position(&env, &from, maturity);
        Self::settle(&env, &mut pos, maturity, &sy)?;

        let amount = pos.accrued_sy;
        if amount <= 0 {
            return Err(SplitterError::NothingToClaim);
        }
        pos.accrued_sy = 0;
        Self::save_position(&env, &from, maturity, &pos);

        sy.transfer(&env.current_contract_address(), &from, &amount);
        YieldClaim {
            from,
            maturity,
            sy_out: amount,
        }
        .publish(&env);
        Ok(amount)
    }

    /// Redeem `pt_amount` PT for its fixed principal in SY, at or after
    /// maturity (settled at the frozen maturity rate). Returns the SY paid out.
    pub fn redeem_pt(
        env: Env,
        from: Address,
        maturity: u64,
        pt_amount: i128,
    ) -> Result<i128, SplitterError> {
        from.require_auth();
        if pt_amount <= 0 {
            return Err(SplitterError::InvalidAmount);
        }
        Self::require_maturity(&env, maturity)?;
        if env.ledger().timestamp() < maturity {
            return Err(SplitterError::MaturityNotReached);
        }
        let sy = Self::sy_client(&env)?;
        let mut pos = Self::load_position(&env, &from, maturity);
        Self::settle(&env, &mut pos, maturity, &sy)?;
        if pos.pt < pt_amount {
            return Err(SplitterError::InsufficientPt);
        }

        // Principal is valued at the frozen maturity rate.
        let r_t = sy.exchange_rate_at(&maturity);
        let raw = mul_div_floor(pt_amount, RATE_SCALE, r_t)?;
        // Solvency clamp: never pay more than the position's reserve holds.
        let sy_out = raw.min(pos.reserve_sy);

        pos.pt = pos
            .pt
            .checked_sub(pt_amount)
            .ok_or(SplitterError::MathOverflow)?;
        pos.reserve_sy = pos
            .reserve_sy
            .checked_sub(sy_out)
            .ok_or(SplitterError::MathOverflow)?;
        Self::save_position(&env, &from, maturity, &pos);
        Self::adjust_totals(&env, maturity, -pt_amount, 0)?;

        if sy_out > 0 {
            sy.transfer(&env.current_contract_address(), &from, &sy_out);
        }
        PtRedeem {
            from,
            maturity,
            pt_in: pt_amount,
            sy_out,
        }
        .publish(&env);
        Ok(sy_out)
    }

    // -- views --

    pub fn get_maturities(env: Env) -> Vec<u64> {
        Self::load_maturities(&env)
    }

    pub fn get_position(env: Env, addr: Address, maturity: u64) -> Position {
        Self::load_position(&env, &addr, maturity)
    }

    pub fn get_totals(env: Env, maturity: u64) -> MaturityTotals {
        env.storage()
            .persistent()
            .get(&DataKey::Totals(maturity))
            .unwrap_or(MaturityTotals {
                pt_supply: 0,
                yt_supply: 0,
            })
    }

    /// SY the caller could claim right now (read-only settle preview).
    pub fn preview_claimable(
        env: Env,
        addr: Address,
        maturity: u64,
    ) -> Result<i128, SplitterError> {
        Self::require_maturity(&env, maturity)?;
        let sy = Self::sy_client(&env)?;
        let pos = Self::load_position(&env, &addr, maturity);
        let released = Self::released_yield(&env, &pos, maturity, &sy)?;
        Ok(pos.accrued_sy + released)
    }

    // -- internal --

    /// Move newly-released reserve into `accrued_sy` and shrink the reserve.
    fn settle(
        env: &Env,
        pos: &mut Position,
        maturity: u64,
        sy: &SyVaultClient,
    ) -> Result<(), SplitterError> {
        let released = Self::released_yield(env, pos, maturity, sy)?;
        if released > 0 {
            pos.accrued_sy = pos
                .accrued_sy
                .checked_add(released)
                .ok_or(SplitterError::MathOverflow)?;
            pos.reserve_sy = pos
                .reserve_sy
                .checked_sub(released)
                .ok_or(SplitterError::MathOverflow)?;
        }
        Ok(())
    }

    /// Reserve released since the last settle: `reserve_sy - ceil(yt*S/R_eff)`,
    /// where `R_eff` is the rate at `min(now, maturity)` (accrual frozen at T).
    fn released_yield(
        env: &Env,
        pos: &Position,
        maturity: u64,
        sy: &SyVaultClient,
    ) -> Result<i128, SplitterError> {
        if pos.yt <= 0 {
            return Ok(0);
        }
        let t_eff = env.ledger().timestamp().min(maturity);
        let r_eff = sy.exchange_rate_at(&t_eff);
        let needed = mul_div_ceil(pos.yt, RATE_SCALE, r_eff)?;
        if needed < pos.reserve_sy {
            Ok(pos.reserve_sy - needed)
        } else {
            Ok(0)
        }
    }

    fn adjust_totals(
        env: &Env,
        maturity: u64,
        d_pt: i128,
        d_yt: i128,
    ) -> Result<(), SplitterError> {
        let mut totals = Self::get_totals(env.clone(), maturity);
        totals.pt_supply = totals
            .pt_supply
            .checked_add(d_pt)
            .ok_or(SplitterError::MathOverflow)?;
        totals.yt_supply = totals
            .yt_supply
            .checked_add(d_yt)
            .ok_or(SplitterError::MathOverflow)?;
        let key = DataKey::Totals(maturity);
        env.storage().persistent().set(&key, &totals);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    fn load_position(env: &Env, addr: &Address, maturity: u64) -> Position {
        env.storage()
            .persistent()
            .get(&DataKey::Position(addr.clone(), maturity))
            .unwrap_or(Position {
                pt: 0,
                yt: 0,
                reserve_sy: 0,
                accrued_sy: 0,
            })
    }

    fn save_position(env: &Env, addr: &Address, maturity: u64, pos: &Position) {
        let key = DataKey::Position(addr.clone(), maturity);
        env.storage().persistent().set(&key, pos);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        // Every mutating op saves a position, so this keeps the instance entry
        // (Admin/SyVault/Maturities) alive on hot paths that create no new maturity.
        extend_instance(env);
    }

    fn load_maturities(env: &Env) -> Vec<u64> {
        env.storage()
            .instance()
            .get(&DataKey::Maturities)
            .unwrap_or_else(|| Vec::new(env))
    }

    fn require_maturity(env: &Env, maturity: u64) -> Result<(), SplitterError> {
        if Self::load_maturities(env).iter().any(|m| m == maturity) {
            Ok(())
        } else {
            Err(SplitterError::MaturityNotFound)
        }
    }

    fn require_admin(env: &Env) -> Result<Address, SplitterError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(SplitterError::NotInitialized)
    }

    fn sy_client<'a>(env: &'a Env) -> Result<SyVaultClient<'a>, SplitterError> {
        let addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::SyVault)
            .ok_or(SplitterError::NotInitialized)?;
        Ok(SyVaultClient::new(env, &addr))
    }
}

/// `floor(a * b / c)` with overflow checks. Inputs are non-negative.
fn mul_div_floor(a: i128, b: i128, c: i128) -> Result<i128, SplitterError> {
    if c <= 0 {
        return Err(SplitterError::MathOverflow);
    }
    let prod = a.checked_mul(b).ok_or(SplitterError::MathOverflow)?;
    Ok(prod / c)
}

/// `ceil(a * b / c)` with overflow checks. Inputs are non-negative, `c > 0`.
fn mul_div_ceil(a: i128, b: i128, c: i128) -> Result<i128, SplitterError> {
    if c <= 0 {
        return Err(SplitterError::MathOverflow);
    }
    let prod = a.checked_mul(b).ok_or(SplitterError::MathOverflow)?;
    let sum = prod.checked_add(c - 1).ok_or(SplitterError::MathOverflow)?;
    Ok(sum / c)
}

fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;
#[cfg(test)]
mod test_lifecycle;
