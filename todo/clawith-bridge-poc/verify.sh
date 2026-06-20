#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

python "$ROOT/smoke_contract.py"
python "$ROOT/source_contract.py"
python "$ROOT/requirements_coverage.py"
python -m py_compile $(find "$ROOT" -name '*.py' -type f)
find "$ROOT" -type d -name __pycache__ -prune -exec rm -rf {} +

echo "clawith bridge poc verify ok"
