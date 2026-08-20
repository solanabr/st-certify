#!/usr/bin/env bash
# M1b deploy — build the Certify Pinocchio program and deploy/upgrade it on devnet.
# Idempotent: `solana program deploy --program-id <keypair>` upgrades in place when the
# program already exists (deployer is the upgrade authority). The program keypair's pubkey
# IS the program id hardcoded in the program + the client, so we MUST deploy with it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOYER_KEYPAIR=".keys/deployer.json"
PROGRAM_KEYPAIR="programs/certify/certify-keypair.json"
RPC="${NEXT_PUBLIC_RPC_URL:-https://api.devnet.solana.com}"
SO="target/deploy/certify.so"

# Cluster guard: refuse an accidental mainnet deploy (CLAUDE.md "Security
# Principles" — never deploy to mainnet without explicit confirmation).
# Devnet/testnet/unrecognized URLs proceed as before; mainnet requires
# `--yes` or CONFIRM_MAINNET=1.
CLUSTER="unknown ($RPC)"
case "$RPC" in
  *mainnet*) CLUSTER="mainnet" ;;
  *devnet*) CLUSTER="devnet" ;;
  *testnet*) CLUSTER="testnet" ;;
esac
echo "== Cluster: $CLUSTER (NEXT_PUBLIC_RPC_URL=$RPC) =="
if [ "$CLUSTER" = "mainnet" ]; then
  if [ "${1:-}" != "--yes" ] && [ "${CONFIRM_MAINNET:-}" != "1" ]; then
    echo "ERROR: NEXT_PUBLIC_RPC_URL points at mainnet. Refusing to deploy without explicit confirmation." >&2
    echo "       Re-run as: scripts/deploy.sh --yes   (or set CONFIRM_MAINNET=1)" >&2
    exit 1
  fi
  echo "   mainnet deploy CONFIRMED"
fi

echo "== [1/3] Build (cargo build-sbf) =="
# Scope to the program crate — a workspace-wide build-sbf would try to SBF-compile
# the certify-tests crate (litesvm/agave deps pull getrandom, unsupported on SBF).
cargo build-sbf --manifest-path programs/certify/Cargo.toml

[ -f "$SO" ] || { echo "ERROR: $SO not found after build" >&2; exit 1; }

SIZE=$(wc -c < "$SO" | tr -d ' ')
PROGRAM_ID=$(solana address -k "$PROGRAM_KEYPAIR")
DEPLOYER=$(solana address -k "$DEPLOYER_KEYPAIR")

echo "== [2/3] Artifact =="
echo "   $SO — $SIZE bytes"
echo "   program id : $PROGRAM_ID"
echo "   fee payer  : $DEPLOYER"
echo -n "   rent (.so-size estimate): "
solana rent "$SIZE" 2>/dev/null | awk -F': ' '/minimum/ {print $2}' || echo "n/a"

echo "== [3/3] Deploy to devnet =="
solana program deploy "$SO" \
  --program-id "$PROGRAM_KEYPAIR" \
  --keypair "$DEPLOYER_KEYPAIR" \
  --url "$RPC" \
  --commitment confirmed

echo "== Deployed =="
echo "   program id: $PROGRAM_ID"
echo "   explorer  : https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
