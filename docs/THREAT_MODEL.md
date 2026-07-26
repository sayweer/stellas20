# Threat model — stellas20

**Status:** Testnet only. No mainnet deployment exists and none is planned inside this phase.
**Last reviewed:** 2026-07-25, against the tree at Phase 7. Findings and the storage/TTL audit
that produced parts of this document live in [`plan/audit-round-2.md`](plan/audit-round-2.md).

This document states what the protocol protects, who could attack it, what an administrator can
and cannot do, and which assumptions the maths depends on. It is written to be checked: every
privileged entry point below cites the line that enforces it.

## 1. What is being protected

Users deposit an underlying asset and receive claims that mature months later. The assets at
risk are:

| Asset | Held by | Lost if… |
|---|---|---|
| Underlying (mUSDY on the demo market, XLM on the Blend market) | the SY vault, or Blend's pool | the vault mis-accounts shares, or Blend itself fails |
| SY shares | holders; the Market escrows the split portion | the Market pays out more than it holds |
| PT — principal, redeemable 1:1 in asset value at maturity | holders | `R_T` is wrong, or the Market is insolvent at redemption |
| YT — all yield until maturity | holders | settlement credits the wrong party, or accrual does not stop at `T` |
| LP shares in the PT/SY pool | providers | the pool prices against a token the Market does not settle in |

The single property everything reduces to is **solvency (I1)**: the Market's SY balance is at
all times at least the sum of every user's claimable yield plus the full principal at the
effective rate. It is asserted after every operation in the randomized harnesses, over both
yield sources.

## 2. Actors

- **User** — splits, merges, claims, redeems, trades, provides liquidity. Assumed hostile:
  may call anything in any order, at any timestamp, with any amount, including dust and exact
  balances. The invariant harnesses model exactly this.
- **Administrator** — the deploy key. Powers enumerated in §4. Cannot reach user funds.
- **Peripheral contracts** — the PT/YT tokens (factory-deployed by the Market) and the AMM.
  Trust between them is established at deploy time and verified on-chain, not assumed (§3).
- **The yield source** — MockYieldToken (admin-driven, demo only) or a live Blend v2 pool
  (outside our control entirely).
- **The network** — Soroban itself: fees, state archival, and testnet resets.

## 3. Trust boundaries

**Market → PT/YT tokens.** The Market factory-deploys both from wasm hashes pinned in its own
constructor (`splitter/src/lib.rs:252-255`, deployed at `:296-301`), records them under
`Tokens(maturity)`, and records
the reverse edge `YtToMaturity(yt)`. `mint` on either token requires the Market's auth
(`pt-token/src/lib.rs:114`, `yt-token/src/lib.rs:142`), and the `Market` key is written once in
the constructor and never rewritten. An impostor token cannot enter the registry, and the real
tokens cannot be minted by anyone else.

**YT token → Market (the settlement hook).** This is the sharpest boundary in the system.
Soroban forbids re-entering a contract already on the call stack, *including for view calls*, so
during a YT transfer the Market cannot read balances back from the token. The token therefore
passes its own pre-transfer balances as arguments. The Market accepts them only after
(a) looking the caller up in `YtToMaturity`, and (b) `yt_token.require_auth()`
(`splitter/src/lib.rs:509-516`). Consequences, stated plainly:

- Yield-accounting integrity rests on the registered YT wasm being exactly the audited
  bytecode. That is guaranteed by the constructor-pinned hash and `deploy_v2`, and there is no
  upgrade path to change it afterwards — which here is a safety property, not a limitation.
- A caller that is *not* in the registry gets `Unauthorized`, so a lookalike token deployed by
  anyone (the token constructors are public) can mint all the fake PT/YT it likes and still
  never reach settlement. Such tokens are a phishing surface against wallets and indexers that
  key on **symbol rather than address** — the frontend keys on address.

**Market ↔ AMM.** The AMM resolves PT from the Market but takes SY as a constructor argument:
two sources of truth for the two halves of every pool. Since Phase 7 the constructor verifies
them against each other via `Splitter::sy_vault()` (`pt-amm/src/lib.rs:155-158`), so a
mismatched deployment fails at deploy rather than at the first drained pool
(audit round 2, F-3).

**Market → SY vault.** The Market only ever calls `transfer`/`balance`/`exchange_rate`/
`exchange_rate_at`. That interface *is* the adapter boundary — swapping the mock vault for the
Blend-backed one required no change in the Market (MASTERPLAN §3.7).

## 4. Administrator powers — the complete inventory

Exactly four entry points in the whole workspace are admin-gated. There are **no others**:

| Contract | Function | Enforced at | Can it touch user funds? |
|---|---|---|---|
| mock-yield-token | `mint` | `lib.rs:175` | Mints demo underlying to any address. Cannot take anyone's. |
| mock-yield-token | `set_rate` | `lib.rs:221` | No direct access; but the rate drives every valuation — see below. |
| splitter | `create_maturity` | `lib.rs:266` | No. Only creates a market. |
| pt-amm | `create_pool` | `lib.rs:172` | No. Only opens a pool. |

**`sy-vault` and `sy-vault-blend` have no admin-gated functions at all.** Both store an admin
address in their constructor and never read it — the vaults holding the actual deposits are
fully permissionless at runtime.

### What the administrator cannot do

- **Cannot move, freeze, or seize user funds.** No transfer path anywhere accepts an admin as
  the authoriser of someone else's balance. Every fund movement is authorised by the owner:
  `from.require_auth()` on SEP-41 paths, and dual auth on `market_burn`
  (`yt-token/src/lib.rs:158-159`) where the Market *and* the holder must both sign.
- **Cannot upgrade any contract.** No `update_current_contract_wasm` exists in any of the seven
  crates.
- **Cannot pause anything.** There is no stop switch.
- **Cannot rotate or transfer adminship.** No `set_admin` exists; every `Admin`/`Market` key is
  written in `__constructor` and never rewritten.

### What the administrator *can* do, and the cost of it

- **Inflate the demo rate.** `set_rate` accepts a slope in `[0, MAX_SLOPE]` and snapshots the
  current rate into a fresh checkpoint, so the rate can never move *backwards* — but an admin
  can spike the slope, let the rate run, and set it back to zero, permanently inflating every
  valuation. This is inherent to a mock whose rate *is* an admin input. The Blend-backed vault
  has no such lever: its rate comes from the pool. Additionally, `set_rate` is capped at
  `MAX_CHECKPOINTS = 100` changes for the contract's whole life, after which it fails for good
  — a bound found by the Phase 7 harness rather than by design intent.
- **Withhold markets and pools.** Only an admin can create a maturity or open its pool, and the
  maturity list is capped at 32 with no deletion, so an admin (or a compromised admin key) can
  permanently exhaust the slots.
- **Mint unlimited demo underlying** — but so can anyone: `faucet` is permissionless and capped
  only per call (`mock-yield-token/src/lib.rs:185-196`), so mUSDY supply is unbounded by design.
  **This crate must never back a real-money market.**

### The cost of immutability

Having no upgrade path is a deliberate trade: an upgrade key is a backdoor, because whoever
holds it can replace the code that guards the funds. The price is real and worth stating —

- a bug cannot be patched in place; the remedy is redeploying and migrating, which is what
  [`RUNBOOKS.md`](RUNBOOKS.md) covers;
- a stuck or mispriced market cannot be paused;
- a lost admin key permanently freezes maturity creation, pool creation and `set_rate`, while
  leaving every user's ability to split, claim, redeem and trade completely intact.

That last point is the shape of the trade: losing the key costs the *operator* everything and
costs *users* nothing.

## 5. Assumptions the maths depends on

1. **The exchange rate is monotonically non-decreasing** (MASTERPLAN §3.2). Settlement computes
   a release as `floor(yt·S/index) − ceil(yt·S/r_eff)`; a rate that fell would make that
   negative and shift SY from YT holders to PT holders that nobody deposited. The mock enforces
   monotonicity structurally; the Blend vault enforces it with a ratchet
   (`sy-vault-blend/src/lib.rs:317-333`) because a spot-only source cannot promise it.
   **Any future SY source must satisfy this before it is wired in** — sources that can lose
   value (slashing, negative rates) are out of scope.
2. **The rounding law holds everywhere**: amounts leaving the protocol floor, amounts reserved
   against a liability ceil. The surplus accrues to the protocol and is never claimable, which
   is what makes I1 one-sided and provable.
3. **Amounts stay inside the overflow envelope**: ≤ 1e15 stroops against `RATE_SCALE = 1e12`
   keeps every product far below `i128::MAX`, and every arithmetic operation is `checked_*`
   regardless. The slow test tier runs in release mode specifically so `overflow-checks` stays
   on there.
4. **`R_T` is fixed once and forever.** After maturity the first read pins the rate (the
   checkpoint history on the mock; the frozen-rate cache on Blend), so every settlement and
   redemption at that maturity uses the identical number.

## 6. Failure modes

| Failure | Effect | Response |
|---|---|---|
| **Testnet reset** wipes all deployments | Everything is gone; addresses invalid | Full redeploy — [`RUNBOOKS.md`](RUNBOOKS.md) §1, executed for real in Phase 7 |
| **Blend pool fully utilized** | `unwrap` cannot pay out | Detected and surfaced as its own error, not a generic failure: the vault maps Blend's `InvalidUtilRate` to `LiquidityUnavailable` and the UI says liquidity is temporarily unavailable |
| **Blend pool itself fails or is drained** | The Blend market's backing is impaired | Out of our control. The mock market is unaffected — the two markets share no state |
| **State archival** of a dormant position | The user's next call fails until a `RestoreFootprint` | Positions are extended to the network maximum (~1 year), so this needs dormancy beyond a full year; the value survives archival intact |
| **Lost admin key** | No new maturities, pools, or rate changes | Users unaffected (§4). Redeploy to resume operations |
| **A bug in deployed code** | Cannot be patched | Redeploy and migrate; users can always exit the old deployment, since exit paths need no admin |

## 7. Storage and state archival

Full table — every key class, its storage type, whether it is unbounded, and whether every hot
path extends it — is in [`plan/audit-round-2.md`](plan/audit-round-2.md) §2. The policy in one
paragraph:

Singleton configuration lives in instance storage on a ~30-day window, refreshed by all protocol
traffic including rate reads. Per-user positions (PT/YT/SY/mUSDY balances, `UserYield`,
`LpBalance`) live in persistent storage and are topped up to the **network maximum** on every
write, because only their own owner's activity refreshes them and the product's maturities
outlive any shorter window. Allowances live in temporary storage and expire exactly at their
stated `expiration_ledger`. Two keyspaces are unbounded and caller-driven —
`sy-vault-blend::FrozenRate(ts)` and the per-address balance maps — which is accepted: the
caller pays the rent for entries they create, and Soroban has no per-contract storage quota to
exhaust.

Archival is not data loss. On the live network an archived entry makes the touching transaction
fail until a `RestoreFootprint` operation brings it back with its contents intact. (The local
test host does not model this — it simply drops expired entries — so tests must not be read as
evidence about archival behaviour.)

## 8. Explicitly out of scope

- **Mainnet.** No mainnet configuration exists anywhere in the repo, deliberately.
- **The economic security of the mock yield source.** `mock-yield-token` is a demo instrument
  with an unlimited faucet and an admin-set rate. It proves the mechanism; it is not collateral.
- **Blend's own solvency**, oracle behaviour, and governance.
- **Front-running and MEV in general.** One instance is called out specifically in audit round 2
  (F-4): whoever first reads the rate after maturity pins `R_T`, choosing between marginally
  favouring PT redeemers or YT holders. Because the ratchet only moves upward and settlement
  reads are frequent, the achievable spread is a sub-stroop rounding effect — but it is the
  right place to look first before any real-money deployment.
- **Formal verification.** The bar here is a coherent, documented security story backed by
  executable invariants, not machine-checked proof.
- **Key management for end users.** Signing happens entirely inside the user's wallet; the app
  never sees, requests, or stores a secret key.
