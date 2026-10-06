#!/usr/bin/env bash
# Boot a throwaway solana-test-validator on this project's ports (4510-4560)
# with the built program preloaded, run the test suite, shut it down.
set -euo pipefail
cd "$(dirname "$0")/.."
PROGRAM_ID=$(node -e 'console.log(require("./client/xorv.json").address)')
rm -rf test-ledger
solana-test-validator --reset --quiet --ledger test-ledger \
  --rpc-port 4510 --faucet-port 4519 --gossip-port 4512 --dynamic-port-range 4520-4560 \
  --bpf-program "$PROGRAM_ID" target/deploy/xorv.so >/dev/null 2>&1 &
VPID=$!
trap 'kill $VPID 2>/dev/null; wait $VPID 2>/dev/null; rm -rf test-ledger' EXIT
for i in $(seq 1 60); do
  curl -s -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' http://127.0.0.1:4510 | grep -q ok && break
  sleep 1
done
RPC_URL=http://127.0.0.1:4510 npx tsx --test --test-concurrency=1 tests/xorv.test.ts
