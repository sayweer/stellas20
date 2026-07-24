#!/usr/bin/env bash
#
# Deploy the stellas-core v0 three-contract stack to Stellar Testnet.
#
# Prerequisites:
#   - stellar CLI 27.x (https://developers.stellar.org/docs/tools/cli)
#   - a funded testnet identity; pass its name as $IDENTITY (default: vault-admin)
#       stellar keys generate vault-admin --network testnet --fund
#
# Usage:
#   ./scripts/deploy-testnet.sh
#
# On success it prints the three VITE_ contract IDs — paste them into .env,
# .env.example, and your Vercel project's environment variables.

set -euo pipefail

IDENTITY="${IDENTITY:-vault-admin}"
NETWORK="${NETWORK:-testnet}"

# Realistic rate: 1.0 start, ~5% APY. Derivation (RATE_SCALE = 1e12):
#   slope = 0.05 * 1e12 / 31_536_000 s/yr = 1585.5 -> 1585 per second.
INITIAL_RATE="${INITIAL_RATE:-1000000000000}"
SLOPE_PER_SEC="${SLOPE_PER_SEC:-1585}"
# Demo-recording runbook: right before recording, temporarily steepen the rate
# so yield visibly ticks on screen, then restore the realistic slope after:
#   stellar contract invoke --id <MYT> --source "$IDENTITY" --network "$NETWORK" -- \
#     set_rate --slope_per_sec "${DEMO_SLOPE:-200000000}"   # ~+1.2%/min
#   stellar contract invoke --id <MYT> --source "$IDENTITY" --network "$NETWORK" -- \
#     set_rate --slope_per_sec 1585                          # back to ~5% APY
# Rate continuity across set_rate is preserved by the checkpoint mechanism.
# Maturities to create, as offsets (seconds) from now. Defaults: +1h, +1d, +7d
# so at least one long-lived maturity survives a demo. For a video, also add a
# short one on the fly, e.g. create_maturity --maturity $(( $(date +%s) + 480 )).
MATURITY_OFFSETS="${MATURITY_OFFSETS:-3600 86400 604800}"

ADMIN=$(stellar keys address "$IDENTITY")
echo "Admin: $ADMIN"

echo "Building contracts..."
stellar contract build >/dev/null

WASM_DIR="target/wasm32v1-none/release"

# Each contract is initialized atomically via its constructor (args after `--`),
# so admin/config can never be front-run by a separate initialize call.
echo "Deploying MockYieldToken..."
MYT=$(stellar contract deploy \
  --wasm "$WASM_DIR/stellas_mock_yield_token.wasm" \
  --source "$IDENTITY" --network "$NETWORK" --alias mock-yield-token \
  -- --admin "$ADMIN" --initial_rate "$INITIAL_RATE" --slope_per_sec "$SLOPE_PER_SEC")

echo "Deploying SYVault..."
SY=$(stellar contract deploy \
  --wasm "$WASM_DIR/stellas_sy_vault.wasm" \
  --source "$IDENTITY" --network "$NETWORK" --alias sy-vault \
  -- --admin "$ADMIN" --yield_token "$MYT")

echo "Uploading PT/YT token wasm (factory templates)..."
PT_HASH=$(stellar contract upload \
  --wasm "$WASM_DIR/stellas_pt_token.wasm" \
  --source "$IDENTITY" --network "$NETWORK")
YT_HASH=$(stellar contract upload \
  --wasm "$WASM_DIR/stellas_yt_token.wasm" \
  --source "$IDENTITY" --network "$NETWORK")
echo "PT wasm hash: $PT_HASH"
echo "YT wasm hash: $YT_HASH"

echo "Deploying Splitter (the Market)..."
SPLITTER=$(stellar contract deploy \
  --wasm "$WASM_DIR/stellas_splitter.wasm" \
  --source "$IDENTITY" --network "$NETWORK" --alias splitter \
  -- --admin "$ADMIN" --sy_vault "$SY" \
  --pt_wasm_hash "$PT_HASH" --yt_wasm_hash "$YT_HASH")

echo "Deploying PT-AMM..."
AMM=$(stellar contract deploy \
  --wasm "$WASM_DIR/stellas_pt_amm.wasm" \
  --source "$IDENTITY" --network "$NETWORK" --alias pt-amm \
  -- --admin "$ADMIN" --market "$SPLITTER" --sy_token "$SY")

NOW=$(date +%s)
for offset in $MATURITY_OFFSETS; do
  MATURITY=$(( NOW + offset ))
  echo "Creating maturity at unix $MATURITY (+${offset}s) + its PT/SY pool..."
  stellar contract invoke --id "$SPLITTER" --source "$IDENTITY" --network "$NETWORK" -- \
    create_maturity --maturity "$MATURITY"
  stellar contract invoke --id "$AMM" --source "$IDENTITY" --network "$NETWORK" -- \
    create_pool --maturity "$MATURITY"
done

echo ""
echo "Pools are empty — seed them with ./scripts/seed-liquidity.sh <maturity>."
echo ""
echo "=== Deployed. Copy these into .env / .env.example / Vercel ==="
echo "VITE_MYT_CONTRACT_ID=$MYT"
echo "VITE_SY_VAULT_CONTRACT_ID=$SY"
echo "VITE_SPLITTER_CONTRACT_ID=$SPLITTER"
echo "VITE_AMM_CONTRACT_ID=$AMM"
