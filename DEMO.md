# Demo video — script & runbook

A 1–2 minute walkthrough that shows the product's promise: **locking a fixed yield on Stellar**.
This file has two parts — the pre-recording setup, then the shot-by-shot script.

> Record at a desktop width; the console is responsive down to 390px, but the left rail collapses
> to a bottom bar below `lg` and the rail is worth showing.

> Everything below runs on **Testnet**. The admin identity is `vault-admin`; the live contract
> IDs are in the README's *Deployed on Testnet* table (and are the defaults baked into the app).

---

## 1. Pre-recording runbook

Do this once, right before recording, so the demo has a maturity that expires on camera and a rate
that visibly ticks.

### a. Fund the demo wallet

The wallet you'll connect in the browser needs **Testnet XLM** (for fees) and **mUSDY** (to trade):

- XLM: fund the account via [Friendbot](https://friendbot.stellar.org) or the wallet's own faucet.
- mUSDY: use the app's **Faucet** button (Advanced tab / wallet bar) after connecting, or from the CLI:
  ```bash
  MYT=<VITE_MYT_CONTRACT_ID>
  stellar contract invoke --id $MYT --source vault-admin --network testnet -- \
    faucet --to <YOUR_WALLET_ADDRESS> --amount 20000000000   # 2,000 mUSDY
  ```

### b. Create a short maturity + pool (so redemption happens on camera)

```bash
SP=<VITE_SPLITTER_CONTRACT_ID>
AMM=<VITE_AMM_CONTRACT_ID>
SHORT=$(( $(date +%s) + 480 ))          # matures in 8 minutes
stellar contract invoke --id $SP  --source vault-admin --network testnet -- create_maturity --maturity $SHORT
stellar contract invoke --id $AMM --source vault-admin --network testnet -- create_pool     --maturity $SHORT

# Seed the pool at a target fixed APY (script derives the fair PT price):
MYT_ID=$MYT SY_ID=<VITE_SY_VAULT_CONTRACT_ID> SPLITTER_ID=$SP AMM_ID=$AMM \
  ./scripts/seed-liquidity.sh $SHORT 0.08
```

### c. (Optional) Accelerate the rate so accrual is visible on camera

At the realistic ~5% APY, yield ticks too slowly to see in 90 seconds. Steepen it for the take,
then **restore it right after**:

```bash
# Steepen (~+1.2%/min) — makes claimable visibly climb:
stellar contract invoke --id $MYT --source vault-admin --network testnet -- set_rate --slope_per_sec 200000000
# ... record ...
# Restore the realistic ~5% APY slope:
stellar contract invoke --id $MYT --source vault-admin --network testnet -- set_rate --slope_per_sec 1585
```

Rate continuity is preserved across `set_rate` by the checkpoint mechanism — past rates (and so
already-accrued yield) are unaffected.

### d. Dry-run once

Walk the whole script below end to end before the real take, so nothing surprises you on camera.

---

## 2. Shot-by-shot script (~90s)

**(0:00–0:15) The problem.**
> "Stellar's RWA boom is bringing real yield on-chain — but there's no way to *lock* or *trade* it.
> On Ethereum, Pendle solved this by splitting a yield asset into a Principal Token — a bond — and a
> Yield Token — the coupon. Stellar had no equivalent. This is that primitive."

Open the landing page at **`/`** — the headline, and the counters underneath reading *live* chain
state (tradeable markets, pool liquidity). Click **Launch App** to enter the console at `/app`; it
lands on **Markets**, one row per maturity with its implied **fixed APY**.

**(0:15–0:40) Lock a fixed rate.**
- Click **Connect Wallet** → the StellarWalletsKit picker (Freighter / xBull / Albedo). Connect.
- Pick the short-maturity market → **Lock rate**.
- On **Trade → Lock fixed rate**, enter an SY amount. Point at the **locked APY**, the discount, and
  min-received. Submit → show the **pending → success** tx card with the hash + Stellar Expert link.

> "I'm buying the Principal Token below par. It redeems 1:1 at maturity — so that discount is my
> locked, fixed return."

**(0:40–1:05) Live yield, then claim.**
- Go to **Advanced**, **Split** some SY (equal PT + YT — an on-chain invariant).
- Open **Portfolio**: watch **claimable yield tick up live**. Click **Claim** → tx success.
- Optional beat: open **Activity** — every protocol and AMM event streaming in from `getEvents`,
  including the two transactions just sent.

> "The Yield Token streams the underlying yield in real time. Anyone can claim what's accrued, any
> time — settled exactly, per holder."

**(1:05–1:25) Maturity → redeem the fixed principal.**
- The short maturity's countdown hits zero; accrual **freezes**.
- **Redeem PT** → SY paid out at the frozen maturity rate. Show the balance now **exceeds the cost**
  of the discounted PT.

> "Maturity hits, yield stops, and the Principal Token redeems its full value — the fixed rate,
> realized."

**(1:25–1:35) Close.**
> "Seven Soroban contracts, invariant-tested, CI-green, live on Testnet. The missing fixed-income
> primitive for Stellar."

Flash the green **CI run** (GitHub Actions) and the test counts — **130 Rust / 77 Vitest**.

---

## 3. After recording

- **Restore the realistic rate** (step 1c) if you accelerated it.
- Leave the short demo maturity to expire — it's separate from the long-lived markets, so the live
  site keeps showing realistic figures.
- Link the finished video in the README's *Demo* section.
