#!/bin/sh

#CODEXPRO_LOW_FRICTION_TOOLS=1 codexpro start --tool-cards off --tool-mode standard --bash-transcript compact


#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"
DEFAULT_MODE="agent"

show_usage() {
    cat <<EOF
用法：
  $SCRIPT_NAME [agent|handoff] [额外参数...]

模式：
  agent      普通代理模式，默认值
  handoff    规划交接模式，只生成 handoff 计划

示例：
  $SCRIPT_NAME
  $SCRIPT_NAME agent
  $SCRIPT_NAME handoff
  $SCRIPT_NAME handoff --no-bash
  $SCRIPT_NAME --root /path/to/project
  $SCRIPT_NAME handoff --root /path/to/project
EOF
}

MODE="$DEFAULT_MODE"

# 第一个参数是模式时，读取并移除该参数。
# 否则使用默认 agent 模式，并将所有参数透传给 codexpro。
if [[ $# -gt 0 ]]; then
    case "$1" in
        agent|handoff)
            MODE="$1"
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
    esac
fi

# 防止透传参数中再次指定 --mode。
for arg in "$@"; do
    if [[ "$arg" == "--mode" || "$arg" == --mode=* ]]; then
        echo "错误：请通过脚本的第一个参数选择 agent 或 handoff，" >&2
        echo "不要在额外参数中重复指定 --mode。" >&2
        exit 1
    fi
done

echo "正在以 ${MODE} 模式启动 CodexPro..."

export CODEXPRO_LOW_FRICTION_TOOLS=1
export TUNNEL_TRANSPORT_PROTOCOL=http2

exec codexpro start \
    --mode "$MODE" \
    --tool-cards off \
    --tool-mode standard \
    --bash-transcript compact \
    "$@"
