---
name: 内容机器
description: 可选内容运营团队，包含负责人 agent、周期性复盘任务，以及随包提供的本地内容规划 skill。
schema: agentcompanies/v1
slug: content-machine
category: content
key: paperclipai/optional/content/content-machine
manager: agents/content-lead/AGENTS.md
includes:
  - skills/content-calendar/SKILL.md
  - projects/content-operations/PROJECT.md
defaultInstall: false
recommendedForCompanyTypes:
  - agency
  - marketing
tags:
  - content
  - marketing
  - routines
---

# 内容机器

这个可选 fixture 用于验证本地 skill 解析和周期性任务清单，不引入外部来源风险。

## 内容

- `ContentLead` — 内容运营负责人，负责日历规划和发布工作流分流。
- `content-operations` project — 编辑规划和内容生产复盘的滚动 backlog。
- `weekly-content-review` routine — 内容负责人周期性 check-in，用于选择下一批文章并暴露被阻塞的发布工作。
