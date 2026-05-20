#!/bin/zsh
set -euo pipefail

TARGET_DIR="/etc/codex"
TARGET_FILE="$TARGET_DIR/managed_config.toml"
BACKUP_SUFFIX="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$TARGET_DIR"

if [ -f "$TARGET_FILE" ]; then
  cp "$TARGET_FILE" "$TARGET_FILE.bak-$BACKUP_SUFFIX"
fi

cp /Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/managed-config.toml "$TARGET_FILE"

echo "Installed $TARGET_FILE"
