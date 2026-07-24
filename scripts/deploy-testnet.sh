#!/usr/bin/env bash
#
# Deploy the stellas contract stack to Stellar Testnet.
#
# Prerequisites:
#   - stellar CLI 27.x (https://developers.stellar.org/docs/tools/cli)
#   - a funded testnet identity; pass its name as $IDENTITY (default: vault-admin)
#       stellar keys generate vault-admin --network testnet --fund
#
# Usage:
#   ./scripts/deploy-testnet.sh [--with-blend]
#
# Without flags this deploys the mUSDY market (mock yield source). With
# --with-blend it additionally deploys a *second, independent market* over a
# real Blend lending position: sy-vault-blend + its own Splitter and PT-AMM.
# The two markets share nothing but the PT/YT wasm; the mock stack is never
# degraded by the Blend one (Phase 6).
#
# On success it prints the VITE_ contract IDs — paste them into .env,
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

# --- Blend market (only used with --with-blend) ---
# Live testnet addresses; see docs/plan/blend-notes.md. A testnet reset moves
# these — re-read blend-utils/testnet.contracts.json and override here.
#   BLEND_POOL  : Blend v2 "TestnetV2" lending pool
#   BLEND_ASSET : the reserve to supply into. XLM (native SAC) by default —
#                 unlike the pool's USDC it is friendbot-fundable, so anyone
#                 can use the market without a mint service.
WITH_BLEND=0
for arg in "$@"; do
  case "$arg" in
    --with-blend) WITH_BLEND=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done
BLEND_POOL="${BLEND_POOL:-CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF}"
BLEND_ASSET="${BLEND_ASSET:-CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC}"
BLEND_SYMBOL="${BLEND_SYMBOL:-bXLM}"

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
  --pt_wasm_hash "$PT_HASH" --yt_wasm_hash "$YT_HASH" --underlying_symbol mUSDY)

echo "Deploying PT-AMM..."
AMM=$(stellar contract deploy \
  --wasm "$WASM_DIR/stellas_pt_amm.wasm" \
  --source "$IDENTITY" --network "$NETWORK" --alias pt-amm \
  -- --admin "$ADMIN" --market "$SPLITTER" --sy_token "$SY")

# Open the same set of maturities on every market, so the UI's market switch
# compares like with like.
create_maturities() {
  local splitter="$1" amm="$2" now
  now=$(date +%s)
  for offset in $MATURITY_OFFSETS; do
    local maturity=$(( now + offset ))
    echo "Creating maturity at unix $maturity (+${offset}s) + its PT/SY pool..."
    stellar contract invoke --id "$splitter" --source "$IDENTITY" --network "$NETWORK" -- \
      create_maturity --maturity "$maturity"
    stellar contract invoke --id "$amm" --source "$IDENTITY" --network "$NETWORK" -- \
      create_pool --maturity "$maturity"
  done
}

create_maturities "$SPLITTER" "$AMM"

if [ "$WITH_BLEND" = "1" ]; then
  echo ""
  echo "=== Blend market ==="
  echo "Pool:  $BLEND_POOL"
  echo "Asset: $BLEND_ASSET ($BLEND_SYMBOL)"

  echo "Deploying SYVaultBlend..."
  BLEND_SY=$(stellar contract deploy \
    --wasm "$WASM_DIR/stellas_sy_vault_blend.wasm" \
    --source "$IDENTITY" --network "$NETWORK" --alias sy-vault-blend \
    -- --admin "$ADMIN" --pool "$BLEND_POOL" --asset "$BLEND_ASSET" \
    --name "Standardized Yield Blend $BLEND_SYMBOL" --symbol "SY-$BLEND_SYMBOL")

  echo "Deploying the Blend Market (same PT/YT wasm)..."
  BLEND_SPLITTER=$(stellar contract deploy \
    --wasm "$WASM_DIR/stellas_splitter.wasm" \
    --source "$IDENTITY" --network "$NETWORK" --alias splitter-blend \
    -- --admin "$ADMIN" --sy_vault "$BLEND_SY" \
    --pt_wasm_hash "$PT_HASH" --yt_wasm_hash "$YT_HASH" \
    --underlying_symbol "$BLEND_SYMBOL")

  echo "Deploying the Blend PT-AMM..."
  BLEND_AMM=$(stellar contract deploy \
    --wasm "$WASM_DIR/stellas_pt_amm.wasm" \
    --source "$IDENTITY" --network "$NETWORK" --alias pt-amm-blend \
    -- --admin "$ADMIN" --market "$BLEND_SPLITTER" --sy_token "$BLEND_SY")

  create_maturities "$BLEND_SPLITTER" "$BLEND_AMM"
fi

echo ""
echo "Pools are empty — seed them with ./scripts/seed-liquidity.sh <maturity>."
echo "  (Blend market: SOURCE=blend SY_ID=sy-vault-blend SPLITTER_ID=splitter-blend \\"
echo "                 AMM_ID=pt-amm-blend ./scripts/seed-liquidity.sh <maturity>)"
echo ""
echo "=== Deployed. Copy these into .env / .env.example / Vercel ==="
echo "VITE_MYT_CONTRACT_ID=$MYT"
echo "VITE_SY_VAULT_CONTRACT_ID=$SY"
echo "VITE_SPLITTER_CONTRACT_ID=$SPLITTER"
echo "VITE_AMM_CONTRACT_ID=$AMM"
if [ "$WITH_BLEND" = "1" ]; then
  echo "VITE_BLEND_SY_VAULT_CONTRACT_ID=$BLEND_SY"
  echo "VITE_BLEND_SPLITTER_CONTRACT_ID=$BLEND_SPLITTER"
  echo "VITE_BLEND_AMM_CONTRACT_ID=$BLEND_AMM"
  echo "VITE_BLEND_ASSET_ID=$BLEND_ASSET"
  echo "VITE_BLEND_ASSET_SYMBOL=$BLEND_SYMBOL"
fi
