#!/usr/bin/env bash
# A persistent local validator for app development (port 4510, ws 4511),
# with the program preloaded and initialised. Ctrl-C to stop.
set -euo pipefail
cd "$(dirname "$0")/.."
solana-test-validator --quiet --ledger .dev-ledger \
  --rpc-port 4510 --faucet-port 4519 --gossip-port 4512 --dynamic-port-range 4520-4560 \
  --bpf-program GbtmzdtzLjPd1fZRmvVy7rnZzSMrUs6UfDJpZShEwXkw target/deploy/xorv.so &
VPID=$!
trap 'kill $VPID' EXIT
until curl -s -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' http://127.0.0.1:4510 | grep -q ok; do sleep 1; done
solana airdrop 100 -u http://127.0.0.1:4510 -k ../.keys/devnet-deployer.json "$(solana-keygen pubkey ../.keys/devnet-deployer.json)" >/dev/null
RPC_URL=http://127.0.0.1:4510 CLUSTER=localnet JOB_TIMEOUT=${JOB_TIMEOUT:-600} npx tsx scripts/init.ts
wait $VPID
