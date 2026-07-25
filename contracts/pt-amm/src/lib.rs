#![no_std]

//! PT-AMM: constant-product pools trading PT against SY, one pool per
//! maturity — the price discovery that makes the fixed rate real. A PT
//! bought below par locks `(1/cost)^(YEAR/Δt) − 1` APY until maturity.
//!
//! Uniswap-V2 mechanics, deliberately minimal:
//! - `x·y = k` with a 30 bps fee on input: `out = in·997·R_out / (R_in·1000 + in·997)`.
//! - Internal reserve accounting (donations don't move the price).
//! - First liquidity mint locks `MINIMUM_LIQUIDITY` shares forever (owned by
//!   nobody), the V2 guard against share-inflation attacks.
//! - LP shares are an internal ledger keyed by `(provider, maturity)`.
//! - Maturity freeze: swaps and `add_liquidity` stop at maturity (PT pricing
//!   dies at par); `remove_liquidity` always works so LPs are never trapped.
//!
//! Rounding law (invariant I5/I6): everything paid out floors, so `k` never
//! decreases on a swap (it grows with fees) and `remove_liquidity` can never
//! pay more than the pro-rata share.

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, token, Address, Env, MuxedAddress,
};

/// TTL management (~5s per ledger on testnet): extend below ~14 days, up to ~30 days.
const TTL_THRESHOLD: u32 = 14 * 24 * 60 * 12;
const TTL_EXTEND_TO: u32 = 30 * 24 * 60 * 12;

/// LP shares locked to nobody at first mint (Uniswap-V2 inflation guard).
pub const MINIMUM_LIQUIDITY: i128 = 1000;

/// Fee: 30 bps on input, expressed as in·997/1000.
const FEE_NUM: i128 = 997;
const FEE_DEN: i128 = 1000;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Market,
    SyToken,
    /// Per-maturity pool state (instance: pool count is bounded by the
    /// Market's MAX_MATURITIES).
    Pool(u64),
    /// LP share ledger (persistent: unbounded per-provider).
    LpBalance(Address, u64),
}

/// One maturity's pool.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pool {
    /// The maturity's PT token, resolved once from the Market at creation.
    pub pt_token: Address,
    pub pt_reserve: i128,
    pub sy_reserve: i128,
    pub lp_total: i128,
}

/// Which asset goes in on a swap.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SwapSide {
    PtToSy,
    SyToPt,
}

/// The Market's token registry (only view this AMM needs).
#[contractclient(name = "MarketClient")]
pub trait MarketInterface {
    fn get_market(env: Env, maturity: u64) -> MaturityTokens;
    fn sy_vault(env: Env) -> Address;
}

/// Mirror of the Market's per-maturity token pair (decoded structurally).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MaturityTokens {
    pub pt: Address,
    pub yt: Address,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AmmError {
    NotInitialized = 1,
    InvalidAmount = 2,
    PoolNotFound = 3,
    PoolAlreadyExists = 4,
    MaturityNotFound = 5,
    MaturityPassed = 6,
    InsufficientLiquidity = 7,
    SlippageExceeded = 8,
    InsufficientLpBalance = 9,
    MathOverflow = 10,
    Unauthorized = 11,
    SyTokenMismatch = 12,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolCreated {
    pub maturity: u64,
    pub pt_token: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityAdded {
    #[topic]
    pub from: Address,
    pub maturity: u64,
    pub pt_in: i128,
    pub sy_in: i128,
    pub lp_minted: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityRemoved {
    #[topic]
    pub from: Address,
    pub maturity: u64,
    pub lp_burned: i128,
    pub pt_out: i128,
    pub sy_out: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Swap {
    #[topic]
    pub from: Address,
    pub maturity: u64,
    /// True when PT went in and SY came out.
    pub pt_in: bool,
    pub amount_in: i128,
    pub amount_out: i128,
}

#[contract]
pub struct PtAmm;

#[contractimpl]
impl PtAmm {
    /// Constructor: runs once at deploy. `market` resolves each maturity's PT
    /// token; `sy_token` is the SY vault every pool trades against.
    ///
    /// The two halves of every pool come from two different sources of truth —
    /// PT from the Market, SY from this argument — so the pairing is verified
    /// here, once. A pool trading real PT against an SY the Market does not
    /// settle in would let the deployer drain every LP, and there is no upgrade
    /// path to correct it afterwards.
    pub fn __constructor(env: Env, admin: Address, market: Address, sy_token: Address) {
        if MarketClient::new(&env, &market).sy_vault() != sy_token {
            panic_with_error!(&env, AmmError::SyTokenMismatch);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Market, &market);
        env.storage().instance().set(&DataKey::SyToken, &sy_token);
        extend_instance(&env);
    }

    /// Admin-only: open the PT/SY pool for a registered, unexpired maturity.
    pub fn create_pool(env: Env, maturity: u64) -> Result<(), AmmError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(AmmError::NotInitialized)?;
        admin.require_auth();
        if env.ledger().timestamp() >= maturity {
            return Err(AmmError::MaturityPassed);
        }
        if env.storage().instance().has(&DataKey::Pool(maturity)) {
            return Err(AmmError::PoolAlreadyExists);
        }
        let market: Address = env
            .storage()
            .instance()
            .get(&DataKey::Market)
            .ok_or(AmmError::NotInitialized)?;
        // try_: an unknown maturity traps inside the Market — surface it as
        // this contract's own clean error instead.
        let tokens = MarketClient::new(&env, &market)
            .try_get_market(&maturity)
            .map_err(|_| AmmError::MaturityNotFound)?
            .map_err(|_| AmmError::MaturityNotFound)?;

        let pool = Pool {
            pt_token: tokens.pt.clone(),
            pt_reserve: 0,
            sy_reserve: 0,
            lp_total: 0,
        };
        env.storage()
            .instance()
            .set(&DataKey::Pool(maturity), &pool);
        extend_instance(&env);
        PoolCreated {
            maturity,
            pt_token: tokens.pt,
        }
        .publish(&env);
        Ok(())
    }

    /// Provide liquidity. The first provider sets the price (and pays the
    /// `MINIMUM_LIQUIDITY` lock); later providers deposit at the pool ratio —
    /// the optimal counter-amount is computed from `*_desired` and guarded by
    /// `*_min`. Returns the LP shares minted to `from`.
    pub fn add_liquidity(
        env: Env,
        from: Address,
        maturity: u64,
        pt_desired: i128,
        sy_desired: i128,
        pt_min: i128,
        sy_min: i128,
    ) -> Result<i128, AmmError> {
        from.require_auth();
        if pt_desired <= 0 || sy_desired <= 0 || pt_min < 0 || sy_min < 0 {
            return Err(AmmError::InvalidAmount);
        }
        let mut pool = Self::require_pool(&env, maturity)?;
        if env.ledger().timestamp() >= maturity {
            return Err(AmmError::MaturityPassed);
        }

        let (pt_in, sy_in, lp_minted) =
            if pool.lp_total == 0 {
                // First liquidity: taker of both desired amounts, sets the price.
                let shares = isqrt(
                    pt_desired
                        .checked_mul(sy_desired)
                        .ok_or(AmmError::MathOverflow)?,
                );
                let minted = shares - MINIMUM_LIQUIDITY;
                if minted <= 0 {
                    return Err(AmmError::InsufficientLiquidity);
                }
                // lp_total counts the locked MINIMUM_LIQUIDITY, owned by nobody —
                // the pool can never be fully drained nor its shares inflated.
                (pt_desired, sy_desired, minted)
            } else {
                // Deposit at the pool ratio (floor both candidate legs).
                let sy_optimal = mul_div_floor(pt_desired, pool.sy_reserve, pool.pt_reserve)?;
                let (pt_in, sy_in) = if sy_optimal <= sy_desired {
                    if sy_optimal < sy_min {
                        return Err(AmmError::SlippageExceeded);
                    }
                    (pt_desired, sy_optimal)
                } else {
                    let pt_optimal = mul_div_floor(sy_desired, pool.pt_reserve, pool.sy_reserve)?;
                    if pt_optimal < pt_min {
                        return Err(AmmError::SlippageExceeded);
                    }
                    (pt_optimal, sy_desired)
                };
                if pt_in <= 0 || sy_in <= 0 {
                    return Err(AmmError::InvalidAmount);
                }
                let minted = mul_div_floor(pt_in, pool.lp_total, pool.pt_reserve)?
                    .min(mul_div_floor(sy_in, pool.lp_total, pool.sy_reserve)?);
                if minted <= 0 {
                    return Err(AmmError::InsufficientLiquidity);
                }
                (pt_in, sy_in, minted)
            };

        // Pull both legs in (nested auth: one wallet signature).
        let me = env.current_contract_address();
        token::TokenClient::new(&env, &pool.pt_token).transfer(
            &from,
            MuxedAddress::from(&me),
            &pt_in,
        );
        token::TokenClient::new(&env, &Self::sy_token(&env)?).transfer(
            &from,
            MuxedAddress::from(&me),
            &sy_in,
        );

        pool.pt_reserve = pool
            .pt_reserve
            .checked_add(pt_in)
            .ok_or(AmmError::MathOverflow)?;
        pool.sy_reserve = pool
            .sy_reserve
            .checked_add(sy_in)
            .ok_or(AmmError::MathOverflow)?;
        pool.lp_total = pool
            .lp_total
            .checked_add(if pool.lp_total == 0 {
                lp_minted + MINIMUM_LIQUIDITY
            } else {
                lp_minted
            })
            .ok_or(AmmError::MathOverflow)?;
        Self::save_pool(&env, maturity, &pool);
        Self::credit_lp(&env, &from, maturity, lp_minted)?;

        LiquidityAdded {
            from,
            maturity,
            pt_in,
            sy_in,
            lp_minted,
        }
        .publish(&env);
        Ok(lp_minted)
    }

    /// Burn `lp` shares for the pro-rata reserves (floor). Always allowed —
    /// matured pools can be exited, never entered.
    pub fn remove_liquidity(
        env: Env,
        from: Address,
        maturity: u64,
        lp: i128,
        pt_min: i128,
        sy_min: i128,
    ) -> Result<(i128, i128), AmmError> {
        from.require_auth();
        if lp <= 0 || pt_min < 0 || sy_min < 0 {
            return Err(AmmError::InvalidAmount);
        }
        let mut pool = Self::require_pool(&env, maturity)?;
        let balance = Self::lp_balance(env.clone(), from.clone(), maturity);
        if balance < lp {
            return Err(AmmError::InsufficientLpBalance);
        }

        let pt_out = mul_div_floor(lp, pool.pt_reserve, pool.lp_total)?;
        let sy_out = mul_div_floor(lp, pool.sy_reserve, pool.lp_total)?;
        if pt_out < pt_min || sy_out < sy_min {
            return Err(AmmError::SlippageExceeded);
        }

        Self::debit_lp(&env, &from, maturity, lp)?;
        pool.lp_total -= lp;
        pool.pt_reserve -= pt_out;
        pool.sy_reserve -= sy_out;
        Self::save_pool(&env, maturity, &pool);

        if pt_out > 0 {
            token::TokenClient::new(&env, &pool.pt_token).transfer(
                &env.current_contract_address(),
                MuxedAddress::from(&from),
                &pt_out,
            );
        }
        if sy_out > 0 {
            token::TokenClient::new(&env, &Self::sy_token(&env)?).transfer(
                &env.current_contract_address(),
                MuxedAddress::from(&from),
                &sy_out,
            );
        }
        LiquidityRemoved {
            from,
            maturity,
            lp_burned: lp,
            pt_out,
            sy_out,
        }
        .publish(&env);
        Ok((pt_out, sy_out))
    }

    /// Swap an exact input for at least `min_out` of the other asset
    /// (30 bps fee stays in the pool for LPs). Pre-maturity only.
    pub fn swap_exact_in(
        env: Env,
        from: Address,
        maturity: u64,
        side: SwapSide,
        amount_in: i128,
        min_out: i128,
    ) -> Result<i128, AmmError> {
        from.require_auth();
        if amount_in <= 0 || min_out < 0 {
            return Err(AmmError::InvalidAmount);
        }
        let mut pool = Self::require_pool(&env, maturity)?;
        if env.ledger().timestamp() >= maturity {
            return Err(AmmError::MaturityPassed);
        }
        let amount_out = Self::quote(&pool, side, amount_in)?;
        if amount_out <= 0 {
            return Err(AmmError::InsufficientLiquidity);
        }
        if amount_out < min_out {
            return Err(AmmError::SlippageExceeded);
        }

        let me = env.current_contract_address();
        let sy = Self::sy_token(&env)?;
        let (token_in, token_out) = match side {
            SwapSide::PtToSy => (pool.pt_token.clone(), sy),
            SwapSide::SyToPt => (sy, pool.pt_token.clone()),
        };
        token::TokenClient::new(&env, &token_in).transfer(
            &from,
            MuxedAddress::from(&me),
            &amount_in,
        );
        match side {
            SwapSide::PtToSy => {
                pool.pt_reserve = pool
                    .pt_reserve
                    .checked_add(amount_in)
                    .ok_or(AmmError::MathOverflow)?;
                pool.sy_reserve -= amount_out;
            }
            SwapSide::SyToPt => {
                pool.sy_reserve = pool
                    .sy_reserve
                    .checked_add(amount_in)
                    .ok_or(AmmError::MathOverflow)?;
                pool.pt_reserve -= amount_out;
            }
        }
        Self::save_pool(&env, maturity, &pool);
        token::TokenClient::new(&env, &token_out).transfer(
            &me,
            MuxedAddress::from(&from),
            &amount_out,
        );

        Swap {
            from,
            maturity,
            pt_in: matches!(side, SwapSide::PtToSy),
            amount_in,
            amount_out,
        }
        .publish(&env);
        Ok(amount_out)
    }

    // -- views --

    /// Current pool state (reserves, LP supply, PT token address).
    pub fn get_pool(env: Env, maturity: u64) -> Result<Pool, AmmError> {
        Self::require_pool(&env, maturity)
    }

    /// Output for an exact input at current reserves (identical math to
    /// `swap_exact_in`, so quote == execution in the same ledger state).
    pub fn quote_swap(
        env: Env,
        maturity: u64,
        side: SwapSide,
        amount_in: i128,
    ) -> Result<i128, AmmError> {
        if amount_in <= 0 {
            return Err(AmmError::InvalidAmount);
        }
        let pool = Self::require_pool(&env, maturity)?;
        Self::quote(&pool, side, amount_in)
    }

    pub fn lp_balance(env: Env, addr: Address, maturity: u64) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::LpBalance(addr, maturity))
            .unwrap_or(0)
    }

    // -- internal --

    /// `out = in·997·R_out / (R_in·1000 + in·997)` — Uniswap-V2 with the fee
    /// applied to the input; floor keeps `k` non-decreasing.
    fn quote(pool: &Pool, side: SwapSide, amount_in: i128) -> Result<i128, AmmError> {
        let (r_in, r_out) = match side {
            SwapSide::PtToSy => (pool.pt_reserve, pool.sy_reserve),
            SwapSide::SyToPt => (pool.sy_reserve, pool.pt_reserve),
        };
        if r_in <= 0 || r_out <= 0 {
            return Err(AmmError::InsufficientLiquidity);
        }
        let in_with_fee = amount_in
            .checked_mul(FEE_NUM)
            .ok_or(AmmError::MathOverflow)?;
        let numerator = in_with_fee
            .checked_mul(r_out)
            .ok_or(AmmError::MathOverflow)?;
        let denominator = r_in
            .checked_mul(FEE_DEN)
            .ok_or(AmmError::MathOverflow)?
            .checked_add(in_with_fee)
            .ok_or(AmmError::MathOverflow)?;
        Ok(numerator / denominator)
    }

    fn require_pool(env: &Env, maturity: u64) -> Result<Pool, AmmError> {
        env.storage()
            .instance()
            .get(&DataKey::Pool(maturity))
            .ok_or(AmmError::PoolNotFound)
    }

    fn save_pool(env: &Env, maturity: u64, pool: &Pool) {
        env.storage().instance().set(&DataKey::Pool(maturity), pool);
        extend_instance(env);
    }

    fn sy_token(env: &Env) -> Result<Address, AmmError> {
        env.storage()
            .instance()
            .get(&DataKey::SyToken)
            .ok_or(AmmError::NotInitialized)
    }

    /// LP shares are topped up to the network maximum, not to the 30-day window
    /// used for config: an LP who seeds a pool and walks away is refreshed by
    /// nothing else — other traders' swaps extend the pool, never the ledger of
    /// who owns it. The 14-day threshold keeps the top-up rare.
    fn extend_position(env: &Env, key: &DataKey) {
        let max = env.storage().max_ttl();
        env.storage()
            .persistent()
            .extend_ttl(key, TTL_THRESHOLD, max);
    }

    fn credit_lp(env: &Env, addr: &Address, maturity: u64, amount: i128) -> Result<(), AmmError> {
        let key = DataKey::LpBalance(addr.clone(), maturity);
        let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        let new_balance = balance.checked_add(amount).ok_or(AmmError::MathOverflow)?;
        env.storage().persistent().set(&key, &new_balance);
        Self::extend_position(env, &key);
        Ok(())
    }

    fn debit_lp(env: &Env, addr: &Address, maturity: u64, amount: i128) -> Result<(), AmmError> {
        let key = DataKey::LpBalance(addr.clone(), maturity);
        let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if balance < amount {
            return Err(AmmError::InsufficientLpBalance);
        }
        env.storage().persistent().set(&key, &(balance - amount));
        Self::extend_position(env, &key);
        Ok(())
    }
}

/// Integer square root (babylonian), exact floor for non-negative inputs.
fn isqrt(v: i128) -> i128 {
    if v < 2 {
        return v.max(0);
    }
    let mut x = v;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + v / x) / 2;
    }
    x
}

/// `floor(a * b / c)` with overflow checks. Inputs are non-negative, `c > 0`.
fn mul_div_floor(a: i128, b: i128, c: i128) -> Result<i128, AmmError> {
    if c <= 0 {
        return Err(AmmError::MathOverflow);
    }
    let prod = a.checked_mul(b).ok_or(AmmError::MathOverflow)?;
    Ok(prod / c)
}

fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;
