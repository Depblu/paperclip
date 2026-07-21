codexpro watch-handoff \
  --agent custom \
  --model bailian-token-plan-personal/qwen3.8-max-preview \
  --command 'opencode run --model {{model}} --variant xhigh "阅读附带的实施计划，检查当前代码仓库，并完整落实计划中的所有内容。" --file {{plan_file}} ' \
  --timeout-ms 14400000 \
  --yes
