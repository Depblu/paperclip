---
name: 产品设计
description: 内置产品设计团队，包含一名首席产品设计师，负责产品公司的 wireframe、设计评审和 UX 质量审查。
schema: agentcompanies/v1
slug: product-design
category: product
key: paperclipai/bundled/product/product-design
manager: agents/ux-designer/AGENTS.md
includes:
  - projects/product-design/PROJECT.md
defaultInstall: false
recommendedForCompanyTypes:
  - software
  - product
  - design
tags:
  - design
  - ux
  - product
requiredSkills:
  - paperclipai/bundled/product/wireframe
  - paperclipai/optional/product/design-critique
  - paperclipai/bundled/paperclip-operations/task-planning
---

# 产品设计

围绕一名首席产品设计师构建的最小设计团队。与现有工程团队一起安装后，可补充 wireframe、设计评审和 UX 质量审查能力。

## 内容

- `UXDesigner` — 首席产品设计师和团队根节点。产出 wireframe，执行设计评审，审查 UX 可见 PR。
- `product-design` project — 设计规格、评审和系统更新的滚动 backlog。
- `weekly-design-review` routine — 由设计师负责的周期性 check-in，用于分流开放设计工作并尽早发现 UX 回归。

## Skill 依据

- `wireframe`（内置）— 为新流程创建结构化低保真 wireframe。
- `design-critique`（可选 skill catalog）— 结构化视觉/UX 评审格式。团队安装时作为先决条件从 skill catalog 安装。
- `task-planning` — 将较大的设计请求拆成可审查 child issue。

## 迁移说明

源自 `skills/paperclip-create-agent/references/agents/uxdesigner.md` 中的 `UXDesigner` 模板。完整视觉质量与设计视角文档保留在模板 `AGENTS.md` 正文中，而不是拆成 `references/` 文件，这样 catalog manifest 可保持 `markdown_only` 信任级别。frontmatter 中刻意省略 adapter type；导入预览会让 operator 在安装时选择 `claude_local`、`codex_local` 或其他 adapter。
