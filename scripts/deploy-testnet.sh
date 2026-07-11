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
# Demo maturity: 30 minutes out. Re-run create_maturity before recording a demo.
MATURITY_OFFSET_SECS="${MATURITY_OFFSET_SECS:-1800}"

ADMIN=$(stellar keys address "$IDENTITY")
echo "Admin: $ADMIN"

echo "Building contracts..."
stellar contract build >/dev/null

WASM_DIR="target/wasm32v1-none/release"

echo "Deploying MockYieldToken..."
MYT=$(stellar contract deploy \
  --wasm "$WASM_DIR/stellas_mock_yield_token.wasm" \
  --source "$IDENTITY" --network "$NETWORK" --alias mock-yield-token)
stellar contract invoke --id "$MYT" --source "$IDENTITY" --network "$NETWORK" -- \
  initialize --admin "$ADMIN" --initial_rate "$INITIAL_RATE" --slope_per_sec "$SLOPE_PER_SEC"

echo "Deploying SYVault..."
SY=$(stellar contract deploy \
  --wasm "$WASM_DIR/stellas_sy_vault.wasm" \
  --source "$IDENTITY" --network "$NETWORK" --alias sy-vault)
stellar contract invoke --id "$SY" --source "$IDENTITY" --network "$NETWORK" -- \
  initialize --admin "$ADMIN" --yield_token "$MYT"

echo "Deploying Splitter..."
SPLITTER=$(stellar contract deploy \
  --wasm "$WASM_DIR/stellas_splitter.wasm" \
  --source "$IDENTITY" --network "$NETWORK" --alias splitter)
stellar contract invoke --id "$SPLITTER" --source "$IDENTITY" --network "$NETWORK" -- \
  initialize --admin "$ADMIN" --sy_vault "$SY"

MATURITY=$(( $(date +%s) + MATURITY_OFFSET_SECS ))
echo "Creating maturity at unix $MATURITY..."
stellar contract invoke --id "$SPLITTER" --source "$IDENTITY" --network "$NETWORK" -- \
  create_maturity --maturity "$MATURITY"

echo ""
echo "=== Deployed. Copy these into .env / .env.example / Vercel ==="
echo "VITE_MYT_CONTRACT_ID=$MYT"
echo "VITE_SY_VAULT_CONTRACT_ID=$SY"
echo "VITE_SPLITTER_CONTRACT_ID=$SPLITTER"
