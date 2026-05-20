#!/bin/zsh
set -euo pipefail

REPO_ROOT="/Users/chanikpark/Documents/aegis_atv_codex_mvp"
PLUGIN_ROOT="$REPO_ROOT/pkg/codex-plugin-aegis"
NODE_BIN="${AEGIS_NODE_BIN:-/opt/homebrew/bin/node}"

export OPENCLAW_WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}"
export AEGIS_DATA_DIR="${AEGIS_DATA_DIR:-$REPO_ROOT/data}"
export PORT="${PORT:-4187}"
export AEGIS_SIDECAR_URL="${AEGIS_SIDECAR_URL:-http://127.0.0.1:${PORT}}"
export AEGIS_AGENT_ID="${AEGIS_AGENT_ID:-aid:codex}"
export AEGIS_TENANT_ID="${AEGIS_TENANT_ID:-local-tenant}"
export AEGIS_CODEX_SURFACE="${AEGIS_CODEX_SURFACE:-codex-desktop}"
export AEGIS_HOOK_FAIL_OPEN="${AEGIS_HOOK_FAIL_OPEN:-1}"

cd "$REPO_ROOT"
exec "$NODE_BIN" --import tsx "$PLUGIN_ROOT/src/hook.ts"
