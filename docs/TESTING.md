# Testing

211 tests: 130 Rust contract tests (plus a 3-test slow invariant tier) and 81 Vitest
tests on the frontend. Both suites run in [CI](../.github/workflows/ci.yml) on every push.

```bash
stellar contract build      # required first: the factory tests import the real PT/YT WASM
cargo test --workspace      # 130 Rust tests
npm run test                # 81 Vitest tests
```

## Contracts — 130 Rust tests

`cargo test --workspace` (run `stellar contract build` first — the Market's factory tests
import the real PT/YT WASM).

- `mock-yield-token` (19): SEP-41 behavior, auth-gated admin ops, faucet cap, linear rate growth,
  checkpoint history, burn, allowance expiration, and that a rate read keeps the checkpoint
  history's storage alive.
- `sy-vault` (15): full SEP-41 (transfer/allowance/expiry/burn/metadata) via `token::TokenClient`,
  1:1 wrap/unwrap with cross-contract token moves, rate delegation.
- `pt-token` (10) / `yt-token` (10): the PT/YT SEP-41 tokens; the YT suite asserts the settlement
  hook's ordering and pre-change-balance arguments, hook-free `mint`/`market_burn`, and dual-auth.
  PT additionally pins the position TTL policy — a balance must outlive the config window, or
  holding to maturity would archive the position.
- `sy-vault-blend` (18): wrap/unwrap against a mock Blend pool built from Blend's own rounding
  functions, a scale fixture pinned to real on-chain numbers, the monotonicity ratchet, the
  frozen-rate cache, and the illiquid-pool error mapping (including a check that *other* pool
  failures do not borrow the liquidity wording).
- `splitter` (41): split/merge/claim/redeem against the **factory-deployed real tokens**, with
  hand-computed exact values, event/auth-negative/edge cases, the headline YT-transfer-settles-both
  integration test, and a **randomized op-sequence harness** asserting the solvency and
  `PT_supply == YT_supply` invariants after *every* operation. The scripted solvency script, two
  of the seeds, the adversarial config and a maturity-freeze test **run over the Blend-backed
  vault too** — the invariants are properties of the SY interface, not of the mock behind it.
- `pt-amm` (17): the hand-derived swap fixture (quote == execution to the stroop), pro-rata LP
  math, maturity freeze, exact `isqrt`, the SY/Market pairing check, and a randomized harness
  asserting `k` never decreases and reserves match token balances.

## Slow invariant tier

`cargo test --release -- --ignored` (3 tests, ~7 min). Deliberately outside CI. The same
harnesses at ~30× the depth (4,000–5,000 ops per run, several seeds) with the adversarial
levers turned up: amounts biased towards dust and exact balances, warps that land precisely on
`T-1`/`T`/`T+1`, the yield curve re-based mid-sequence (downwards too, on the Blend source,
which is what fires the vault's monotonicity ratchet), several maturities sharing one SY pot,
PT transfers between holders, and swaps that demand a `min_out` off the live quote.

Failures print the seed and op index so a red run replays directly. Release is deliberate:
`overflow-checks` stays on there, so i128 overflow still panics rather than wrapping.
(`cargo` prints a harmless warning that the workspace's `panic = "abort"` does not apply to test
profiles.)

## Frontend — 81 Vitest tests

`npm run test` — the AMM quote/APY math (the swap fixture matches the Rust one byte-for-byte;
a p=0.988/90d → ~5% APY sanity check), amount parsing/validation in `bigint`, the client-side
yield math mirroring the contract, chain-time anchoring, per-contract error mapping (including
the Blend liquidity error and the market-specific wrap message), event parsing for both vaults'
wrap shapes and both swap directions, and the market switch itself (no contract address may leak
across it).
