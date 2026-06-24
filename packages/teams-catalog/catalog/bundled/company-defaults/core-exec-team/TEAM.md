---
name: 核心执行团队
description: 用于启动 Paperclip 公司的默认领导与工程团队，包含 CEO、CTO、QA 工程师、起始项目，以及周期性 CEO heartbeat 复盘任务。
schema: agentcompanies/v1
slug: core-exec-team
category: company-defaults
key: paperclipai/bundled/company-defaults/core-exec-team
manager: agents/ceo/AGENTS.md
includes:
  - agents/cto/AGENTS.md
  - agents/qa/AGENTS.md
  - projects/first-project/PROJECT.md
defaultInstall: true
recommendedForCompanyTypes:
  - startup
  - software
  - generalist
tags:
  - default
  - executive
  - engineering
  - qa
requiredSkills:
  - paperclipai/bundled/paperclip-operations/task-planning
  - paperclipai/bundled/paperclip-operations/issue-triage
  - paperclipai/bundled/software-development/github-pr-workflow
  - paperclipai/bundled/quality/qa-acceptance
---

# 核心执行团队

核心执行团队是新 Paperclip 公司的内置默认安装项。它启动一个最小组织：能接收 board 提示，制定计划，完成实现，并验证结果。

## 内容

- `CEO` — 负责战略、优先级和委派。使用 `task-planning` 与 `issue-triage` 推动 inbox 流转。
- `CTO` — 负责技术执行和工程监督。向 CEO 汇报。使用 `github-pr-workflow` 保持代码审查和合并纪律。
- `QA` — 验证修复并收集证据。向 CTO 汇报。使用 `qa-acceptance` 输出结构化验收报告。
- `first-project` — CTO 名下的起始项目，用于把公司目标转换成第一个实现任务。
- `first-heartbeat` — 周期性 CEO heartbeat，用于复盘优先级并确认下一个有用任务。

## 迁移说明

此条目对应历史上的 `server/src/onboarding-assets/ceo/` 模板族，但保留在 catalog package 边界内。每个 agent 的 persona 文件（旧版 `SOUL.md`、`HEARTBEAT.md`、`TOOLS.md` 等同级文件）刻意合并为单个 `AGENTS.md`，以保持导入器和可移植语义简单。等 onboarding 实际切换到 catalog service 后，更完整的 persona 内容可在后续迁移到 `references/` 文件。
