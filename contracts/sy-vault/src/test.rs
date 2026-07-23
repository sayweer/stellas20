// Amounts are written as `<whole>_<7-decimal stroops>` to make the decimal
// boundary legible in a Stellar context; that grouping is intentional.
#![allow(clippy::inconsistent_digit_grouping)]

use crate::{SyError, SyVault, SyVaultClient};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    token, Address, Env, Event, MuxedAddress, String,
};
use stellas_mock_yield_token::{MockYieldToken, MockYieldTokenClient, RATE_SCALE};

const BASE_TS: u64 = 1_700_000_000;
const INITIAL_RATE: i128 = RATE_SCALE;
const SLOPE: i128 = 200_000_000;

struct TestCtx {
    env: Env,
    vault: SyVaultClient<'static>,
    /// SEP-41 view of the vault — proves `token::TokenClient` works against SY.
    sy_token: token::TokenClient<'static>,
    vault_id: Address,
    myt: MockYieldTokenClient<'static>,
    myt_token: token::TokenClient<'static>,
    myt_id: Address,
}

fn setup() -> TestCtx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(BASE_TS);

    let admin = Address::generate(&env);

    let myt_id = env.register(MockYieldToken, (admin.clone(), INITIAL_RATE, SLOPE));
    let myt = MockYieldTokenClient::new(&env, &myt_id);
    let myt_token = token::TokenClient::new(&env, &myt_id);

    let vault_id = env.register(SyVault, (admin.clone(), myt_id.clone()));
    let vault = SyVaultClient::new(&env, &vault_id);
    let sy_token = token::TokenClient::new(&env, &vault_id);

    TestCtx {
        env,
        vault,
        sy_token,
        vault_id,
        myt,
        myt_token,
        myt_id,
    }
}

/// Fund `who` with `amount` of the mock yield token via the faucet.
fn fund(ctx: &TestCtx, who: &Address, amount: i128) {
    ctx.myt.faucet(who, &amount);
}

#[test]
fn test_initialize_stores_config() {
    let ctx = setup();
    assert_eq!(ctx.vault.yield_token(), ctx.myt_id);
    assert_eq!(ctx.vault.total_supply(), 0);
}

#[test]
fn test_wrap_mints_1to1_and_pulls_myt() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    fund(&ctx, &user, 100_0000000);

    let new_balance = ctx.vault.wrap(&user, &40_0000000);

    assert_eq!(new_balance, 40_0000000);
    assert_eq!(ctx.vault.balance(&user), 40_0000000);
    assert_eq!(ctx.vault.total_supply(), 40_0000000);
    // Cross-contract proof: the underlying moved into the vault.
    assert_eq!(ctx.myt_token.balance(&user), 60_0000000);
    assert_eq!(ctx.myt_token.balance(&ctx.vault_id), 40_0000000);
}

#[test]
fn test_unwrap_burns_and_returns_myt() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    fund(&ctx, &user, 100_0000000);
    ctx.vault.wrap(&user, &40_0000000);

    let new_balance = ctx.vault.unwrap(&user, &15_0000000);

    assert_eq!(new_balance, 25_0000000);
    assert_eq!(ctx.vault.total_supply(), 25_0000000);
    assert_eq!(ctx.myt_token.balance(&user), 75_0000000);
    assert_eq!(ctx.myt_token.balance(&ctx.vault_id), 25_0000000);
}

#[test]
fn test_unwrap_exceeds_balance_rejected() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    fund(&ctx, &user, 100_0000000);
    ctx.vault.wrap(&user, &10_0000000);

    let result = ctx.vault.try_unwrap(&user, &10_0000001);
    assert_eq!(result, Err(Ok(SyError::InsufficientBalance)));
    assert_eq!(ctx.vault.total_supply(), 10_0000000);
}

#[test]
fn test_wrap_zero_or_negative_rejected() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    fund(&ctx, &user, 100_0000000);

    assert_eq!(
        ctx.vault.try_wrap(&user, &0),
        Err(Ok(SyError::InvalidAmount))
    );
    assert_eq!(
        ctx.vault.try_wrap(&user, &-1),
        Err(Ok(SyError::InvalidAmount))
    );
}

#[test]
fn test_transfer_moves_sy() {
    let ctx = setup();
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    fund(&ctx, &a, 100_0000000);
    ctx.vault.wrap(&a, &50_0000000);

    ctx.sy_token.transfer(&a, MuxedAddress::from(&b), &20_0000000);

    assert_eq!(ctx.sy_token.balance(&a), 30_0000000);
    assert_eq!(ctx.sy_token.balance(&b), 20_0000000);
    // Total supply unchanged by a transfer.
    assert_eq!(ctx.vault.total_supply(), 50_0000000);
}

#[test]
fn test_exchange_rate_delegates_and_grows() {
    let ctx = setup();
    assert_eq!(ctx.vault.exchange_rate(), INITIAL_RATE);
    ctx.env.ledger().set_timestamp(BASE_TS + 120);
    // The vault's view matches the underlying token's view.
    assert_eq!(ctx.vault.exchange_rate(), ctx.myt.exchange_rate());
    assert_eq!(ctx.vault.exchange_rate(), INITIAL_RATE + 120 * SLOPE);
    assert_eq!(
        ctx.vault.exchange_rate_at(&(BASE_TS + 60)),
        INITIAL_RATE + 60 * SLOPE
    );
}

#[test]
fn test_events_published() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    fund(&ctx, &user, 100_0000000);

    ctx.vault.wrap(&user, &40_0000000);
    let wrap_event = crate::Wrap {
        from: user.clone(),
        amount: 40_0000000,
        new_total_supply: 40_0000000,
    };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.vault_id),
        [wrap_event.to_xdr(&ctx.env, &ctx.vault_id)]
    );

    ctx.vault.unwrap(&user, &10_0000000);
    let unwrap_event = crate::Unwrap {
        from: user,
        amount: 10_0000000,
        new_total_supply: 30_0000000,
    };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.vault_id),
        [unwrap_event.to_xdr(&ctx.env, &ctx.vault_id)]
    );
}

#[test]
fn test_transfer_insufficient_rejected() {
    let ctx = setup();
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    fund(&ctx, &a, 100_0000000);
    ctx.vault.wrap(&a, &10_0000000);

    let result = ctx
        .sy_token
        .try_transfer(&a, MuxedAddress::from(&b), &10_0000001);
    assert_eq!(result, Err(Ok(SyError::InsufficientBalance.into())));
}

#[test]
fn test_transfer_event_published() {
    let ctx = setup();
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    fund(&ctx, &a, 100_0000000);
    ctx.vault.wrap(&a, &50_0000000);

    ctx.sy_token.transfer(&a, MuxedAddress::from(&b), &20_0000000);
    let transfer_event = crate::Transfer {
        from: a,
        to: b,
        amount: 20_0000000,
    };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.vault_id),
        [transfer_event.to_xdr(&ctx.env, &ctx.vault_id)]
    );
}

#[test]
fn test_approve_and_transfer_from() {
    let ctx = setup();
    let owner = Address::generate(&ctx.env);
    let spender = Address::generate(&ctx.env);
    let recipient = Address::generate(&ctx.env);
    fund(&ctx, &owner, 100_0000000);
    ctx.vault.wrap(&owner, &50_0000000);

    let expiry = ctx.env.ledger().sequence() + 1000;
    ctx.sy_token.approve(&owner, &spender, &30_0000000, &expiry);
    assert_eq!(ctx.sy_token.allowance(&owner, &spender), 30_0000000);

    ctx.sy_token
        .transfer_from(&spender, &owner, &recipient, &20_0000000);
    assert_eq!(ctx.sy_token.balance(&recipient), 20_0000000);
    assert_eq!(ctx.sy_token.balance(&owner), 30_0000000);
    assert_eq!(ctx.sy_token.allowance(&owner, &spender), 10_0000000);
    // Supply untouched by allowance transfers.
    assert_eq!(ctx.vault.total_supply(), 50_0000000);
}

#[test]
fn test_expired_allowance_rejected() {
    let ctx = setup();
    let owner = Address::generate(&ctx.env);
    let spender = Address::generate(&ctx.env);
    let recipient = Address::generate(&ctx.env);
    fund(&ctx, &owner, 100_0000000);
    ctx.vault.wrap(&owner, &50_0000000);

    let expiry = ctx.env.ledger().sequence() + 10;
    ctx.sy_token.approve(&owner, &spender, &30_0000000, &expiry);

    // Advance past the expiration ledger: the allowance reads as zero and
    // transfer_from is rejected.
    ctx.env.ledger().with_mut(|li| li.sequence_number = expiry + 1);
    assert_eq!(ctx.sy_token.allowance(&owner, &spender), 0);
    let result = ctx
        .sy_token
        .try_transfer_from(&spender, &owner, &recipient, &1_0000000);
    assert_eq!(result, Err(Ok(SyError::InsufficientAllowance.into())));
}

#[test]
fn test_approve_in_past_rejected() {
    let ctx = setup();
    let owner = Address::generate(&ctx.env);
    let spender = Address::generate(&ctx.env);
    ctx.env.ledger().with_mut(|li| li.sequence_number = 100);

    let result = ctx.sy_token.try_approve(&owner, &spender, &1_0000000, &99);
    assert_eq!(result, Err(Ok(SyError::AllowanceExpired.into())));
}

#[test]
fn test_burn_forfeits_underlying_to_vault() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    fund(&ctx, &user, 100_0000000);
    ctx.vault.wrap(&user, &50_0000000);

    ctx.sy_token.burn(&user, &20_0000000);

    // Event check first: `events().all()` only holds the last invocation's
    // events, so any view call in between would clear it.
    let burn_event = crate::Burn {
        from: user.clone(),
        amount: 20_0000000,
    };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.vault_id),
        [burn_event.to_xdr(&ctx.env, &ctx.vault_id)]
    );

    // SY destroyed...
    assert_eq!(ctx.sy_token.balance(&user), 30_0000000);
    assert_eq!(ctx.vault.total_supply(), 30_0000000);
    // ...but the underlying stays in the vault (becomes protocol surplus):
    // burn has no hidden transfer side-effects; unwrap is the exit path.
    assert_eq!(ctx.myt_token.balance(&ctx.vault_id), 50_0000000);
    assert_eq!(ctx.myt_token.balance(&user), 50_0000000);
}

#[test]
fn test_token_metadata() {
    let ctx = setup();
    assert_eq!(ctx.sy_token.decimals(), 7);
    assert_eq!(
        ctx.sy_token.name(),
        String::from_str(&ctx.env, "Standardized Yield mUSDY")
    );
    assert_eq!(
        ctx.sy_token.symbol(),
        String::from_str(&ctx.env, "SY-mUSDY")
    );
}
