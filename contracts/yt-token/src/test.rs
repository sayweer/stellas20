// Amounts use the `<whole>_<7-decimal stroops>` grouping convention.
#![allow(clippy::inconsistent_digit_grouping)]

use crate::{YtError, YtToken, YtTokenClient};
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, testutils::Address as _, token, Address,
    Env, MuxedAddress, String, Vec,
};

/// One recorded settlement-hook invocation, exactly as received.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HookCall {
    pub yt_token: Address,
    pub from: Address,
    pub to: Option<Address>,
    pub from_bal: i128,
    pub to_bal: i128,
}

/// A mock Market that records every `on_yt_transfer` it receives, letting the
/// tests assert hook ordering (pre-change balances) and hook-free paths.
#[contract]
pub struct MockMarket;

#[contractimpl]
impl MockMarket {
    pub fn on_yt_transfer(
        env: Env,
        yt_token: Address,
        from: Address,
        to: Option<Address>,
        from_bal: i128,
        to_bal: i128,
    ) {
        let mut calls: Vec<HookCall> = env
            .storage()
            .instance()
            .get(&symbol_short!("calls"))
            .unwrap_or_else(|| Vec::new(&env));
        calls.push_back(HookCall {
            yt_token,
            from,
            to,
            from_bal,
            to_bal,
        });
        env.storage()
            .instance()
            .set(&symbol_short!("calls"), &calls);
    }

    pub fn get_calls(env: Env) -> Vec<HookCall> {
        env.storage()
            .instance()
            .get(&symbol_short!("calls"))
            .unwrap_or_else(|| Vec::new(&env))
    }
}

struct TestCtx {
    env: Env,
    client: YtTokenClient<'static>,
    token: token::TokenClient<'static>,
    yt_id: Address,
    market: MockMarketClient<'static>,
    market_id: Address,
}

fn setup() -> TestCtx {
    let env = Env::default();
    env.mock_all_auths();
    let market_id = env.register(MockMarket, ());
    let market = MockMarketClient::new(&env, &market_id);
    let name = String::from_str(&env, "YT-mUSDY-1785452025");
    let symbol = String::from_str(&env, "YT-mUSDY-1785452025");
    let yt_id = env.register(YtToken, (market_id.clone(), name, symbol));
    let client = YtTokenClient::new(&env, &yt_id);
    let token = token::TokenClient::new(&env, &yt_id);
    TestCtx {
        env,
        client,
        token,
        yt_id,
        market,
        market_id,
    }
}

#[test]
fn test_metadata_and_market() {
    let ctx = setup();
    assert_eq!(ctx.token.decimals(), 7);
    assert_eq!(
        ctx.token.symbol(),
        String::from_str(&ctx.env, "YT-mUSDY-1785452025")
    );
    assert_eq!(ctx.client.market(), ctx.market_id);
}

#[test]
fn test_mint_is_hook_free() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    ctx.client.mint(&user, &100_0000000);
    assert_eq!(ctx.token.balance(&user), 100_0000000);
    assert_eq!(ctx.client.total_supply(), 100_0000000);
    // The Market settles internally before minting — no hook may fire here.
    assert_eq!(ctx.market.get_calls().len(), 0);
}

#[test]
fn test_transfer_hooks_with_pre_change_balances() {
    let ctx = setup();
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    ctx.client.mint(&a, &100_0000000);
    ctx.client.mint(&b, &7_0000000);

    ctx.token.transfer(&a, MuxedAddress::from(&b), &40_0000000);

    // Exactly one hook call, carrying the balances BEFORE the move.
    let calls = ctx.market.get_calls();
    assert_eq!(calls.len(), 1);
    let call = calls.get(0).unwrap();
    assert_eq!(call.yt_token, ctx.yt_id);
    assert_eq!(call.from, a);
    assert_eq!(call.to, Some(b.clone()));
    assert_eq!(call.from_bal, 100_0000000);
    assert_eq!(call.to_bal, 7_0000000);
    // And the balances moved after the hook.
    assert_eq!(ctx.token.balance(&a), 60_0000000);
    assert_eq!(ctx.token.balance(&b), 47_0000000);
}

#[test]
fn test_transfer_from_hooks_and_spends_allowance() {
    let ctx = setup();
    let owner = Address::generate(&ctx.env);
    let spender = Address::generate(&ctx.env);
    let recipient = Address::generate(&ctx.env);
    ctx.client.mint(&owner, &100_0000000);

    let expiry = ctx.env.ledger().sequence() + 1000;
    ctx.token.approve(&owner, &spender, &30_0000000, &expiry);
    ctx.token
        .transfer_from(&spender, &owner, &recipient, &20_0000000);

    let calls = ctx.market.get_calls();
    assert_eq!(calls.len(), 1);
    let call = calls.get(0).unwrap();
    assert_eq!(call.from, owner);
    assert_eq!(call.to, Some(recipient.clone()));
    assert_eq!(call.from_bal, 100_0000000);
    assert_eq!(call.to_bal, 0);
    assert_eq!(ctx.token.allowance(&owner, &spender), 10_0000000);
    assert_eq!(ctx.token.balance(&recipient), 20_0000000);
}

#[test]
fn test_burn_hooks_with_none_recipient() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    ctx.client.mint(&user, &50_0000000);

    ctx.token.burn(&user, &20_0000000);

    let calls = ctx.market.get_calls();
    assert_eq!(calls.len(), 1);
    let call = calls.get(0).unwrap();
    assert_eq!(call.from, user);
    assert_eq!(call.to, None);
    assert_eq!(call.from_bal, 50_0000000);
    assert_eq!(call.to_bal, 0);
    assert_eq!(ctx.token.balance(&user), 30_0000000);
    assert_eq!(ctx.client.total_supply(), 30_0000000);
}

#[test]
fn test_market_burn_is_hook_free() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    ctx.client.mint(&user, &50_0000000);

    ctx.client.market_burn(&user, &20_0000000);

    // No hook: the Market settles before calling market_burn.
    assert_eq!(ctx.market.get_calls().len(), 0);
    assert_eq!(ctx.token.balance(&user), 30_0000000);
    assert_eq!(ctx.client.total_supply(), 30_0000000);
}

#[test]
fn test_market_burn_without_auth_rejected() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    ctx.client.mint(&user, &50_0000000);
    // No auths mocked: market.require_auth() must trap — outsiders cannot use
    // the hook-free burn to skip settlement.
    ctx.env.mock_auths(&[]);
    assert!(ctx.client.try_market_burn(&user, &1_0000000).is_err());
}

#[test]
fn test_self_transfer_is_noop_without_hook() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    ctx.client.mint(&user, &50_0000000);

    ctx.token
        .transfer(&user, MuxedAddress::from(&user), &10_0000000);

    // Balance-checked, but no hook and no movement.
    assert_eq!(ctx.market.get_calls().len(), 0);
    assert_eq!(ctx.token.balance(&user), 50_0000000);
}

#[test]
fn test_transfer_insufficient_rejected_before_hook() {
    let ctx = setup();
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    ctx.client.mint(&a, &10_0000000);

    let result = ctx
        .token
        .try_transfer(&a, MuxedAddress::from(&b), &10_0000001);
    assert_eq!(result, Err(Ok(YtError::InsufficientBalance.into())));
    // The failed transfer never reached the Market.
    assert_eq!(ctx.market.get_calls().len(), 0);
}

#[test]
fn test_mint_without_market_auth_rejected() {
    let ctx = setup();
    let user = Address::generate(&ctx.env);
    ctx.env.mock_auths(&[]);
    assert!(ctx.client.try_mint(&user, &1_0000000).is_err());
}
