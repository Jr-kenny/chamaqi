#!/usr/bin/env bash
# ChamaQi one-command launcher.
#   ./run.sh            -> fresh fixture, app on http://localhost:4173
#   ./run.sh --model    -> boots and also warm-loads the QVAC LLM (first run
#                          downloads ~750MB once, cached at ~/.qvac)
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "[chamaqi] installing dependencies (one time)…"
  npm install --no-audit --no-fund
fi

echo "[chamaqi] resetting demo chama to the pristine fixture…"
node server.js --demo-seed &        # boots AND seeds
SERVER_PID=$!
sleep 1

if [[ "${1:-}" == "--model" ]]; then
  echo "[chamaqi] warming the local QVAC LLM (first run downloads the model once)…"
  curl -s -X POST http://localhost:4173/api/model -m 3600 |
    node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const r=JSON.parse(d);console.log(r.ok?"[chamaqi] local LLM ready ✓":"[chamaqi] LLM not available — deterministic engine still covers the demo: "+(r.reason||""))}catch{console.log("[chamaqi] (LLM warm-up check timed out; engine fallback active)")}})'
fi

echo
echo "  ┌─────────────────────────────────────────────────┐"
echo "  │  ChamaQi is running:  http://localhost:4173      │"
echo "  │  Kill with: Ctrl-C then 'kill ${SERVER_PID}'     │"
echo "  └─────────────────────────────────────────────────┘"
wait $SERVER_PID
