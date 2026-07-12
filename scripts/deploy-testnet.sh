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

# Demo rate: 1.0 start, +0.0002/s (~+1.2%/min) so yield visibly ticks.
INITIAL_RATE="${INITIAL_RATE:-1000000000000}"
SLOPE_PER_SEC="${SLOPE_PER_SEC:-200000000}"
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

echo "Deploying Splitter..."
SPLITTER=$(stellar contract deploy \
  --wasm "$WASM_DIR/stellas_splitter.wasm" \
  --source "$IDENTITY" --network "$NETWORK" --alias splitter \
  -- --admin "$ADMIN" --sy_vault "$SY")

NOW=$(date +%s)
for offset in $MATURITY_OFFSETS; do
  MATURITY=$(( NOW + offset ))
  echo "Creating maturity at unix $MATURITY (+${offset}s)..."
  stellar contract invoke --id "$SPLITTER" --source "$IDENTITY" --network "$NETWORK" -- \
    create_maturity --maturity "$MATURITY"
done

echo ""
echo "=== Deployed. Copy these into .env / .env.example / Vercel ==="
echo "VITE_MYT_CONTRACT_ID=$MYT"
echo "VITE_SY_VAULT_CONTRACT_ID=$SY"
echo "VITE_SPLITTER_CONTRACT_ID=$SPLITTER"
