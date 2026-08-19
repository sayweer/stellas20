# Testing

274 tests: 130 Rust contract tests (plus a 3-test slow invariant tier) and 144 Vitest
tests on the frontend. Both suites run in [CI](../.github/workflows/ci.yml) on every push.

```bash
stellar contract build      # required first: the factory tests import the real PT/YT WASM
cargo test --workspace      # 130 Rust tests
npm run test                # 144 Vitest tests
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

## Frontend — 144 Vitest tests

`npm run test`, 15 files:

- `src/lib/theme.test.ts` (32): figure-tone distinguishability and WCAG contrast ratios for
  every status/text/border color pair, light and dark.
- `src/lib/amm.test.ts` (19): the AMM quote/APY math — the swap fixture matches the Rust one
  byte-for-byte, a p=0.988/90d → ~5% APY sanity check, add/remove-liquidity quoting, price
  impact, slippage clamping.
- `src/lib/contracts/errors.test.ts` (16): per-contract error tables cover every
  `#[contracterror]` variant, plus `classifyContractError` mapping RPC/network failures
  (unfunded account, user-rejected signature, unreachable RPC across browsers) distinctly from
  contract error codes.
- `src/lib/amounts.test.ts` (12): stroop ↔ XLM conversion and `parseTokenAmount`, exact in
  `bigint` past `2^53`, including the leading/trailing-dot shorthand regression.
- `src/lib/yield.test.ts` (10): claimable-yield math mirroring the contract's rounding, rate
  interpolation before/after the maturity freeze, maturity countdown formatting.
- `src/context/TransactionSafetyContext.test.ts` (10): restoring an in-flight transaction's
  safety record as "uncertain" after a reload, and that only the owning tab can mutate or clear
  a record.
- `src/lib/format.test.ts` (7): `formatAmount` grouping/precision/exact-above-2^53,
  `formatRelativeTime`, `truncateAddress`.
- `src/lib/txSafety.test.ts` (7): the write lock that blocks a second submission while a prior
  one's outcome is still uncertain (built without a callback, after a hash, or mid-signing).
- `src/lib/longYieldProgress.test.ts` (7): the two-step split-then-sell flow's resumable
  progress record — restores only exact, bigint-safe entries and drops malformed ones instead
  of inventing a sell amount.
- `src/lib/validation.test.ts` (7): `isValidTokenAmount` against balance headroom, decimal
  limits, and malformed input.
- `src/lib/events.test.ts` (6): event parsing for both vaults' wrap shapes, both swap
  directions, and liquidity events.
- `src/lib/transactionStatus.test.ts` (4): maps Soroban RPC transaction states to UI status,
  failing closed on any unrecognized state.
- `src/lib/market.test.ts` (3): the market switch swaps every contract address at once — no
  address may leak across markets.
- `src/lib/chainTime.test.ts` (2): anchoring wall-clock estimates to the last sampled ledger
  close time.
- `src/lib/contracts/base.test.ts` (2): the write-phase safety guard refuses to build or open
  the wallet when the durable building record can't be claimed or persisted.
