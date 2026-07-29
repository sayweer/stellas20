# Runbooks — stellas20 operations

Operational procedures for the Testnet deployment. Every command here is the real one; §1 was
executed end to end on 2026-07-25 and the transcript excerpts are from that run.

There is no upgrade path and no pause switch in any contract
([`THREAT_MODEL.md`](THREAT_MODEL.md) §4), so **redeploying is the answer to most incidents.**
That is deliberate, and it is why §1 is the runbook that matters most.

**Prerequisites for all procedures**

```bash
stellar --version            # 27.x
stellar keys ls              # the admin identity must exist and be funded
IDENTITY=vault-admin         # override if yours is named differently
```

If the CLI prints `A local config was found at ".stellar" but is no longer read`, run
`stellar config migrate` once. It is harmless — the CLI reads the global config at
`~/.config/stellar` — but it clutters every transcript.

---

## 1. Full recovery — testnet reset, or redeploying after a contract change

Stellar wipes Testnet periodically, and because contracts are immutable this is also the
procedure for shipping any contract fix. It replaces **every** address.

### 1.1 Check the admin identity

```bash
stellar keys address "$IDENTITY"
curl -s "https://horizon-testnet.stellar.org/accounts/$(stellar keys address "$IDENTITY")" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print([b['balance'] for b in d['balances'] if b['asset_type']=='native'][0])"
```

If the account 404s (a reset wipes accounts too), re-fund it:

```bash
curl "https://friendbot.stellar.org/?addr=$(stellar keys address "$IDENTITY")"
```

A full `--with-blend` deploy costs roughly **30 XLM** in fees (26 transactions in the recorded
run). Keep a few hundred XLM in the identity.

### 1.2 Verify the Blend pool still exists

Only needed for `--with-blend`. A reset moves Blend's deployment too, so confirm the pool
address before relying on it:

```bash
stellar contract invoke --id CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF \
  --source "$IDENTITY" --network testnet -- \
  get_reserve --asset CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

If it fails, re-read Blend's current addresses from `blend-utils/testnet.contracts.json` and
pass them through: `BLEND_POOL=… BLEND_ASSET=… ./scripts/deploy-testnet.sh --with-blend`.
Without the flag the mock market deploys fine and the app runs mock-only, so **a broken Blend
does not block recovery** — ship the mock market first and add Blend back later.

### 1.3 Deploy

```bash
./scripts/deploy-testnet.sh --with-blend 2>&1 | tee redeploy.log
```

The script builds the wasm, deploys the six contracts, uploads the PT/YT factory templates,
creates the default maturities (+1h, +1d, +7d) and opens a pool for each — on both markets. It
ends with the block to copy:

```
=== Deployed. Copy these into .env / .env.example / Vercel ===
VITE_MYT_CONTRACT_ID=CDN42W36GJ2AGPWGDMEL2BUEKCGCVCQ4GRLFXUBPTQUDIEDWQQHZG3TR
VITE_SY_VAULT_CONTRACT_ID=CBPCPCDCHGAJUU7BID7DOOKBTIWTRIYYZXGL2YBMJ64KNR53YJD4ANZE
VITE_SPLITTER_CONTRACT_ID=CCBQ4PWTSBKL6RTSL5CFUPVX3SZMLODDJKGH6XFVRZU6UPFXAHHZBSBR
VITE_AMM_CONTRACT_ID=CD4B2YYEMDDRVOFH6EWIXFMP5ZX3YCLMALTYRTGSHCNXDDV3XWNIMILD
VITE_BLEND_SY_VAULT_CONTRACT_ID=CAWXCCBE7RY26LVVWN5QWWOARGDABGQKJMWAYPCM52TT5QZM2UCOGA7J
VITE_BLEND_SPLITTER_CONTRACT_ID=CDRDDE3NQAY5RPQ4KN7MRAOUTJTWITWLSZQWAFP4XRIN23VG7UHE6YOU
VITE_BLEND_AMM_CONTRACT_ID=CBT5RSS37MYLQYEBOYM4GKWSY2MWKQW3RPUPRKQHUVZNKXLZ76TJED75
VITE_BLEND_ASSET_ID=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
VITE_BLEND_ASSET_SYMBOL=bXLM
```

**If the AMM deploy fails with `Error(Contract, #12)`** (`SyTokenMismatch`), the AMM was pointed
at an SY vault the Market does not settle in. That check exists precisely so this fails at
deploy rather than after LPs have deposited — fix the `--sy_token` argument, do not work around
it.

### 1.4 Propagate the addresses — all four places

Missing one is the most common way to leave a half-broken app:

1. `.env` (local dev)
2. `.env.example` (the documented defaults)
3. `src/config.ts` — the hardcoded fallbacks, so a checkout with no `.env` still works
4. Vercel project environment variables, then **redeploy the Vercel project** — env changes do
   not apply to existing builds

```bash
npm run build     # fails fast if a contract ID is malformed
```

### 1.5 Seed liquidity

Pools deploy empty; the Trade view has nothing to quote against until they are seeded.

```bash
./scripts/seed-liquidity.sh <maturity>

# Blend market:
SOURCE=blend SY_ID=sy-vault-blend SPLITTER_ID=splitter-blend \
  AMM_ID=pt-amm-blend ./scripts/seed-liquidity.sh <maturity>
```

### 1.6 Smoke test before declaring recovery done

Read-only checks first, then one full round trip. Use a **non-admin** identity so nested auth is
genuinely exercised.

```bash
U=$(stellar keys address demo-user)
M=<a maturity from the deploy output>

stellar contract invoke --id $VITE_SPLITTER_CONTRACT_ID --source demo-user --network testnet -- \
  get_maturities
stellar contract invoke --id $VITE_SPLITTER_CONTRACT_ID --source demo-user --network testnet -- \
  get_market --maturity "$M"

stellar contract invoke --id $VITE_MYT_CONTRACT_ID --source demo-user --network testnet -- \
  faucet --to "$U" --amount 1000000000
stellar contract invoke --id $VITE_SY_VAULT_CONTRACT_ID --source demo-user --network testnet -- \
  wrap --from "$U" --amount 1000000000
stellar contract invoke --id $VITE_SPLITTER_CONTRACT_ID --source demo-user --network testnet -- \
  split --from "$U" --maturity "$M" --sy_amount 1000000000
stellar contract invoke --id $VITE_SPLITTER_CONTRACT_ID --source demo-user --network testnet -- \
  claim_yield --from "$U" --maturity "$M"
```

To exercise `redeem_pt` without waiting for a real maturity, create a short one first
(§3) — the recorded run used `now + 210s`.

Finally, load the app, connect a wallet, and switch markets: the mock and Blend markets must
show different underlyings and no contract address may leak across the switch.

---

## 2. Demo mode — accelerating the rate for a recording

At the realistic ~5% APY, yield moves by a handful of stroops per minute — true to life, and
invisible on camera. Steepen the slope right before recording and restore it after. Rate
continuity is preserved by the checkpoint mechanism, so nothing already split is disturbed.

```bash
# ~+1.2%/min. NOTE: this also shows the underlying APY as ~630,000% in the UI,
# which looks absurd on camera. 20000 (~63% APY) is enough to make accrual
# visible while staying believable — that is what the recorded demo used.
stellar contract invoke --id "$MYT" --source "$IDENTITY" --network testnet -- \
  set_rate --slope_per_sec 200000000

# back to ~5% APY (0.05 * 1e12 / 31_536_000)
stellar contract invoke --id "$MYT" --source "$IDENTITY" --network testnet -- \
  set_rate --slope_per_sec 1585
```

Two constraints worth knowing before you rely on this:

- **The rate only ever goes up.** `set_rate` sets the *slope* going forward and snapshots the
  current rate; there is no way to walk an inflated rate back down. An accidental extra zero is
  permanent for that deployment.
- **`set_rate` works exactly 100 times per deployment** (`MAX_CHECKPOINTS`), then fails for good
  with `Error(Contract, #8)`. Two calls per recording is nothing, but a script that toggles the
  rate in a loop will burn the budget.

This lever does not exist on the Blend market — its rate comes from the pool.

---

## 3. Maturity lifecycle

**Create** (admin only; also deploys that maturity's PT/YT pair):

```bash
M=$(( $(date +%s) + 480 ))          # short maturity for a demo
stellar contract invoke --id "$SPLITTER" --source "$IDENTITY" --network testnet -- \
  create_maturity --maturity "$M"
stellar contract invoke --id "$AMM" --source "$IDENTITY" --network testnet -- \
  create_pool --maturity "$M"
```

**Sizing a maturity so it quotes a usable rate.** Implied APY annualises the PT discount by
`YEAR/dt`, so a near maturity magnifies *everything* — including the 30 bps swap fee, which is
charged once but annualises to roughly:

| time to maturity | fee alone, as APY |
|---|---|
| 5 days | ~25 points |
| 30 days | ~3.7 points |
| 90 days | ~1.2 points |
| 180 days | ~0.6 points |

At five days that fee exceeds any plausible rate on offer, so **every** buy locks a negative
rate no matter how deep the pool or how small the order — the pool is untradeable in practice
even while the Markets list shows a healthy mid-price. Price impact then adds to it: a 200 SY
pool three days from maturity went to −99% APY on a single 5 SY buy.

Use **90 days or more** for anything users will actually trade, and seed it deep — a 12,000 SY
pool at 90 days holds a 100 SY buy above water, a 3,000 SY one does not. Do not go past ~180
days: positions extend to `env.storage().max_ttl()`, which is about 180 days, so a longer
maturity can archive a holder's balance before they can redeem it. Short maturities are still
fine for a recording (§2) — just do not leave them as the only funded pool.

**Retire** — there is no delete. A matured market simply stops accepting `split`/`merge` and
swaps while `redeem_pt`, `claim_yield` and `remove_liquidity` keep working forever, so holders
can always exit. The frontend hides matured maturities from the trading views.

**The 32-maturity cap is permanent.** `MAX_MATURITIES = 32` per Market with no deletion, so a
long-lived deployment can exhaust it — creating short-lived demo maturities repeatedly is the
fast way to get there. If it fills, deploy a new Market (§1); the old one keeps working for
everyone already in it.

---

## 4. Environment and key rotation

**Rotating the Vercel environment.** Update the variables, then trigger a redeploy — Vercel
bakes `VITE_*` values in at build time, so editing them changes nothing until the next build.
Only non-secret, `VITE_`-prefixed config ever goes there; it all ships to the browser.

**Rotating the admin key.** There is no `set_admin` in any contract. Rotation means redeploying
with the new identity as admin (§1) and pointing the app at the new addresses. Plan for it: the
existing deployment cannot be handed over.

**If the admin key is lost.** Users are unaffected — every user-facing operation authorises
against the *user's* key, not the admin's. What stops is operations: no new maturities, no new
pools, no rate changes. The existing markets run to maturity normally. Recover by redeploying.

**Secrets hygiene.** Deploy keys live only in the `stellar keys` identity store, never in the
repo. `.env` is gitignored. No procedure here should ever have you paste a secret key into a
file.

---

## 5. Restoring archived state

Persistent entries expire if untouched past their TTL. On the live network an archived entry is
**not deleted** — the transaction touching it fails until a `RestoreFootprint` operation brings
it back with its contents intact.

Since Phase 7, positions (PT/YT/SY balances, `UserYield`, LP shares) are extended to the network
maximum on every write, so reaching this state requires dormancy beyond roughly a year. If it
does happen:

```bash
stellar contract restore --id "$CONTRACT" --key-xdr "$KEY_XDR" \
  --source "$IDENTITY" --network testnet
```

The failing simulation names the entry it needs; `stellar contract read --id <contract>` lists
live keys with their TTLs. Restore is permissionless — anyone can pay to revive an entry, so
support can unblock a user without their key.
