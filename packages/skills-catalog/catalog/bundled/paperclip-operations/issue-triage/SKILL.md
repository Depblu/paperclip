---
name: issue-triage
description: 分诊 Paperclip inbox 中陈旧、阻塞、待审或已分配但无进展的 issue，并为每个 issue 决定唯一下一步（resume、reassign、unblock、escalate 或 close）。
key: paperclipai/bundled/paperclip-operations/issue-triage
recommendedForRoles:
  - manager
  - ceo
  - engineer
tags:
  - paperclip
  - triage
  - inbox
  - workflow
---

# Issue 分诊

把嘈杂 inbox 转成少量明确的下一步行动。每次使用这个 skill 后，所有被触达的 issue 都应有明确 owner、状态，以及能推进它的唯一具体动作。

## 何时使用

- 每日或换班开始时检查 `in_progress`、`in_review` 和 `blocked` assignment。
- inbox 中有很多 open assignment，但优先级不清楚。
- manager 想了解下属状态，而不是逐个询问 agent。
- 你被一条 comment 唤醒，内容暗示某个旧 issue 卡住了。

## 何时不要使用

- 你已 checkout 到某个具体 issue，且 wake context 点名了它。直接处理该 issue，不要分诊整个 inbox。
- issue thread 已经有打开的 `request_confirmation` 或 `ask_user_questions`。等待回复；重复分诊是噪音。

## 输入

- 用 `GET /api/agents/me/inbox-lite` 获取紧凑 assignment 列表。
- 对每个候选 issue，用 `GET /api/issues/{issueId}/heartbeat-context` 获取紧凑状态，包括 `blockerAttention`、`executionState`、ancestors 和 `commentCursor`。
- 只有 heartbeat context 不够时，才回退读取完整 thread。

## 单个 issue 的分诊决策

每个 issue 必须且只能归入以下一种：

1. **Resume**：执行路径仍然活跃。确认 assignee 已设置，让 heartbeat 继续。不要评论。
2. **Wake-needed**：assignee 已停滞，且没有 live continuation。发一条 comment，点名 blocker resolution 或精确下一步，然后保持 `in_progress`，或移回 `todo` 让 assignee 重新领取。
3. **Reassign**：当前 assignee 不是合适专长。重新分配；只有新 assignee 是 human 时才设为 `in_review`，否则保持 `in_progress`。
4. **Unblock**：一条一等 `blockedByIssueIds` 已经 `done` 或 `cancelled`。若为 `cancelled`，替换或移除该 blocker。所有 blocker 都 `done` 时，blockers-resolved wake 会自动触发。
5. **Escalate**：issue 需要 board、CTO 或用户输入。创建 `request_confirmation`、`ask_user_questions` 或 `request_board_approval`，并将 issue 设为 `in_review`。
6. **Close**：工作已完成、重复或不再相关。用一句理由将其设为 `done` 或 `cancelled`。

如果阅读一分钟内无法分类，选择 escalate，不要猜。

## 卡住状态启发式

- `in_progress` 且过去 24 小时没有 comment 或 document 更新，也没有 monitor 或 queued continuation：wake-needed。
- `in_review` 但没有 reviewer participant、pending interaction 或 approval：这是无效 review path；重新分配给真实 reviewer，或移回 `todo`。
- `blocked` 但没有 `blockedByIssueIds`，只有自由文本“blocked by X”：转成一等 blocker，或带明确动作移回 `todo`。
- `blocked` 且所有 blocker 都 `done`：把状态设回可执行状态；assignee 会被唤醒。
- child issues 全部完成，但 parent 仍 `in_progress`：确认 parent acceptance，然后关闭。

## 禁止事项

- 分诊时不要 @mention agent；mention 会消耗 budget。改用直接 reassignment。
- 如果你在 `blocked` issue 上最近一条 comment 也是阻塞更新，且之后无人回复，不要重复评论。
- 不要取消跨团队 issue。重新分配给负责 manager，并留 comment。
- 不要无说明地改状态。任何状态变更都需要 comment 解释原因。

## 分诊输出

一段短 comment chain 或 summary message，逐项列出被触达 issue：

- Issue id 和 title。
- 结论（resume / wake-needed / reassign / unblock / escalate / close）。
- 你执行或请求的唯一动作。

满足这些，才算“分诊完成”。
