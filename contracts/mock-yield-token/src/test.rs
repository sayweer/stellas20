// Amounts are written as `<whole>_<7-decimal stroops>` to make the decimal
// boundary legible in a Stellar context; that grouping is intentional.
#![allow(clippy::inconsistent_digit_grouping)]

use crate::{MockYieldToken, MockYieldTokenClient, RateCheckpoint, TokenError, RATE_SCALE};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    token, Address, Env, Event, MuxedAddress,
};

const BASE_TS: u64 = 1_700_000_000;
const INITIAL_RATE: i128 = RATE_SCALE; // 1.0
const SLOPE: i128 = 200_000_000; // +0.0002/s == +1.2%/min

struct TestCtx {
    env: Env,
    client: MockYieldTokenClient<'static>,
    token: token::TokenClient<'static>,
    contract_id: Address,
    admin: Address,
}

fn setup() -> TestCtx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(BASE_TS);

    let admin = Address::generate(&env);
    let contract_id = env.register(MockYieldToken, (admin.clone(), INITIAL_RATE, SLOPE));
    let client = MockYieldTokenClient::new(&env, &contract_id);

    let token = token::TokenClient::new(&env, &contract_id);
    TestCtx {
        env,
        client,
        token,
        contract_id,
        admin,
    }
}

#[test]
fn test_initialize_and_metadata() {
    let ctx = setup();
    assert_eq!(ctx.token.decimals(), 7);
    assert_eq!(
        ctx.token.name(),
        soroban_sdk::String::from_str(&ctx.env, "Mock USDY")
    );
    assert_eq!(
        ctx.token.symbol(),
        soroban_sdk::String::from_str(&ctx.env, "mUSDY")
    );
    assert_eq!(ctx.client.total_supply(), 0);
    assert_eq!(ctx.client.exchange_rate(), INITIAL_RATE);
}

#[test]
fn test_faucet_mints_within_cap() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    ctx.client.faucet(&user, &1_000_0000000);
    assert_eq!(ctx.token.balance(&user), 1_000_0000000);
    assert_eq!(ctx.client.total_supply(), 1_000_0000000);
}

#[test]
fn test_faucet_over_cap_rejected() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    // FAUCET_MAX is 10,000 tokens; 10,001 must be rejected.
    let result = ctx.client.try_faucet(&user, &10_001_0000000);
    assert_eq!(result, Err(Ok(TokenError::FaucetLimitExceeded)));
    assert_eq!(ctx.token.balance(&user), 0);
}

#[test]
fn test_mint_requires_admin() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    ctx.client.mint(&user, &500_0000000);
    // Check auths immediately: env.auths() reflects only the most recent
    // invocation, so any intervening contract call would reset it.
    let auths = ctx.env.auths();
    assert!(auths.iter().any(|(addr, _)| *addr == ctx.admin));
    assert_eq!(ctx.token.balance(&user), 500_0000000);
}

#[test]
fn test_transfer_moves_balance() {
    let ctx = setup();
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    ctx.client.faucet(&a, &100_0000000);
    ctx.token.transfer(&a, MuxedAddress::from(&b), &40_0000000);
    assert_eq!(ctx.token.balance(&a), 60_0000000);
    assert_eq!(ctx.token.balance(&b), 40_0000000);
}

#[test]
fn test_transfer_insufficient_rejected() {
    let ctx = setup();
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    ctx.client.faucet(&a, &10_0000000);
    let result = ctx
        .token
        .try_transfer(&a, MuxedAddress::from(&b), &10_0000001);
    assert_eq!(result, Err(Ok(TokenError::InsufficientBalance.into())));
}

#[test]
fn test_approve_and_transfer_from() {
    let ctx = setup();
    let owner = Address::generate(&ctx.env);
    let spender = Address::generate(&ctx.env);
    let recipient = Address::generate(&ctx.env);
    ctx.client.faucet(&owner, &100_0000000);

    let expiry = ctx.env.ledger().sequence() + 1000;
    ctx.token.approve(&owner, &spender, &30_0000000, &expiry);
    assert_eq!(ctx.token.allowance(&owner, &spender), 30_0000000);

    ctx.token
        .transfer_from(&spender, &owner, &recipient, &20_0000000);
    assert_eq!(ctx.token.balance(&recipient), 20_0000000);
    assert_eq!(ctx.token.balance(&owner), 80_0000000);
    assert_eq!(ctx.token.allowance(&owner, &spender), 10_0000000);
}

#[test]
fn test_exchange_rate_grows_linearly() {
    let ctx = setup();
    assert_eq!(ctx.client.exchange_rate(), INITIAL_RATE);
    ctx.env.ledger().set_timestamp(BASE_TS + 60);
    assert_eq!(ctx.client.exchange_rate(), INITIAL_RATE + 60 * SLOPE);
    ctx.env.ledger().set_timestamp(BASE_TS + 3600);
    assert_eq!(ctx.client.exchange_rate(), INITIAL_RATE + 3600 * SLOPE);
}

#[test]
fn test_exchange_rate_at_respects_checkpoints() {
    let ctx = setup();
    // Change the slope to 0 at t+100.
    ctx.env.ledger().set_timestamp(BASE_TS + 100);
    ctx.client.set_rate(&0);

    // A timestamp in the first segment still uses the original slope.
    assert_eq!(
        ctx.client.exchange_rate_at(&(BASE_TS + 50)),
        INITIAL_RATE + 50 * SLOPE
    );
    // The rate at the checkpoint boundary.
    let rate_at_100 = INITIAL_RATE + 100 * SLOPE;
    assert_eq!(ctx.client.exchange_rate_at(&(BASE_TS + 100)), rate_at_100);
    // After the checkpoint, slope is 0 — rate is frozen.
    assert_eq!(ctx.client.exchange_rate_at(&(BASE_TS + 500)), rate_at_100);

    let info: RateCheckpoint = ctx.client.get_rate_info();
    assert_eq!(info.slope_per_sec, 0);
    assert_eq!(info.rate, rate_at_100);
}

#[test]
fn test_set_rate_requires_admin() {
    let ctx = setup();
    ctx.client.set_rate(&(SLOPE * 2));
    let auths = ctx.env.auths();
    assert!(auths.iter().any(|(addr, _)| *addr == ctx.admin));
}

#[test]
fn test_events_published() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);

    ctx.client.faucet(&user, &50_0000000);
    let faucet_event = crate::Faucet {
        to: user.clone(),
        amount: 50_0000000,
    };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.contract_id),
        [faucet_event.to_xdr(&ctx.env, &ctx.contract_id)]
    );

    let other = Address::generate(&ctx.env);
    ctx.token
        .transfer(&user, MuxedAddress::from(&other), &10_0000000);
    let transfer_event = crate::Transfer {
        from: user,
        to: other,
        amount: 10_0000000,
    };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.contract_id),
        [transfer_event.to_xdr(&ctx.env, &ctx.contract_id)]
    );
}
