#![no_std]

//! Splitter — "the Market": splits Standardized-Yield (SY) into a transferable
//! Principal Token (PT) and Yield Token (YT) for a chosen maturity — the core
//! of a Pendle-style fixed-income primitive.
//!
//! ## v1: tokenized PT/YT + global user-index accounting
//!
//! PT and YT are real SEP-41 tokens, one pair per maturity, factory-deployed
//! by this contract (`create_maturity`). Because YT is transferable, the v0
//! per-position reserve cannot work (a transfer would not carry the reserve);
//! yield is instead settled per user against a **rate index**:
//!
//! - `index(user)` — the exchange rate at the user's last settlement.
//! - On settle at effective rate `R` (capped at the maturity rate `R_T`):
//!   `released = floor(yt·S/index) − ceil(yt·S/R)`, clamped ≥ 0, credited to
//!   `accrued_sy`; then `index := R`.
//!
//! The floor/ceil pair is the rounding law in action — the user's entitlement
//! rounds down, the retained backing rounds up, so every settlement pays out
//! at most the real-number yield and the dust stays with the protocol.
//!
//! ## Solvency (invariant I1)
//!
//! In real numbers the liability is `Σ accrued + Σ yt_u·S/index_u` (the
//! second term both backs principal — `P == Y·S`-wise — and carries unrealized
//! yield). Every operation changes the market's SY balance by at least the
//! real-number liability change: split pulls `sy ≥ pt_out·S/R`; settles pay
//! `≤` real released; merges/redeems pay floored amounts against exactly
//! settled state; YT transfers first settle both parties to a common index,
//! after which the liability is linear in `yt` and moves are exact. Hence
//! `SY held ≥ extractable claims + floor(P·S/R_eff)` at all times — asserted
//! op-by-op in the test harness.
//!
//! ## The YT settlement hook
//!
//! User-initiated YT balance changes call back into `on_yt_transfer` with the
//! **pre-change balances as arguments** (Soroban forbids this contract reading
//! `YT.balance()` while YT is on the call stack — no reentrancy, not even
//! views). Authenticity: the YT address is looked up in the registry written
//! at factory-deploy time, then `require_auth()` — which only the genuine YT
//! contract passes, as the direct cross-contract invoker.

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, Address, Bytes, BytesN, Env, String, Vec,
};

/// Exchange-rate fixed-point scale (must match the yield token's `RATE_SCALE`).
pub const RATE_SCALE: i128 = 1_000_000_000_000;

/// TTL management (~5s per ledger on testnet): extend below ~14 days, up to ~30 days.
const TTL_THRESHOLD: u32 = 14 * 24 * 60 * 12;
const TTL_EXTEND_TO: u32 = 30 * 24 * 60 * 12;

/// Cap on registered maturities to keep the instance entries bounded.
const MAX_MATURITIES: u32 = 32;

/// Longest underlying symbol the PT/YT metadata buffer can hold — the same
/// 12-character ceiling Stellar puts on asset codes.
const MAX_SYMBOL_LEN: usize = 12;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    SyVault,
    /// Ticker of the underlying behind this Market's vault, e.g. "mUSDY".
    UnderlyingSymbol,
    Maturities,
    PtWasmHash,
    YtWasmHash,
    /// Per-maturity PT/YT token addresses (instance: bounded by MAX_MATURITIES).
    Tokens(u64),
    /// Reverse registry for hook auth: YT token address → its maturity.
    YtToMaturity(Address),
    /// Per-(user, maturity) yield accounting (persistent: unbounded).
    UserYield(Address, u64),
}

/// The factory-deployed token pair for one maturity.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MaturityTokens {
    pub pt: Address,
    pub yt: Address,
}

/// Per-user, per-maturity yield state.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserYield {
    /// Exchange rate at the last settlement (0 = never touched).
    pub index: i128,
    /// SY yield accrued and claimable.
    pub accrued_sy: i128,
}

/// Aggregate PT/YT supplies for a maturity (read from the token contracts).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MaturityTotals {
    pub pt_supply: i128,
    pub yt_supply: i128,
}

/// One account's full view for a maturity, composed server-side so the
/// frontend needs a single simulate call per maturity.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccountView {
    pub pt: i128,
    pub yt: i128,
    /// Rate index at last settlement (0 = never touched) — lets the client
    /// project claimable live between polls.
    pub index: i128,
    pub accrued_sy: i128,
    /// Claimable right now (accrued + pending release at the effective rate).
    pub claimable: i128,
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
    InvalidSymbol = 14,
}

/// Cross-contract view of the SY vault the Market operates on.
///
/// `transfer` matches the vault's SEP-41 entry point: declaring `to` as a
/// plain `Address` here is wire-compatible with the vault's `MuxedAddress`
/// parameter (an Address ScVal is a valid MuxedAddress — the same guarantee
/// the vault itself relies on when calling the underlying token).
#[contractclient(name = "SyVaultClient")]
pub trait SyVaultInterface {
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
    fn balance(env: Env, id: Address) -> i128;
    fn exchange_rate(env: Env) -> i128;
    fn exchange_rate_at(env: Env, ts: u64) -> i128;
}

/// Cross-contract view of a PT token instance.
#[contractclient(name = "PtTokenClient")]
pub trait PtTokenInterface {
    fn mint(env: Env, to: Address, amount: i128);
    fn burn(env: Env, from: Address, amount: i128);
    fn balance(env: Env, id: Address) -> i128;
    fn total_supply(env: Env) -> i128;
}

/// Cross-contract view of a YT token instance.
#[contractclient(name = "YtTokenClient")]
pub trait YtTokenInterface {
    fn mint(env: Env, to: Address, amount: i128);
    fn market_burn(env: Env, from: Address, amount: i128);
    fn balance(env: Env, id: Address) -> i128;
    fn total_supply(env: Env) -> i128;
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MaturityCreated {
    pub maturity: u64,
    pub pt_token: Address,
    pub yt_token: Address,
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
    /// Constructor: runs once at deploy (no front-run). Records the admin,
    /// the SY vault, and the uploaded PT/YT token wasm hashes the factory
    /// instantiates per maturity.
    /// `underlying_symbol` names the yield source in the PT/YT tickers
    /// (`PT-<symbol>-<maturity>`), so a second Market over a different vault —
    /// say a Blend-backed one — mints tokens that say what they are backed by.
    /// Bounded to `MAX_SYMBOL_LEN` because the metadata is built in a fixed
    /// no_std buffer.
    pub fn __constructor(
        env: Env,
        admin: Address,
        sy_vault: Address,
        pt_wasm_hash: BytesN<32>,
        yt_wasm_hash: BytesN<32>,
        underlying_symbol: String,
    ) {
        if underlying_symbol.is_empty() || underlying_symbol.len() as usize > MAX_SYMBOL_LEN {
            panic_with_error!(&env, SplitterError::InvalidSymbol);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::SyVault, &sy_vault);
        env.storage()
            .instance()
            .set(&DataKey::UnderlyingSymbol, &underlying_symbol);
        env.storage()
            .instance()
            .set(&DataKey::PtWasmHash, &pt_wasm_hash);
        env.storage()
            .instance()
            .set(&DataKey::YtWasmHash, &yt_wasm_hash);
        env.storage()
            .instance()
            .set(&DataKey::Maturities, &Vec::<u64>::new(&env));
        extend_instance(&env);
    }

    /// Admin-only: register a future maturity and factory-deploy its PT/YT
    /// token pair, wired to this Market atomically via their constructors.
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
        // Bound the instance-stored list (admin-only, but keep entries small).
        if maturities.len() >= MAX_MATURITIES {
            return Err(SplitterError::MathOverflow);
        }

        let pt_hash: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::PtWasmHash)
            .ok_or(SplitterError::NotInitialized)?;
        let yt_hash: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::YtWasmHash)
            .ok_or(SplitterError::NotInitialized)?;

        let me = env.current_contract_address();
        let underlying = Self::underlying_symbol(&env)?;
        let pt_meta = token_meta(&env, b"PT-", &underlying, maturity);
        let pt_token = env
            .deployer()
            .with_current_contract(token_salt(&env, maturity, b"pt"))
            .deploy_v2(pt_hash, (me.clone(), pt_meta.clone(), pt_meta));
        let yt_meta = token_meta(&env, b"YT-", &underlying, maturity);
        let yt_token = env
            .deployer()
            .with_current_contract(token_salt(&env, maturity, b"yt"))
            .deploy_v2(yt_hash, (me, yt_meta.clone(), yt_meta));

        env.storage().instance().set(
            &DataKey::Tokens(maturity),
            &MaturityTokens {
                pt: pt_token.clone(),
                yt: yt_token.clone(),
            },
        );
        env.storage()
            .instance()
            .set(&DataKey::YtToMaturity(yt_token.clone()), &maturity);
        maturities.push_back(maturity);
        env.storage()
            .instance()
            .set(&DataKey::Maturities, &maturities);
        extend_instance(&env);
        MaturityCreated {
            maturity,
            pt_token,
            yt_token,
        }
        .publish(&env);
        Ok(())
    }

    /// Split `sy_amount` SY into equal PT and YT for `maturity` (pre-maturity).
    /// Pulls the SY in (cross-contract) and mints both tokens to `from`.
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
        let tokens = Self::require_tokens(&env, maturity)?;
        if env.ledger().timestamp() >= maturity {
            return Err(SplitterError::MaturityPassed);
        }
        let sy = Self::sy_client(&env)?;
        // Pre-maturity, the live rate IS the effective settle rate.
        let r = sy.exchange_rate();

        // Settle the minter's existing YT before their balance grows.
        let yt = YtTokenClient::new(&env, &tokens.yt);
        Self::settle_balance(&env, &from, maturity, yt.balance(&from), r)?;

        // PT/YT minted = principal value of the deposited SY at rate r (floor).
        let pt_out = mul_div_floor(sy_amount, r, RATE_SCALE)?;
        if pt_out <= 0 {
            return Err(SplitterError::InvalidAmount);
        }

        // Pull the full SY in; anything above the exact backing is surplus.
        sy.transfer(&from, &env.current_contract_address(), &sy_amount);
        PtTokenClient::new(&env, &tokens.pt).mint(&from, &pt_out);
        yt.mint(&from, &pt_out);

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
    /// Burns both tokens and pays out floor(amount·S/R). Returns the SY paid.
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
        let tokens = Self::require_tokens(&env, maturity)?;
        if env.ledger().timestamp() >= maturity {
            return Err(SplitterError::MaturityPassed);
        }
        let sy = Self::sy_client(&env)?;
        let r = sy.exchange_rate();

        let pt = PtTokenClient::new(&env, &tokens.pt);
        let yt = YtTokenClient::new(&env, &tokens.yt);
        if pt.balance(&from) < pt_amount {
            return Err(SplitterError::InsufficientPt);
        }
        let yt_bal = yt.balance(&from);
        if yt_bal < pt_amount {
            return Err(SplitterError::InsufficientYt);
        }
        Self::settle_balance(&env, &from, maturity, yt_bal, r)?;

        // Burn PT under the user's nested auth; burn YT via the hook-free
        // market_burn (this call already settled the holder above).
        pt.burn(&from, &pt_amount);
        yt.market_burn(&from, &pt_amount);

        let sy_out = mul_div_floor(pt_amount, RATE_SCALE, r)?;
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
    /// accrual is frozen at the maturity rate). Returns the SY paid out.
    pub fn claim_yield(env: Env, from: Address, maturity: u64) -> Result<i128, SplitterError> {
        from.require_auth();
        let tokens = Self::require_tokens(&env, maturity)?;
        let sy = Self::sy_client(&env)?;
        let r_eff = Self::effective_rate(&env, &sy, maturity);

        let yt = YtTokenClient::new(&env, &tokens.yt);
        let mut uy = Self::settle_balance(&env, &from, maturity, yt.balance(&from), r_eff)?;

        let amount = uy.accrued_sy;
        if amount <= 0 {
            return Err(SplitterError::NothingToClaim);
        }
        uy.accrued_sy = 0;
        Self::save_user_yield(&env, &from, maturity, &uy);

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
    /// maturity (settled at the frozen maturity rate). Returns the SY paid.
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
        let tokens = Self::require_tokens(&env, maturity)?;
        if env.ledger().timestamp() < maturity {
            return Err(SplitterError::MaturityNotReached);
        }
        let sy = Self::sy_client(&env)?;
        let r_t = sy.exchange_rate_at(&maturity);

        let pt = PtTokenClient::new(&env, &tokens.pt);
        if pt.balance(&from) < pt_amount {
            return Err(SplitterError::InsufficientPt);
        }
        // Freeze the redeemer's YT accounting at R_T so claim order can't matter.
        let yt = YtTokenClient::new(&env, &tokens.yt);
        Self::settle_balance(&env, &from, maturity, yt.balance(&from), r_t)?;

        pt.burn(&from, &pt_amount);

        // Principal is valued at the frozen maturity rate; the defensive clamp
        // to the market's holdings can only bite if solvency were ever broken.
        let raw = mul_div_floor(pt_amount, RATE_SCALE, r_t)?;
        let sy_out = raw.min(sy.balance(&env.current_contract_address()));

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

    /// Settlement hook, called by a registered YT token before any
    /// user-initiated balance change, with the **pre-change** balances (see
    /// the module docs for why balances travel as arguments). Settles both
    /// parties at the effective rate so the yield stream transfers cleanly.
    pub fn on_yt_transfer(
        env: Env,
        yt_token: Address,
        from: Address,
        to: Option<Address>,
        from_bal: i128,
        to_bal: i128,
    ) -> Result<(), SplitterError> {
        let maturity: u64 = env
            .storage()
            .instance()
            .get(&DataKey::YtToMaturity(yt_token.clone()))
            .ok_or(SplitterError::Unauthorized)?;
        // Only the genuine YT contract passes: it authenticates as the direct
        // cross-contract invoker.
        yt_token.require_auth();

        let sy = Self::sy_client(&env)?;
        let r_eff = Self::effective_rate(&env, &sy, maturity);
        Self::settle_balance(&env, &from, maturity, from_bal, r_eff)?;
        if let Some(to) = to {
            if to != from {
                Self::settle_balance(&env, &to, maturity, to_bal, r_eff)?;
            }
        }
        Ok(())
    }

    // -- views --

    pub fn get_maturities(env: Env) -> Vec<u64> {
        Self::load_maturities(&env)
    }

    /// The SY vault this Market settles against. Exposed so peripheral
    /// contracts can verify at deploy time that they are trading the same SY
    /// the Market values positions in (see `pt-amm`'s constructor).
    pub fn sy_vault(env: Env) -> Result<Address, SplitterError> {
        env.storage()
            .instance()
            .get(&DataKey::SyVault)
            .ok_or(SplitterError::NotInitialized)
    }

    /// The factory-deployed PT/YT token addresses for `maturity`.
    pub fn get_market(env: Env, maturity: u64) -> Result<MaturityTokens, SplitterError> {
        Self::require_tokens(&env, maturity)
    }

    /// Aggregate PT/YT supplies, read from the token contracts.
    pub fn get_totals(env: Env, maturity: u64) -> Result<MaturityTotals, SplitterError> {
        let tokens = Self::require_tokens(&env, maturity)?;
        Ok(MaturityTotals {
            pt_supply: PtTokenClient::new(&env, &tokens.pt).total_supply(),
            yt_supply: YtTokenClient::new(&env, &tokens.yt).total_supply(),
        })
    }

    /// Raw per-user yield state (index + accrued).
    pub fn get_user_yield(env: Env, addr: Address, maturity: u64) -> UserYield {
        Self::load_user_yield(&env, &addr, maturity)
    }

    /// One account's full position for `maturity` in a single read.
    pub fn get_account(
        env: Env,
        addr: Address,
        maturity: u64,
    ) -> Result<AccountView, SplitterError> {
        let tokens = Self::require_tokens(&env, maturity)?;
        let sy = Self::sy_client(&env)?;
        let r_eff = Self::effective_rate(&env, &sy, maturity);
        let yt_bal = YtTokenClient::new(&env, &tokens.yt).balance(&addr);
        let uy = Self::load_user_yield(&env, &addr, maturity);
        let claimable = uy.accrued_sy + Self::pending_release(&uy, yt_bal, r_eff)?;
        Ok(AccountView {
            pt: PtTokenClient::new(&env, &tokens.pt).balance(&addr),
            yt: yt_bal,
            index: uy.index,
            accrued_sy: uy.accrued_sy,
            claimable,
        })
    }

    /// SY the caller could claim right now (read-only settle preview).
    pub fn preview_claimable(
        env: Env,
        addr: Address,
        maturity: u64,
    ) -> Result<i128, SplitterError> {
        let tokens = Self::require_tokens(&env, maturity)?;
        let sy = Self::sy_client(&env)?;
        let r_eff = Self::effective_rate(&env, &sy, maturity);
        let yt_bal = YtTokenClient::new(&env, &tokens.yt).balance(&addr);
        let uy = Self::load_user_yield(&env, &addr, maturity);
        Ok(uy.accrued_sy + Self::pending_release(&uy, yt_bal, r_eff)?)
    }

    // -- internal --

    /// Rate the yield stream settles at: live pre-maturity, frozen at `R_T`
    /// from maturity on (two-hop: this → SYVault → yield token).
    fn effective_rate(env: &Env, sy: &SyVaultClient, maturity: u64) -> i128 {
        let t_eff = env.ledger().timestamp().min(maturity);
        sy.exchange_rate_at(&t_eff)
    }

    /// Yield released to a holder of `yt_bal` since their last settlement:
    /// entitlement floors, retained backing ceils (never overpays the real
    /// released amount; dust stays with the protocol).
    fn pending_release(uy: &UserYield, yt_bal: i128, r_eff: i128) -> Result<i128, SplitterError> {
        if uy.index == 0 || uy.index == r_eff || yt_bal <= 0 {
            return Ok(0);
        }
        let entitled = mul_div_floor(yt_bal, RATE_SCALE, uy.index)?;
        let needed = mul_div_ceil(yt_bal, RATE_SCALE, r_eff)?;
        Ok(if entitled > needed {
            entitled - needed
        } else {
            0
        })
    }

    /// Settle one user's yield at `r_eff` given their current (pre-change) YT
    /// balance, persisting the updated state. Returns the settled state.
    fn settle_balance(
        env: &Env,
        addr: &Address,
        maturity: u64,
        yt_bal: i128,
        r_eff: i128,
    ) -> Result<UserYield, SplitterError> {
        let mut uy = Self::load_user_yield(env, addr, maturity);
        let released = Self::pending_release(&uy, yt_bal, r_eff)?;
        if released > 0 {
            uy.accrued_sy = uy
                .accrued_sy
                .checked_add(released)
                .ok_or(SplitterError::MathOverflow)?;
        }
        // The index only ever moves forward (the rate is monotonic and
        // positive, so this also covers the first-touch index == 0 case).
        if r_eff > uy.index {
            uy.index = r_eff;
        }
        Self::save_user_yield(env, addr, maturity, &uy);
        Ok(uy)
    }

    fn load_user_yield(env: &Env, addr: &Address, maturity: u64) -> UserYield {
        env.storage()
            .persistent()
            .get(&DataKey::UserYield(addr.clone(), maturity))
            .unwrap_or(UserYield {
                index: 0,
                accrued_sy: 0,
            })
    }

    fn save_user_yield(env: &Env, addr: &Address, maturity: u64, uy: &UserYield) {
        let key = DataKey::UserYield(addr.clone(), maturity);
        env.storage().persistent().set(&key, uy);
        // Topped up to the network maximum rather than the 30-day config
        // window: a maturity months away outlives that window, and only this
        // user's own activity refreshes their entry.
        let max = env.storage().max_ttl();
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, max);
        // Every mutating op settles someone, so this keeps the instance entry
        // (admin/vault/token registry) alive on all hot paths.
        extend_instance(env);
    }

    fn load_maturities(env: &Env) -> Vec<u64> {
        env.storage()
            .instance()
            .get(&DataKey::Maturities)
            .unwrap_or_else(|| Vec::new(env))
    }

    fn underlying_symbol(env: &Env) -> Result<String, SplitterError> {
        env.storage()
            .instance()
            .get(&DataKey::UnderlyingSymbol)
            .ok_or(SplitterError::NotInitialized)
    }

    fn require_tokens(env: &Env, maturity: u64) -> Result<MaturityTokens, SplitterError> {
        env.storage()
            .instance()
            .get(&DataKey::Tokens(maturity))
            .ok_or(SplitterError::MaturityNotFound)
    }

    fn require_admin(env: &Env) -> Result<Address, SplitterError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(SplitterError::NotInitialized)
    }

    fn sy_client(env: &Env) -> Result<SyVaultClient<'_>, SplitterError> {
        let addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::SyVault)
            .ok_or(SplitterError::NotInitialized)?;
        Ok(SyVaultClient::new(env, &addr))
    }
}

/// Deterministic per-maturity salt for the factory: sha256(maturity ‖ tag).
fn token_salt(env: &Env, maturity: u64, tag: &[u8; 2]) -> BytesN<32> {
    let mut b = Bytes::new(env);
    b.extend_from_array(&maturity.to_be_bytes());
    b.extend_from_array(tag);
    env.crypto().sha256(&b).to_bytes()
}

/// Build "PT-<underlying>-<maturity>" metadata (no_std decimal formatting).
/// `underlying` is length-checked at construction, so the buffer always fits.
fn token_meta(env: &Env, kind: &[u8], underlying: &String, maturity: u64) -> String {
    let mut buf = [0u8; 48];
    let mut len = 0usize;
    for &c in kind {
        buf[len] = c;
        len += 1;
    }
    let sym_len = underlying.len() as usize;
    underlying.copy_into_slice(&mut buf[len..len + sym_len]);
    len += sym_len;
    buf[len] = b'-';
    len += 1;
    let mut digits = [0u8; 20];
    let mut n = 0usize;
    let mut v = maturity;
    if v == 0 {
        digits[0] = b'0';
        n = 1;
    }
    while v > 0 {
        digits[n] = b'0' + (v % 10) as u8;
        v /= 10;
        n += 1;
    }
    let mut i = 0usize;
    while i < n {
        buf[len] = digits[n - 1 - i];
        len += 1;
        i += 1;
    }
    // All bytes are ASCII by construction.
    String::from_str(env, core::str::from_utf8(&buf[..len]).unwrap())
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
