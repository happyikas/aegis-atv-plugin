#!/bin/zsh
set -euo pipefail

REPO_ROOT="/Users/chanikpark/Documents/aegis_atv_codex_mvp"
NODE_BIN="${AEGIS_NODE_BIN:-/opt/homebrew/bin/node}"

export OPENCLAW_WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}"
export AEGIS_DATA_DIR="${AEGIS_DATA_DIR:-$REPO_ROOT/data}"
export PORT="${PORT:-4187}"

cd "$REPO_ROOT"
exec "$NODE_BIN" --import tsx scripts/mcp-stdio-shim.ts
