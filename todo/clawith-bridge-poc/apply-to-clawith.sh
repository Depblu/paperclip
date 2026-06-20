#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-${ROOT}/../Clawith}"

if [ ! -d "$TARGET/backend/app" ]; then
  echo "Clawith backend/app not found: $TARGET/backend/app" >&2
  exit 1
fi

if [ ! -w "$TARGET/backend/app" ]; then
  echo "Target is not writable: $TARGET/backend/app" >&2
  exit 1
fi

install -D "$ROOT/backend/app/api/bridge.py" "$TARGET/backend/app/api/bridge.py"
install -D "$ROOT/backend/app/models/bridge_mapping.py" "$TARGET/backend/app/models/bridge_mapping.py"
install -D "$ROOT/backend/app/schemas/bridge.py" "$TARGET/backend/app/schemas/bridge.py"
install -D "$ROOT/backend/app/services/bridge_auth_service.py" "$TARGET/backend/app/services/bridge_auth_service.py"
install -D "$ROOT/backend/app/services/bridge_mapping_service.py" "$TARGET/backend/app/services/bridge_mapping_service.py"
install -D "$ROOT/backend/app/services/bridge_runtime_service.py" "$TARGET/backend/app/services/bridge_runtime_service.py"

cat <<MSG
Copied Bridge PoC files into: $TARGET/backend/app

Manual follow-up required:
1. Ensure config fields from $ROOT/config-snippet.txt exist in $TARGET/backend/app/config.py
2. Ensure router/model imports from $ROOT/main-snippet.txt exist in $TARGET/backend/app/main.py
3. Ensure the bridge_mappings Alembic migration exists in $TARGET/backend/alembic/versions/
4. Configure BRIDGE_* env vars outside git; do not commit secrets.
MSG
