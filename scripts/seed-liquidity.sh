#!/usr/bin/env bash
#
# Seed a maturity's PT/SY pool so it quotes a sane implied fixed rate.
#
# Price derivation: 1 PT redeems SY worth 1 asset unit at maturity T. For a
# target fixed APY y and time-to-maturity dt, the fair PT cost in asset units
# is cost = (1+y)^(-dt/YEAR); in SY units that's p = cost * SCALE / R (R =
# current exchange rate, SCALE = 1e12). Seeding sy_reserve/pt_reserve = p
# makes the pool's implied APY = (1/(p*R/SCALE))^(YEAR/dt) - 1 = y.
#
# The admin mints PT by splitting (which also leaves the admin holding the
# matching YT), then deposits PT + SY at the target ratio.
#
# Usage:
#   ./scripts/seed-liquidity.sh <maturity-unix> [target-apy] [pt-amount-stroops]
# Defaults: target-apy 0.05, pt-amount 2000000000 (200 PT).
# Contract IDs default to the stellar CLI aliases the deploy script created;
# override with MYT_ID / SY_ID / SPLITTER_ID / AMM_ID env vars.

set -euo pipefail

MATURITY="${1:?usage: seed-liquidity.sh <maturity-unix> [target-apy] [pt-amount-stroops]}"
TARGET_APY="${2:-0.05}"
PT_AMOUNT="${3:-2000000000}"

IDENTITY="${IDENTITY:-vault-admin}"
NETWORK="${NETWORK:-testnet}"
MYT="${MYT_ID:-mock-yield-token}"
SY="${SY_ID:-sy-vault}"
SPLITTER="${SPLITTER_ID:-splitter}"
AMM="${AMM_ID:-pt-amm}"

ADMIN=$(stellar keys address "$IDENTITY")

invoke() {
  stellar contract invoke --id "$1" --source "$IDENTITY" --network "$NETWORK" -- "${@:2}"
}

R=$(invoke "$MYT" exchange_rate 2>/dev/null | tail -1 | tr -d '"')
NOW=$(date +%s)
DT=$(( MATURITY - NOW ))
if [ "$DT" -le 0 ]; then
  echo "Maturity $MATURITY is in the past." >&2
  exit 1
fi

COST=$(awk -v dt="$DT" -v y="$TARGET_APY" \
  'BEGIN{printf "%.12f", exp(-(dt/31536000.0)*log(1.0+y))}')
# SY to split into PT_AMOUNT PT (rate R, +0.1% headroom for the floor) and the
# SY pool leg at the target price. awk doubles are fine here: the error is
# well under a whole token and the pool ratio is what matters.
SY_SPLIT=$(awk -v pt="$PT_AMOUNT" -v r="$R" 'BEGIN{printf "%.0f", pt*1.001*1000000000000/r}')
SY_POOL=$(awk -v pt="$PT_AMOUNT" -v c="$COST" -v r="$R" 'BEGIN{printf "%.0f", pt*c*1000000000000/r}')
TOTAL=$(( SY_SPLIT + SY_POOL ))

echo "rate=$R  dt=${DT}s  target_apy=$TARGET_APY  pt_cost=$COST"
echo "sy_to_split=$SY_SPLIT  sy_pool_leg=$SY_POOL"

echo "Funding + wrapping ${TOTAL} stroops of mUSDY..."
invoke "$MYT" faucet --to "$ADMIN" --amount "$TOTAL" >/dev/null 2>&1
invoke "$SY" wrap --from "$ADMIN" --amount "$TOTAL" >/dev/null 2>&1

echo "Splitting for PT..."
PT_OUT=$(invoke "$SPLITTER" split --from "$ADMIN" --maturity "$MATURITY" \
  --sy_amount "$SY_SPLIT" 2>/dev/null | tail -1 | tr -d '"')
echo "PT minted: $PT_OUT (matching YT stays with the admin)"

echo "Adding liquidity..."
LP=$(invoke "$AMM" add_liquidity --from "$ADMIN" --maturity "$MATURITY" \
  --pt_desired "$PT_OUT" --sy_desired "$SY_POOL" --pt_min 0 --sy_min 0 \
  2>/dev/null | tail -1 | tr -d '"')
echo "LP shares minted: $LP"

echo "Pool state:"
invoke "$AMM" get_pool --maturity "$MATURITY" 2>/dev/null | tail -1
