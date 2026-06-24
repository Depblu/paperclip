---
name: task-planning
description: 将 Paperclip issue 或请求转成结构化实施计划，包含 child task 图、blocker、owner 和 acceptance criteria，并保存为 issue 的 `plan` document。
key: paperclipai/bundled/paperclip-operations/task-planning
recommendedForRoles:
  - manager
  - engineer
  - product
tags:
  - paperclip
  - planning
  - issues
  - delegation
---

# 任务规划

产出 Paperclip executor 能真正执行的实施计划：明确 child issues、真实 blockers、具名 owners、清晰 acceptance bar。避免写成看起来漂亮但无法拆分执行的计划。

## 何时使用

- issue 要求你 “plan”、“scope”、“break down”、“design the rollout”、“propose the work” 或类似内容。
- 用户希望先看到书面计划，再批准实施。
- manager 需要委派非平凡工作，而工作形状还不明显。
- 你接手的 issue 太大，无法在一次 heartbeat 内完成，需要拆分。

## 何时不要使用

- issue 是一次 heartbeat 内能交付的小改动。直接交付。
- issue 是取证类问题（“为什么坏了”）。先用 diagnosis skill；只有 root cause 明确后才规划。
- 当前已有 `plan` document，且变化很小。更新该 document，不要重写。

## 输出

1. 更新 issue document，key 为 `plan`，格式为 markdown。
2. 在 issue 上发一条短 comment，链接 plan document，并说明下一步。
3. 如果计划需要 approval，创建 kind 为 `request_confirmation` 的 issue-thread interaction，绑定到最新 plan revision。

计划被接受前，不要创建实施 subtask。

## 计划结构

按以下顺序包含必需章节：

1. **目标**：一段话。说明这项工作落地后，用户、operator 或系统会发生什么变化。
2. **已审阅上下文**：bullet list，列出你读过的文档、文件和历史 issue。帮助 reviewer 发现缺失输入。
3. **约束与非目标**：必须保持什么（兼容性、安全、性能），以及本计划明确不做什么。
4. **方案**：选定路径和简短理由。若考虑过替代方案，说明它们以及为什么放弃。
5. **工作拆分**：按顺序列出 child issues。每个 child 包含：
   - 祈使句 title。
   - Owner specialty（Engineer、QA、Designer、Security、DevRel、Manager 等）。
   - Scope 和 deliverables。
   - Acceptance criteria。
   - 用 phase letter 或 child title 表达 blocks / blocked-by 关系。
6. **验收**：parent issue 的完成标准。用户如何知道整体已经完成。
7. **风险与缓解**：短列表。没有则跳过。
8. **延后项**：有意推迟到 follow-up issue 的内容，以及原因。

## 拆分经验法则

- 一个 child issue 对应一个 specialty。若两个 specialty 需要在同一 issue 内协调，就拆开。
- 一个 child issue 对应一个 acceptance verdict。若 reviewer 会说“这只完成了一半”，就拆开。
- child 必须能仅凭 title 和 description 被 owner checkout。reviewer 不应需要重读 parent plan 才理解 child。
- 按真实 blocker chain 排序，不按作者偏好排序。可并行 child 明确写 `blockers: none`。
- 避免没有 acceptance criteria 的 `polish` 或 `cleanup` child issues；它们很难关闭。

## 写入计划

用 Paperclip API 写入 plan document，然后评论：

- `PUT /api/issues/{issueId}/documents/plan`，body 为 markdown。若 `plan` 已存在，包含最新 `baseRevisionId`。
- `POST /api/issues/{issueId}/comments`，用短 summary 链接计划：`/<prefix>/issues/<issue-id>#document-plan`。
- 若需要 approval：`POST /api/issues/{issueId}/interactions`，`kind: request_confirmation`，`targetRevisionId` 设为新 plan revision，`continuationPolicy: wake_assignee`，`idempotencyKey: "confirmation:{issueId}:plan:{revisionId}"`。
- 创建 confirmation 后将 issue 设为 `in_review`。保持 assigned 状态，这样 acceptance 会唤醒 planner。

计划被接受后，使用 companion skill 将已接受计划转换成 Paperclip 可执行任务。

## 反模式

- 把 plan 伪装成 description edit。使用 `plan` document。
- “Phases A-Z” 但 phase 内没有工作拆分。
- child description 写“see parent”；这会在委派时失败。
- acceptance 写成“code review approval”。reviewer 需要行为标准，不是流程标准。
- blocker chain 埋在 prose 里。使用明确 blocked-by 行。
