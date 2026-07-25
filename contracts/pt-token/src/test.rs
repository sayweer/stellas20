// Amounts use the `<whole>_<7-decimal stroops>` grouping convention.
#![allow(clippy::inconsistent_digit_grouping)]

use crate::{DataKey, PtError, PtToken, PtTokenClient, TTL_EXTEND_TO};
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Events, Ledger},
    token, Address, Env, Event, MuxedAddress, String,
};

struct TestCtx {
    env: Env,
    client: PtTokenClient<'static>,
    token: token::TokenClient<'static>,
    contract_id: Address,
    market: Address,
}

fn setup() -> TestCtx {
    let env = Env::default();
    env.mock_all_auths();
    let market = Address::generate(&env);
    let name = String::from_str(&env, "PT-mUSDY-1785452025");
    let symbol = String::from_str(&env, "PT-mUSDY-1785452025");
    let contract_id = env.register(PtToken, (market.clone(), name, symbol));
    let client = PtTokenClient::new(&env, &contract_id);
    let token = token::TokenClient::new(&env, &contract_id);
    TestCtx {
        env,
        client,
        token,
        contract_id,
        market,
    }
}

#[test]
fn test_metadata_and_market() {
    let ctx = setup();
    assert_eq!(ctx.token.decimals(), 7);
    assert_eq!(
        ctx.token.symbol(),
        String::from_str(&ctx.env, "PT-mUSDY-1785452025")
    );
    assert_eq!(ctx.client.market(), ctx.market);
    assert_eq!(ctx.client.total_supply(), 0);
}

#[test]
fn test_mint_by_market_credits_and_supplies() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    ctx.client.mint(&user, &100_0000000);
    // Auth check first: `env.auths()` only holds the last invocation's auths,
    // so any view call in between would clear it.
    let auths = ctx.env.auths();
    assert!(auths.iter().any(|(addr, _)| *addr == ctx.market));
    assert_eq!(ctx.token.balance(&user), 100_0000000);
    assert_eq!(ctx.client.total_supply(), 100_0000000);
}

#[test]
fn test_mint_without_market_auth_rejected() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    // No auths mocked: market.require_auth() must trap.
    ctx.env.mock_auths(&[]);
    assert!(ctx.client.try_mint(&user, &1_0000000).is_err());
}

#[test]
fn test_mint_invalid_amount_rejected() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    assert_eq!(
        ctx.client.try_mint(&user, &0),
        Err(Ok(PtError::InvalidAmount))
    );
}

#[test]
fn test_transfer_moves_balance_and_events() {
    let ctx = setup();
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    ctx.client.mint(&a, &50_0000000);

    ctx.token.transfer(&a, MuxedAddress::from(&b), &20_0000000);
    let transfer_event = crate::Transfer {
        from: a.clone(),
        to: b.clone(),
        amount: 20_0000000,
    };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.contract_id),
        [transfer_event.to_xdr(&ctx.env, &ctx.contract_id)]
    );
    assert_eq!(ctx.token.balance(&a), 30_0000000);
    assert_eq!(ctx.token.balance(&b), 20_0000000);
    assert_eq!(ctx.client.total_supply(), 50_0000000);
}

#[test]
fn test_transfer_insufficient_rejected() {
    let ctx = setup();
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    ctx.client.mint(&a, &10_0000000);
    let result = ctx
        .token
        .try_transfer(&a, MuxedAddress::from(&b), &10_0000001);
    assert_eq!(result, Err(Ok(PtError::InsufficientBalance.into())));
}

#[test]
fn test_approve_and_transfer_from() {
    let ctx = setup();
    let owner = Address::generate(&ctx.env);
    let spender = Address::generate(&ctx.env);
    let recipient = Address::generate(&ctx.env);
    ctx.client.mint(&owner, &100_0000000);

    let expiry = ctx.env.ledger().sequence() + 1000;
    ctx.token.approve(&owner, &spender, &30_0000000, &expiry);
    assert_eq!(ctx.token.allowance(&owner, &spender), 30_0000000);

    ctx.token
        .transfer_from(&spender, &owner, &recipient, &20_0000000);
    assert_eq!(ctx.token.balance(&recipient), 20_0000000);
    assert_eq!(ctx.token.allowance(&owner, &spender), 10_0000000);
}

#[test]
fn test_expired_allowance_rejected() {
    let ctx = setup();
    let owner = Address::generate(&ctx.env);
    let spender = Address::generate(&ctx.env);
    let recipient = Address::generate(&ctx.env);
    ctx.client.mint(&owner, &100_0000000);

    let expiry = ctx.env.ledger().sequence() + 10;
    ctx.token.approve(&owner, &spender, &30_0000000, &expiry);
    ctx.env
        .ledger()
        .with_mut(|li| li.sequence_number = expiry + 1);
    assert_eq!(ctx.token.allowance(&owner, &spender), 0);
    let result = ctx
        .token
        .try_transfer_from(&spender, &owner, &recipient, &1_0000000);
    assert_eq!(result, Err(Ok(PtError::InsufficientAllowance.into())));
}

#[test]
fn test_burn_reduces_supply() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    ctx.client.mint(&user, &50_0000000);

    ctx.token.burn(&user, &20_0000000);
    let burn_event = crate::Burn {
        from: user.clone(),
        amount: 20_0000000,
    };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.contract_id),
        [burn_event.to_xdr(&ctx.env, &ctx.contract_id)]
    );
    assert_eq!(ctx.token.balance(&user), 30_0000000);
    assert_eq!(ctx.client.total_supply(), 30_0000000);
}

/// Audit round 2, F-1. Holding PT untouched until maturity is the product's
/// headline use case, and only the holder's own transfers refresh their entry.
/// A maturity months out therefore outlives the 30-day window that config
/// entries use, so balances are topped up to the network maximum instead.
#[test]
fn test_balance_ttl_outlives_the_config_window() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    ctx.client.mint(&user, &50_0000000);

    let ttl = ctx.env.as_contract(&ctx.contract_id, || {
        ctx.env
            .storage()
            .persistent()
            .get_ttl(&DataKey::Balance(user.clone()))
    });
    let max = ctx
        .env
        .as_contract(&ctx.contract_id, || ctx.env.storage().max_ttl());

    assert_eq!(
        ttl, max,
        "balance should be extended to the network maximum"
    );
    assert!(
        ttl > TTL_EXTEND_TO,
        "a 30-day balance TTL cannot survive a multi-month maturity"
    );
}
