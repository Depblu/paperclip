---
name: 产品工程
description: 内置工程团队，由 CTO 搭配一名高级工程师和一名 QA 工程师，用于交付、审查并验证产品变更。
schema: agentcompanies/v1
slug: product-engineering
category: software-development
key: paperclipai/bundled/software-development/product-engineering
manager: agents/cto/AGENTS.md
includes:
  - agents/senior-coder/AGENTS.md
  - agents/qa/AGENTS.md
  - projects/product-engineering/PROJECT.md
defaultInstall: false
recommendedForCompanyTypes:
  - software
  - startup
  - product
tags:
  - engineering
  - delivery
  - qa
  - code-review
requiredSkills:
  - paperclipai/bundled/software-development/github-pr-workflow
  - paperclipai/bundled/quality/qa-acceptance
  - paperclipai/bundled/paperclip-operations/task-planning
  - paperclipai/bundled/docs/doc-maintenance
---

# 产品工程

这是一个可选的即插即用工程小组，适合希望获得可工作的软件交付循环、但不想先安装 catalog 中 `core-exec-team` 的公司。将它安装到现有 CEO/manager 名下后，导入的 CTO 会负责工程执行。

## 内容

- `CTO` — 工程 manager 和团队根节点。审查 PR，负责代码质量标准，并将产品优先级拆成工程任务。
- `senior-coder` — 主要实现者。领取工程任务、提交 PR，并请求 QA 验证。
- `QA` — 验证修复并收集验收证据。
- `product-engineering` project — 此小组工作的滚动 backlog。
- `weekly-engineering-sync` routine — CTO 负责的周期性 check-in，用于暴露 blocker 并确认下一个交付物。

## Skill 依据

- `github-pr-workflow` 让小组内的逻辑 commit、分支卫生和合并纪律保持一致。
- `qa-acceptance` 为 QA 提供工程师可执行的结构化通过/失败格式。
- `task-planning` 让 CTO 将较大的请求转换为范围清晰的 child issue。
- `doc-maintenance` 保持文档与已发布变更一致；如果公司有任何面向用户的文档界面，应安装它。

## 迁移说明

此条目源自 `skills/paperclip-create-agent/references/agents/` 中的 `Coder` 和 `QA` 角色模板，以及 `server/src/onboarding-assets/` 下的历史 CTO persona。frontmatter 中刻意不放 adapter type 默认值（`claude_local` vs `codex_local`），这样导入预览可让 operator 为每个 agent 选择。SecurityEngineer 刻意延后到未来的 `optional/quality/security-review` 条目，因为多数安装不希望第一天就配专职安全 agent。
