#!/bin/bash
set -euo pipefail

REPO_ROOT="/Users/chanikpark/Documents/aegis_atv_codex_mvp"
BASE_URL="${AEGIS_SIDECAR_URL:-http://127.0.0.1:4187}"

cd "$REPO_ROOT"

echo "== Hook: SessionStart =="
cat pkg/codex-plugin-aegis/examples/session-start.json | npm run --silent hook:codex

echo "== Hook: UserPromptSubmit =="
cat pkg/codex-plugin-aegis/examples/user-prompt-submit.json | npm run --silent hook:codex

echo "== Hook: PreToolUse =="
cat pkg/codex-plugin-aegis/examples/pre-tool-use.json | npm run --silent hook:codex

if curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
  echo "== API: Evidence verify (session) =="
  curl -fsS -X POST "$BASE_URL/v1/evidence/verify" \
    -H 'content-type: application/json' \
    -d '{"session_id":"sess-demo-1"}'
  echo
else
  echo "== API: Evidence verify (session) =="
  echo "sidecar unavailable at $BASE_URL, skipping evidence verification step"
fi
