#!/usr/bin/env bash
# One command: deploy the built program to DEVNET and initialise it.
# Needs ~3.2 SOL on .keys/devnet-deployer.json (program rent ~2.95 SOL).
set -euo pipefail
cd "$(dirname "$0")/../.."          # repo root: solana-cli dislikes the space in the absolute path
URL=https://api.devnet.solana.com
solana program deploy -u "$URL" -k .keys/devnet-deployer.json \
  --program-id .keys/xorv-program.json solana/target/deploy/xorv.so \
  --with-compute-unit-price 10000 --max-sign-attempts 50
cd solana
RPC_URL=$URL CLUSTER=devnet npx tsx scripts/init.ts
