use crate::{Deposit, VaultContract, VaultContractClient, VaultError, Withdraw};
use soroban_sdk::{
    testutils::{Address as _, Events},
    token, Address, Env, Event,
};

struct TestCtx {
    env: Env,
    client: VaultContractClient<'static>,
    token: Address,
    admin: Address,
    goal: i128,
}

fn setup(goal: i128) -> TestCtx {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token = sac.address();

    let contract_id = env.register(VaultContract, ());
    let client = VaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &goal, &token);

    TestCtx { env, client, token, admin, goal }
}

fn fund(ctx: &TestCtx, who: &Address, amount: i128) {
    let sac_client = token::StellarAssetClient::new(&ctx.env, &ctx.token);
    sac_client.mint(who, &amount);
}

#[test]
fn test_initialize_stores_config() {
    let ctx = setup(1_000_0000000);
    assert_eq!(ctx.client.get_goal(), 1_000_0000000);
    assert_eq!(ctx.client.get_total(), 0);
    assert_eq!(ctx.client.get_contributors(), 0);
}

#[test]
fn test_double_initialize_rejected() {
    let ctx = setup(1_000_0000000);
    let result = ctx.client.try_initialize(&ctx.admin, &ctx.goal, &ctx.token);
    assert_eq!(result, Err(Ok(VaultError::AlreadyInitialized)));
}

#[test]
fn test_deposit_happy_path() {
    let ctx = setup(1_000_0000000);
    let depositor = Address::generate(&ctx.env);
    fund(&ctx, &depositor, 100_0000000);

    let new_total = ctx.client.deposit(&depositor, &10_0000000);

    assert_eq!(new_total, 10_0000000);
    assert_eq!(ctx.client.get_total(), 10_0000000);
    assert_eq!(ctx.client.get_balance(&depositor), 10_0000000);
    assert_eq!(ctx.client.get_contributors(), 1);

    let token_client = token::TokenClient::new(&ctx.env, &ctx.token);
    assert_eq!(token_client.balance(&depositor), 90_0000000);
    assert_eq!(token_client.balance(&ctx.client.address), 10_0000000);
}

#[test]
fn test_withdraw_happy_path() {
    let ctx = setup(1_000_0000000);
    let depositor = Address::generate(&ctx.env);
    fund(&ctx, &depositor, 100_0000000);
    ctx.client.deposit(&depositor, &10_0000000);

    let new_total = ctx.client.withdraw(&depositor, &4_0000000);

    assert_eq!(new_total, 6_0000000);
    assert_eq!(ctx.client.get_total(), 6_0000000);
    assert_eq!(ctx.client.get_balance(&depositor), 6_0000000);

    let token_client = token::TokenClient::new(&ctx.env, &ctx.token);
    assert_eq!(token_client.balance(&depositor), 94_0000000);
}

#[test]
fn test_withdraw_exceeds_balance_rejected() {
    let ctx = setup(1_000_0000000);
    let depositor = Address::generate(&ctx.env);
    fund(&ctx, &depositor, 100_0000000);
    ctx.client.deposit(&depositor, &10_0000000);

    let result = ctx.client.try_withdraw(&depositor, &10_0000001);
    assert_eq!(result, Err(Ok(VaultError::InsufficientBalance)));
    assert_eq!(ctx.client.get_total(), 10_0000000);
}

#[test]
fn test_deposit_zero_or_negative_rejected() {
    let ctx = setup(1_000_0000000);
    let depositor = Address::generate(&ctx.env);
    fund(&ctx, &depositor, 100_0000000);

    let zero_result = ctx.client.try_deposit(&depositor, &0);
    assert_eq!(zero_result, Err(Ok(VaultError::InvalidAmount)));

    let negative_result = ctx.client.try_deposit(&depositor, &-1);
    assert_eq!(negative_result, Err(Ok(VaultError::InvalidAmount)));
}

#[test]
fn test_events_published() {
    let ctx = setup(1_000_0000000);
    let depositor = Address::generate(&ctx.env);
    fund(&ctx, &depositor, 100_0000000);

    // `events().all()` only reflects the most recent top-level invocation,
    // so each event is asserted right after the call that publishes it.
    ctx.client.deposit(&depositor, &10_0000000);
    let deposit_event = Deposit { from: depositor.clone(), amount: 10_0000000, new_total: 10_0000000 };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.client.address),
        [deposit_event.to_xdr(&ctx.env, &ctx.client.address)]
    );

    ctx.client.withdraw(&depositor, &4_0000000);
    let withdraw_event = Withdraw { to: depositor, amount: 4_0000000, new_total: 6_0000000 };
    assert_eq!(
        ctx.env.events().all().filter_by_contract(&ctx.client.address),
        [withdraw_event.to_xdr(&ctx.env, &ctx.client.address)]
    );
}

#[test]
fn test_deposit_requires_auth() {
    let ctx = setup(1_000_0000000);
    let depositor = Address::generate(&ctx.env);
    fund(&ctx, &depositor, 100_0000000);

    ctx.client.deposit(&depositor, &10_0000000);

    let auths = ctx.env.auths();
    assert!(auths.iter().any(|(addr, _)| *addr == depositor));
}
