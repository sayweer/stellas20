# Audit round 2 — adversarial review (Phase 7.2 / 7.5)

**Date:** 2026-07-25 · **Scope:** all seven contract crates at `18b7ca3` (post-Phase-6)
· **Method:** two parallel read-only sweeps (admin-power inventory, storage×TTL inventory)
followed by line-by-line verification against source. **An automated sweep's claim is a lead,
not a finding** — everything below was re-read in the source before being written down, and
three candidate findings were dismissed outright (see §4).

Round 1 was the design review baked into Phases 2–3 (rounding law, reentrancy/hook auth,
overflow envelope); this round targets what that review could not see: TTL/state archival,
cross-contract configuration trust, and the powers an admin actually holds.

## 1. Findings

| # | Severity | Title | Status |
|---|---|---|---|
| F-1 | Medium | Passive positions archive long before their maturity | **Fixed** |
| F-2 | Medium | Rate-read paths never extend the instance entry they depend on | **Fixed** |
| F-3 | Medium | The AMM never verifies its SY token against the Market's vault | **Fixed** |
| F-4 | Low | `FrozenRate` is an unbounded, caller-chosen persistent keyspace | Accepted + documented |
| F-5 | Low | Two rate "views" write state | Accepted + documented |
| F-6 | Info | No pause, no upgrade, no admin rotation anywhere | Accepted design |
| F-7 | Info | `set_rate` is a lever over every valuation in the protocol | Accepted design |
| F-8 | Info | `faucet` is permissionless and uncapped in aggregate | Accepted (testnet mock) |

---

### F-1 — Passive positions archive long before their maturity · Medium · Fixed

**Where.** Every per-user persistent entry is extended only inside its own credit/debit path,
to `TTL_EXTEND_TO = 518_400` ledgers (~30 days):

| Entry | Extend sites (pre-fix) |
|---|---|
| `splitter::UserYield(Address, u64)` | `save_user_yield` — `splitter/src/lib.rs:650-659` |
| `yt-token::Balance(Address)` | `credit`/`debit` — `yt-token/src/lib.rs:378-380, 392-394` |
| `pt-token::Balance(Address)` | `credit`/`debit` — `pt-token/src/lib.rs:300, 314` |
| `sy-vault::Balance(Address)` | `credit`/`debit` — `sy-vault/src/lib.rs:368, 382` |
| `sy-vault-blend::Balance(Address)` | `credit`/`debit` — `sy-vault-blend/src/lib.rs:588, 602` |
| `mock-yield-token::Balance(Address)` | `credit`/`debit` — `mock-yield-token/src/lib.rs:411, 437` |
| `pt-amm::LpBalance(Address, u64)` | `credit_lp`/`debit_lp` — `pt-amm/src/lib.rs:513, 526` |

**Why it matters.** The entry is refreshed only when its *own owner transacts*. The protocol's
headline use case is precisely the opposite: buy discounted PT and **hold it, untouched, until
maturity**. `create_maturity` accepts any future timestamp (`splitter/src/lib.rs:267` only
checks `maturity > now`), so a 3–12 month maturity — the natural product horizon — is 3–12×
the 30-day TTL window. A YT holder waiting to claim, and an LP who provided liquidity and
walked away, are in the same position.

**What actually happens on expiry.** Not fund loss. An archived persistent entry on the live
network is not deleted — the transaction that touches it fails until a `RestoreFootprint`
operation brings it back, after which the original value is intact. So this is a **liveness
and UX defect**: users would have to discover and submit a restore before they could redeem,
with no in-app path to do so. That is why this is Medium and not High.
(Note for anyone writing tests here: the local test host does *not* reproduce the restore
requirement — it simply drops the expired entry, so a naive test sees data loss rather than a
failed transaction. Model the real behaviour from the network semantics, not the harness.)

**Fix.** Position-class entries are now topped up to the network maximum
(`env.storage().max_ttl()`, ~1 year) instead of the 30-day operational window, keeping the
existing 14-day threshold so the top-up is rare rather than per-operation. Singleton config
(instance storage) keeps the 30-day window — it is refreshed by all protocol traffic, not by
one user's.

**Regression test.** Advance the ledger sequence past the old 30-day window and assert the
position is still readable and redeemable; fails before the fix.

---

### F-2 — Rate-read paths never extend the instance entry they depend on · Medium · Fixed

**Where.**

- `mock-yield-token::exchange_rate` / `exchange_rate_at` (`lib.rs:199-207`) read `Checkpoints`
  out of instance storage via `rate_at` → `load_checkpoints` and never call `extend_instance`.
  The instance entry is extended only by the constructor, `set_rate`, `credit` and `debit`.
- `sy-vault::exchange_rate` / `exchange_rate_at` (`lib.rs:191-200`) read `YieldToken` from
  instance storage, same omission.
- `sy-vault-blend::exchange_rate` (`lib.rs:317-333`) extends **only on the advancing branch**
  (`spot > last`, line 326). The flat branch returns at line 332 without extending.

**Why it matters.** These are the hottest cross-contract reads in the system — the Market
routes every `split`/`merge`/`claim_yield`/`redeem_pt` through them — but a *read* through a
client does not extend the callee's storage; only the callee can do that. A market whose
traffic is settlement-only therefore lets the rate history decay while looking perfectly
healthy. If the instance entry archives, `load_checkpoints` fails and **the entire protocol
halts** until someone restores that contract's footprint: no rate means no split, no merge,
no claim, no redemption. Frontend polling contributes nothing, since simulation does not
commit writes.

**Fix.** `exchange_rate` / `exchange_rate_at` now extend the instance entry in
`mock-yield-token` and `sy-vault`, and `sy-vault-blend::exchange_rate` extends on the flat
branch too.

**Regression test.** `env.deployer().get_contract_instance_ttl()` before and after a rate
read; fails before the fix.

---

### F-3 — The AMM never verifies its SY token against the Market's vault · Medium · Fixed

**Where.** `pt-amm::__constructor` (`lib.rs:147-152`) stores `sy_token` verbatim from a
constructor argument. `create_pool` (`lib.rs:168-178`) separately resolves the PT token from
the Market. Nothing ever asserts that the AMM's `sy_token` is the same SY vault the Market
settles against — and the Splitter had no public getter that would have made the check
possible.

**Why it matters.** The two halves of every pool come from two different sources of truth. An
AMM deployed against a `sy_token` the deployer controls prices real PT against a worthless
token; LPs deposit genuine PT and the attacker drains it. This is a deployment-time
misconfiguration rather than a runtime exploit — but it is silent, permanent (no upgrade
path, F-6), and the deploy script passes the address positionally.

**Fix.** Added the `Splitter::sy_vault()` view and a constructor-time equality check in
`PtAmm::__constructor`, so a mismatched deployment fails at deploy instead of at the first
drained pool.

**Regression test.** Constructing the AMM with an SY address that is not the Market's vault
panics; fails before the fix.

---

### F-4 — `FrozenRate` is an unbounded, caller-chosen persistent keyspace · Low · Accepted

`sy-vault-blend::exchange_rate_at` (`lib.rs:349-366`) takes any `ts < now` from any
unauthenticated caller and creates a new persistent entry per distinct `ts`. Compare with the
deliberate `MAX_MATURITIES = 32` and `MAX_CHECKPOINTS = 100` caps elsewhere — this key has no
equivalent bound.

**Accepted, not fixed.** The attacker pays the rent for every entry they create, entries
expire on their own, and Soroban has no per-contract storage quota to exhaust, so there is no
victim: this is self-funded state bloat, not a denial of service. Bounding the keyspace, by
contrast, would mean either capping how many maturities can ever settle or bucketing `ts` —
and bucketing changes the settlement rate, breaking I4. The keyspace stays unbounded
deliberately.

A second, sharper property lives at the same entry point and *is* by design: the first caller
after `now > T` pins `R_T` for good. Whoever wins that race chooses between a lower `R_T`
(favouring PT redeemers) and a higher one (favouring YT holders). Because the ratchet only
ever moves up and settlement reads are frequent, the achievable spread is a sub-stroop
rounding effect rather than a meaningful value transfer — but it is the correct place to look
first if a real-money version of this vault is ever built. Rationale in `blend-notes.md` §6.

### F-5 — Two rate "views" write state · Low · Accepted

`sy-vault-blend::exchange_rate` writes `LastRate` (the monotonicity ratchet, `lib.rs:325`) and
`exchange_rate_at` writes `FrozenRate` (`lib.rs:361`). Both are reached from
`splitter::preview_claimable` and `get_account` — the two functions the frontend polls. On the
Blend-backed market these are therefore not pure views.

**Accepted.** The frontend reads them through simulation, which never commits, so no user is
charged and no state moves on a read. A spot-only source cannot be made monotone without
remembering something, and the alternative — a keeper that snapshots the rate — adds an
external liveness dependency to settlement. Documented in `THREAT_MODEL.md` rather than
changed.

### F-6 — No pause, no upgrade, no admin rotation anywhere · Info · Accepted design

Verified absent across all seven crates: no `set_admin`, no `update_current_contract_wasm`, no
pause flag. Every `Admin`/`Market` key is written in `__constructor` and never rewritten
(e.g. `splitter/src/lib.rs:245`, `pt-token/src/lib.rs:103`). `sy-vault` and `sy-vault-blend`
store an admin they never read — the vaults are fully permissionless at runtime.

This is the deliberate trade behind "the contract has no admin backdoor into user funds": an
upgrade path is a backdoor, since whoever holds it can replace the code that guards the funds.
The cost is real and stated plainly in the threat model — a bug cannot be patched, a stuck
market cannot be paused, and a lost admin key permanently freezes maturity creation, pool
creation and `set_rate`. Redeploying is the only remedy, which is what `RUNBOOKS.md` covers.

### F-7 — `set_rate` is a lever over every valuation · Info · Accepted design

`mock-yield-token::set_rate` (`lib.rs:211-238`) is admin-gated and bounded — slope ∈
`[0, MAX_SLOPE]`, and rate continuity is preserved by snapshotting into a fresh checkpoint, so
the rate can never move backwards. Within those bounds an admin can still spike the slope and
let the rate run, which permanently inflates every valuation downstream. This is inherent to a
mock yield source whose rate *is* an admin input; the Blend-backed vault has no such lever
(its rate comes from the pool). Listed in the threat model's admin-powers inventory.

### F-8 — `faucet` is permissionless and uncapped in aggregate · Info · Accepted

`mock-yield-token::faucet` (`lib.rs:185-196`) caps a single call at `FAUCET_MAX` but not the
number of calls, so mUSDY supply is effectively unlimited. Correct and intended for a testnet
demo token; recorded here only so that "this crate must never back a real-money market" is
written down somewhere. The Blend market is the real-yield path.

---

## 2. Storage × TTL table (task 7.5)

Constants are identical in all seven crates: `TTL_THRESHOLD = 241_920` (~14 d),
`TTL_EXTEND_TO = 518_400` (~30 d). "Position" below means the post-F-1 policy: threshold 14 d,
extend to `env.storage().max_ttl()`.

| Contract | Key | Storage | Holds | Growth | TTL policy | Every hot path extends? |
|---|---|---|---|---|---|---|
| mock-yield-token | `Admin` | instance | admin address | singleton | 30 d | yes (post-F-2) |
| | `Checkpoints` | instance | `Vec<RateCheckpoint>`, cap 100 | bounded | 30 d | **yes (fixed by F-2)** |
| | `TotalSupply` | instance | i128 | singleton | 30 d | yes |
| | `Balance(Address)` | persistent | i128 | unbounded | **position** | yes on writes |
| | `Allowance(A,A)` | temporary | allowance | unbounded | until `expiration_ledger` | yes (see §4) |
| sy-vault | `Admin` | instance | unused | singleton | 30 d | n/a (dead key) |
| | `YieldToken` | instance | underlying address | singleton | 30 d | **yes (fixed by F-2)** |
| | `TotalSupply` | instance | i128 | singleton | 30 d | yes |
| | `Balance(Address)` | persistent | i128 SY | unbounded | **position** | yes on writes |
| | `Allowance(A,A)` | temporary | allowance | unbounded | until `expiration_ledger` | yes |
| sy-vault-blend | `Admin` | instance | unused | singleton | 30 d | n/a (dead key) |
| | `Pool` / `Asset` / `Name` / `Symbol` | instance | config | singleton | 30 d | yes |
| | `TotalSupply` / `Position` | instance | i128 / bToken position | singleton | 30 d | yes |
| | `LastRate` | instance | monotonicity ratchet | singleton | 30 d | **yes (fixed by F-2)** |
| | `FrozenRate(u64)` | persistent | pinned rate | **unbounded, caller-chosen** | 30 d | yes (both branches) |
| | `Balance(Address)` | persistent | i128 SY | unbounded | **position** | yes on writes |
| | `Allowance(A,A)` | temporary | allowance | unbounded | until `expiration_ledger` | yes |
| splitter | `Admin` / `SyVault` / `UnderlyingSymbol` | instance | config | singleton | 30 d | yes |
| | `Maturities` | instance | `Vec<u64>`, cap 32 | bounded | 30 d | yes |
| | `PtWasmHash` / `YtWasmHash` | instance | `BytesN<32>` | singleton | 30 d | yes |
| | `Tokens(u64)` / `YtToMaturity(Address)` | instance | registry | bounded ≤32 | 30 d | yes |
| | `UserYield(Address,u64)` | persistent | `{index, accrued_sy}` | unbounded | **position** | yes on writes |
| pt-token | `Market` / `Name` / `Symbol` | instance | config | singleton | 30 d | yes |
| | `TotalSupply` | instance | i128 | singleton | 30 d | yes |
| | `Balance(Address)` | persistent | i128 PT | unbounded | **position** | yes on writes |
| | `Allowance(A,A)` | temporary | allowance | unbounded | until `expiration_ledger` | yes |
| yt-token | `Market` / `Name` / `Symbol` | instance | config | singleton | 30 d | yes |
| | `TotalSupply` | instance | i128 | singleton | 30 d | yes |
| | `Balance(Address)` | persistent | i128 YT | unbounded | **position** | yes on writes |
| | `Allowance(A,A)` | temporary | allowance | unbounded | until `expiration_ledger` | yes |
| pt-amm | `Admin` / `Market` / `SyToken` | instance | config | singleton | 30 d | yes |
| | `Pool(u64)` | instance | reserves + LP supply | bounded ≤32 | 30 d | yes (`save_pool`) |
| | `LpBalance(Address,u64)` | persistent | i128 LP shares | unbounded | **position** | yes on writes |

**Views never extend anything**, in any contract — conventional, and now harmless: after F-1
and F-2 every entry class a dormant user depends on is either topped to the network maximum by
its own last write, or refreshed by all protocol traffic.

**Worst-case revival path.** If an entry does archive (dormancy beyond ~1 year, or a market
with no traffic at all), the value is not lost: a `RestoreFootprint` operation naming the
entry brings it back with its contents intact, after which the normal call succeeds. The
runbook for this is in `RUNBOOKS.md`.

## 3. Trust boundaries confirmed sound

Re-verified during this round, no change required:

- **YT hook auth** (`splitter::on_yt_transfer`, `lib.rs:501-527`). Balances arrive as
  arguments because Soroban forbids reentering the YT token mid-transfer, so the Market cannot
  read them back. The Market accepts them only after a `YtToMaturity` registry lookup plus
  `yt_token.require_auth()`, and the registry is written solely by `create_maturity` for
  tokens the Market itself factory-deployed from a constructor-pinned wasm hash
  (`lib.rs:293-311`). An impostor YT cannot reach the hook.
- **`market_burn` dual auth** (`yt-token/src/lib.rs:156-167`): Market *and* holder. Outsiders
  cannot skip settlement; the Market cannot burn unilaterally.
- **PT/YT `mint`** is reachable only by the immutable `Market` address.
- **No admin path touches user funds** in any contract — verified entry point by entry point
  for the threat model's inventory.

## 4. Candidate findings dismissed

Recorded because "we looked and it was fine" is worth as much as a finding:

- **"Partially-spent allowances can vanish before their stated expiry."** They cannot.
  `approve` extends the temporary entry with `live_for = min(expiration_ledger - sequence,
  max_ttl)`, i.e. exactly to the stated expiry (e.g. `yt-token/src/lib.rs:215-219`), and a
  later `set` from `spend_allowance` does not shorten an existing entry's TTL. The allowance
  lives exactly as long as it claims to.
- **"An archived `LastRate` silently resets the ratchet to spot."** It does not. On the live
  network an archived entry makes the invocation fail until it is restored; it does not read
  as absent. The `unwrap_or(0)` at `sy-vault-blend/src/lib.rs:319-323` is reached only when
  the ratchet has genuinely never been written. (The local test host *does* drop expired
  entries, which is what makes this an easy mistake to make.)
- **`yt-token` self-transfer emits a `Transfer` event and bumps the instance TTL without
  moving anything** (`lib.rs:288-301`). Intended and correct: a self-transfer of a valid,
  affordable amount succeeds, so the event belongs there, and skipping settlement is sound
  because settlement is idempotent and no balance changed. Suppressing the event would be the
  actual defect — indexers key on it.
- **`pt-amm::debit_lp` stores `0` rather than removing the entry** (`lib.rs:517-528`). A
  zero-value entry expires on its own and the write costs the caller nothing extra; removing
  it is a nicety, not a fix. Left alone deliberately (out of scope: "don't refactor what isn't
  broken").
