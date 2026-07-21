#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT"

echo "[start-local] 执行配置校验..."
node scripts/validate-local-config.mjs

echo "[start-local] 加载 .env.local 并启动..."

MODE="${1:-dev}"

if [ "$MODE" = "dev" ]; then
  exec node --env-file=.env.local node_modules/.bin/tsx src/main.ts
elif [ "$MODE" = "prod" ]; then
  if [ ! -f dist/main.js ]; then
    echo "[start-local] dist/main.js 不存在，请先运行 npm run build" >&2
    exit 1
  fi
  exec node --env-file=.env.local dist/main.js
else
  echo "[start-local] 未知模式: $MODE (可选: dev | prod)" >&2
  exit 1
fi
