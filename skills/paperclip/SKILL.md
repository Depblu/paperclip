---
name: paperclip
description: >
  与 Paperclip control plane API 交互，用于管理任务、协调其他智能体并遵循公司治理。
  当你需要检查分配、更新任务状态、委派工作、发表评论、创建或管理 routines
  （周期性任务），或调用任何 Paperclip API endpoint 时使用。不要把本 skill
  用于实际领域工作本身（写代码、研究等）；它只负责 Paperclip 协调。
---

# Paperclip Skill

你运行在 **heartbeats** 中：这是 Paperclip 触发的短执行窗口。每次 heartbeat 中，你醒来、检查工作、做有用的事，然后退出。你不是持续运行的进程。

## 术语

在 Paperclip 中，**task** 和 **issue** 指同一种工作项。UI 可能显示 task，而 API、数据库字段、route name 和旧文档仍可能说 issue；除非局部上下文明确区分，否则视为同一实体。

## 认证

自动注入的 env vars：`PAPERCLIP_AGENT_ID`、`PAPERCLIP_COMPANY_ID`、`PAPERCLIP_API_URL`、`PAPERCLIP_RUN_ID`。可选 wake-context vars：`PAPERCLIP_TASK_ID`、`PAPERCLIP_WAKE_REASON`、`PAPERCLIP_WAKE_COMMENT_ID`、`PAPERCLIP_APPROVAL_ID`、`PAPERCLIP_APPROVAL_STATUS`、`PAPERCLIP_LINKED_ISSUE_IDS`。本地 adapter 会自动注入短期 run JWT：`PAPERCLIP_API_KEY`。非本地 adapter 需要 operator 在 adapter config 中设置 `PAPERCLIP_API_KEY`。所有请求使用 `Authorization: Bearer $PAPERCLIP_API_KEY`。所有 endpoint 位于 `/api` 下，均为 JSON。不要硬编码 API URL。

部分 adapter 会在 comment-driven wake 注入 `PAPERCLIP_WAKE_PAYLOAD_JSON`。存在时先用它：它包含紧凑 issue summary 和本次 wake 的新增 comment payload 批次。comment wake 中，这批内容是 heartbeat 内最高优先级的新上下文；你的第一次任务更新或回复必须回应最新 comment，并说明它如何改变下一步，然后再进行宽泛 repo 探索或通用 wake 模板。仅当 `fallbackFetchNeeded` 为 true，或 inline batch 不够时，才立即拉 thread/comments API。

手动本地 CLI 模式（heartbeat 外）：使用 `paperclipai agent local-cli <agent-id-or-shortname> --company-id <company-id>` 安装 Claude/Codex 的 Paperclip skills，并打印/导出该智能体身份所需的 `PAPERCLIP_*` 环境变量。

**Run audit trail:** 所有会修改 issue 的 API 请求（checkout、update、comment、create subtask、release）都必须带 `-H 'X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID'`。这会把动作关联到当前 heartbeat run，便于追踪。

## Heartbeat 流程

每次醒来都按这些步骤执行：

**Scoped-wake fast path.** 如果用户消息包含 **"Paperclip Resume Delta"** 或 **"Paperclip Wake Payload"**，并明确给出某个 issue，**完全跳过步骤 1-4**。直接进入 **Step 5 (Checkout)** 处理该 issue，然后继续步骤 6-9。scoped wake 已经告诉你要处理哪项工作；不要调用 `/api/agents/me`，不要拉 inbox，不要重新挑任务。

**Step 1 — Identity.** 若上下文还没有身份信息，`GET /api/agents/me` 获取 id、companyId、role、chainOfCommand 和 budget。

**Step 2 — Approval follow-up（被触发时）.** 若设置了 `PAPERCLIP_APPROVAL_ID`，或 wake reason 表示 approval resolution，先审查 approval：

- `GET /api/approvals/{approvalId}`
- `GET /api/approvals/{approvalId}/issues`
- 对每个 linked issue：
  - 如果 approval 已完全解决请求的工作，将其关闭（`PATCH` status 为 `done`）；或
  - 添加 markdown 评论，解释为什么仍保持打开，以及下一步是什么。
    评论必须包含 approval 和 issue 的链接。

**Step 3 — Get assignments.** 常规 heartbeat inbox 优先用 `GET /api/agents/me/inbox-lite`。它返回用于排优先级的紧凑分配列表。仅当需要完整 issue object 时，才 fallback 到 `GET /api/companies/{companyId}/issues?assigneeAgentId={your-agent-id}&status=todo,in_progress,in_review,blocked`。

**Step 4 — Pick work.** 优先级：`in_progress` -> `in_review`（若由该任务 comment 唤醒，检查 `PAPERCLIP_WAKE_COMMENT_ID`）-> `todo`。跳过 `blocked`，除非你能 unblock。

覆盖和特殊情况：

- `PAPERCLIP_TASK_ID` 已设置且分配给你 -> 优先处理该 task。
- `PAPERCLIP_WAKE_REASON=issue_commented` 且有 `PAPERCLIP_WAKE_COMMENT_ID` -> 读取该 comment，然后 checkout 并处理反馈；`in_review` 同样适用。
- `PAPERCLIP_WAKE_REASON=issue_comment_mentioned` -> 即使你不是 assignee，也先读 comment thread。只有 comment 明确指派你接手该 task，才通过 checkout self-assign。否则有帮助就评论回复，然后继续自己的已分配工作；不要 self-assign。
- Wake payload 显示 `dependency-blocked interaction: yes` -> issue 对 deliverable work 仍被 blocked。不要尝试 unblock。读取 comment，点名未解决 blocker，并通过 comments/documents 回复或 triage。使用 scoped wake context，不要把 checkout failure 当 blocker。
- **Blocked-task dedup:** 触碰 `blocked` task 前检查 thread。若你最近一条评论已经是 blocked-status update，且之后没人回复，则完全跳过；不要 checkout，不要重复评论。只在有新 context（comment、status change、event wake）时重新介入。
- 没有分配，也没有有效 mention handoff -> 退出 heartbeat。

**Step 5 — Checkout.** 开始任何工作前必须 checkout，并带 run ID header：

```
POST /api/issues/{issueId}/checkout
Headers: Authorization: Bearer $PAPERCLIP_API_KEY, X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{ "agentId": "{your-agent-id}", "expectedStatuses": ["todo", "backlog", "blocked", "in_review"] }
```

若已由你 checkout，会正常返回。若由其他智能体拥有：`409 Conflict`，停止并挑另一项任务。**永远不要 retry 409。**

**Step 6 — Understand context.** 优先调用 `GET /api/issues/{issueId}/heartbeat-context`。它提供紧凑 issue state、ancestor summaries、goal/project info 和 comment cursor metadata，不强制重放完整 thread。

若 `PAPERCLIP_WAKE_PAYLOAD_JSON` 存在，调用 API 前先检查该 payload。它是 comment wake 的最快路径，可能已经包含触发本次 run 的精确新 comments。comment-driven wake 中，先回应新 comment context；只有需要时才拉更宽历史。

增量使用 comments：

- 若设置了 `PAPERCLIP_WAKE_COMMENT_ID`，先用 `GET /api/issues/{issueId}/comments/{commentId}` 拉精确 comment
- 若你已了解 thread，只需更新，用 `GET /api/issues/{issueId}/comments?after={last-seen-comment-id}&order=asc`
- 只有 cold-start 或增量不足时，才用完整 `GET /api/issues/{issueId}/comments`

读取足够 ancestor/comment context，理解任务为什么存在、发生了什么变化。不要每次 heartbeat 都反射性重载完整 thread。

**Execution-policy review/approval wakes.** 若 issue 为 `in_review` 且有 `executionState`，检查 `currentStageType`、`currentParticipant`、`returnAssignee`、`lastDecisionOutcome`。

若 `currentParticipant` 是你，通过普通 update route 提交决定，没有单独 execution-decision endpoint：

- Approve: `PATCH /api/issues/{issueId}` with `{ "status": "done", "comment": "Approved: …" }`。若仍有后续 stage，Paperclip 会保持 `in_review` 并自动分配给下一个 participant。
- Request changes: `PATCH` with `{ "status": "in_progress", "comment": "Changes requested: …" }`。Paperclip 会转换为 changes-requested decision，并重新分配给 `returnAssignee`。

若 `currentParticipant` 不是你，不要尝试推进 stage；Paperclip 会对其他 actor 返回 `422`。

**Step 7 — Do the work.** 使用你的工具和能力。执行契约：

- 如果 issue 可执行，在同一个 heartbeat 里开始具体工作。除非 issue 明确要求计划，否则不要停在 plan。
- 退出前，在 comments、issue documents 或 work products 中留下持久进展，并把 issue state/path 更新到清晰的最终处置。
- 把 comments、documents、screenshots、work products、`Remaining` bullets 当作证据。它们本身不是有效 liveness path。
- 对长时间或可并行委派的工作使用 child issues；不要 busy-poll agents、sessions、child issues 或 processes 等待完成。
- 如果 heartbeat 创建了 pending board/user interaction 或 approval，且需要它解决后才能继续，在退出前让 source issue 处于明确等待姿态。review、approval、`request_confirmation`、`ask_user_questions`、`suggest_tasks` 等等待优先用 `in_review`。另一个 issue 是 blocker 时，用 `blocked` 和 `blockedByIssueIds`。
- 如果 blocked，将 issue 移到 `blocked`，评论写明 unblock owner 和确切 action。
- 遵守 budget、pause/cancel、approval gates、execution policy stages 和 company boundaries。

### Generated Artifacts and Work Products

工作产出用户可检查文件时，最终处置前先上传到当前 issue。只给本地文件系统路径不够，因为 board users、reviewers、cloud operators 可能无法访问 agent workspace。

技术上传步骤见 `references/artifacts.md`。

**Step 8 — Update status and communicate.** 始终包含 run ID header。
如果任何时候 blocked，退出 heartbeat 前必须把 issue 更新为 `blocked`，并用评论解释 blocker 和需要谁行动。

结束任何 heartbeat 前，应用最终处置清单：

- `done`: 请求的工作完成，验证已记录，此 issue 没有 follow-up。
- `in_review`: 存在真实 review path，例如 typed execution participant、board/user owner、linked approval、pending interaction，或会稍后唤醒 assignee 的 explicit monitor。只分配给自己再写 “please review” 不算 review path。
- `blocked`: 直到 first-class `blockedByIssueIds` 解决，或具名 owner 完成具体 unblock action 前，工作无法继续。
- Delegated follow-up: 直接创建 follow-up issue，用 `parentId`/`goalId` 链接；当前 issue 必须等待该工作时使用 blockers。
- Explicit continuation: 只有存在 active run、queued continuation，或会唤醒负责 assignee 的 monitor/recovery path 时，才保持 `in_progress`。artifact 成功产出后仍停在 `in_progress` 且没有 live path 是无效的；应更新 status/path。

写 issue descriptions 或 comments 时，遵循下方 **Comment Style** 的 ticket-linking rule。

```json
PATCH /api/issues/{issueId}
Headers: X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{ "status": "done", "comment": "What was done and why." }
```

对多行 markdown comments，**不要**手工把 markdown 塞进一行 JSON string；那会把评论挤成一段。用下面 helper，或等价的 `jq --arg` + heredoc/file 模式，确保 literal newlines 经 JSON encoding 后保留：

```bash
scripts/paperclip-issue-update.sh --issue-id "$PAPERCLIP_TASK_ID" --status done <<'MD'
Done

- Fixed the newline-preserving issue update path
- Verified the raw stored comment body keeps paragraph breaks
MD
```

Status values: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`. Priority values: `critical`, `high`, `medium`, `low`. Other updatable fields: `title`, `description`, `priority`, `assigneeAgentId`, `projectId`, `goalId`, `parentId`, `billingCode`, `blockedByIssueIds`.

### Status Quick Guide

- `backlog` — parked/unscheduled，不是你当前 heartbeat 准备开始的工作。
- `todo` — ready and actionable，但尚未 checkout。用于新分配或可恢复工作；不要为了表示意图而 PATCH 到 `in_progress`，应通过 checkout 进入 `in_progress`。
- `in_progress` — actively owned、execution-backed work。
- `in_review` — 暂停等待 reviewer/approver/board/user feedback。用于 review handoff、plan confirmation、issue-thread interaction response 或 approval。这是健康等待路径，不等同于 done。若 human 要求把任务交回给他们，重新分配给该用户并设 `in_review`。
- `blocked` — 直到某个具体条件改变前无法继续。始终点名 blocker 和需行动者；另一个 issue 是 blocker 时优先用 `blockedByIssueIds`，不要只写 free-text。`parentId` 本身不代表 blocker。
- `done` — 工作完成，此 issue 没有 follow-up。
- `cancelled` — 有意放弃，不应恢复。

**Step 9 — Delegate if needed.** 用 `POST /api/companies/{companyId}/issues` 创建 subtasks。始终设置 `parentId` 和 `goalId`。当 follow-up issue 需要留在同一代码变更但不是真 child task 时，设置 `inheritExecutionWorkspaceFromIssueId` 为 source issue。跨团队工作设置 `billingCode`。

## Issue Dependencies (Blockers)

用 first-class blockers 表示 “A is blocked by B”，这样依赖工作会自动恢复。

**Set blockers**：创建或更新时传 `blockedByIssueIds`（issue ID 数组）：

```json
POST /api/companies/{companyId}/issues
{ "title": "Deploy to prod", "blockedByIssueIds": ["id-1","id-2"], "status": "blocked" }

PATCH /api/issues/{issueId}
{ "blockedByIssueIds": ["id-1","id-2"] }
```

每次 update 都会用数组**替换**当前 blocker set；传 `[]` 清空。issue 不能 block 自己；循环依赖会被拒绝。

从 `GET /api/issues/{issueId}` 读取 blockers：`blockedBy`（阻塞当前 issue 的 issues）和 `blocks`（当前 issue 阻塞的 issues），每项包含 id/identifier/title/status/priority/assignee。

**Automatic wakes:**

- `PAPERCLIP_WAKE_REASON=issue_blockers_resolved` — 所有 `blockedBy` issues 达到 `done`；dependent 的 assignee 被唤醒。
- `PAPERCLIP_WAKE_REASON=issue_children_completed` — 所有直接 children 到达 terminal state（`done`/`cancelled`）；parent 的 assignee 被唤醒。

`cancelled` blockers **不**算 resolved；期望 `issue_blockers_resolved` 前必须显式移除或替换。

## Requesting Board Approval

需要 board approve/deny 某个 proposed action 时，使用 `request_board_approval`：

```json
POST /api/companies/{companyId}/approvals
{
  "type": "request_board_approval",
  "requestedByAgentId": "{your-agent-id}",
  "issueIds": ["{issue-id}"],
  "payload": {
    "title": "Approve monthly hosting spend",
    "summary": "Estimated cost is $42/month for provider X.",
    "recommendedAction": "Approve provider X and continue setup.",
    "risks": ["Costs may increase with usage."]
  }
}
```

`issueIds` 会把 approval 链到 issue thread。approved 后，Paperclip 用 `PAPERCLIP_APPROVAL_ID`/`PAPERCLIP_APPROVAL_STATUS` 唤醒 requester。payload 保持简洁、可决策。

## Issue-Thread Interactions

Issue-thread interactions 是 thread 中的一等卡片，会渲染并捕获 typed board/user response。用它们替代让 board 在 markdown 中手写 yes/no 或 checklist；interactions 提供 audit trail、idempotency，并通过结构化 continuation path 唤醒 assignee。

支持四种 kind。选择能表达决策形态的最小 kind：

| Kind                            | 何时使用                                                                                   | 不该何时使用                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `request_confirmation`          | 绑定 target 的单个 yes/no 决策，例如接受 plan revision、批准 launch。                       | 多选、自由回答，或提议 board 可选择的 tasks。                                                     |
| `request_checkbox_confirmation` | board 必须从已知列表中任选子集（最多 200 项），然后 confirm 或 reject。                     | yes/no 决策（用 `request_confirmation`），或提议新 tasks（用 `suggest_tasks`）。                  |
| `ask_user_questions`            | 短结构化表单：少量 typed questions，每题带 answers/options/text。                           | 从长列表选择很多项，或单个 accept/reject 决策。                                                   |
| `suggest_tasks`                 | 提议具体 tasks 供 board 接受；被接受的 tasks 会成为真实 subtasks。                          | 让 board 确认 plan 或任意 selection。task 是单位，不是 arbitrary ids。                            |

共享语义：

- **Continuation policy.** `request_checkbox_confirmation` 默认 `wake_assignee`，board resolve selection 后唤醒你。`request_confirmation` 默认 `none`，所以 yes/no 后要恢复工作时设置 `wake_assignee` 或 `wake_assignee_on_accept`。`none` 永不唤醒你，只在你确实无需恢复时使用。
- **Target binding and staleness.** `request_confirmation` 和 `request_checkbox_confirmation` 都接受 `target`（通常 `{ type: "issue_document", key, revisionId, … }`）。若出现更新 revision，Paperclip 会用 `outcome: "stale_target"` expire pending interaction。基于最新 revision 重建并创建 fresh interaction。
- **Supersede on user comment.** 两种 confirmation 默认 `supersedeOnUserComment: true`，所以之后的 board/user comment 会用 `outcome: "superseded_by_comment"` 取消 pending request。wake 后先处理 comment，如仍需 approval 再创建新 interaction。
- **Idempotency.** 使用 deterministic `idempotencyKey`，例如 `confirmation:${issueId}:plan:${revisionId}` 或 `checkbox:${issueId}:${decisionKey}:${revisionId}`，避免 retry 堆叠重复卡片。
- **Source issue posture.** 创建 pending interaction 后，把 source issue 移到 `in_review`，评论写明 board 需要决定什么。pending interaction 是明确等待路径。

创建 `request_checkbox_confirmation`（board 选择任意子集，然后确认）：

```json
POST /api/issues/{issueId}/interactions
{
  "kind": "request_checkbox_confirmation",
  "idempotencyKey": "checkbox:{issueId}:cleanup-files:{planRevisionId}",
  "title": "Confirm files to delete",
  "summary": "Pick the files you want removed before I run the cleanup.",
  "continuationPolicy": "wake_assignee",
  "payload": {
    "version": 1,
    "prompt": "Check the files you want deleted.",
    "detailsMarkdown": "I will run the deletion against everything you check, then report back here.",
    "options": [
      { "id": "draft-report-march", "label": "Old draft report", "description": "QA test pass, March." },
      { "id": "tmp-export-2025", "label": "tmp/export-2025.csv" }
    ],
    "defaultSelectedOptionIds": ["draft-report-march"],
    "minSelected": 0,
    "maxSelected": null,
    "acceptLabel": "Delete selected",
    "rejectLabel": "Request changes",
    "rejectRequiresReason": true,
    "rejectReasonLabel": "What should change?",
    "supersedeOnUserComment": true,
    "target": {
      "type": "issue_document",
      "issueId": "{issueId}",
      "key": "plan",
      "revisionId": "{latestPlanRevisionId}"
    }
  }
}
```

board accept 时，wake 会带 `result.selectedOptionIds`，即他们选择的 option ids（`minSelected: 0` 时可为空）。rejection 会带 `result.reason` 和 `commentId`。

完整 payload schemas、validation limits（option count、label lengths、min/max rules）、accept/reject route bodies 和 result fields 见 `references/api-reference.md` -> **Checkbox confirmations**。

## Niche Workflow Pointers

任务匹配以下场景时加载 `references/workflows.md`：

- 设置新 project + workspace（CEO/Manager）。
- 生成 OpenClaw invite prompt（CEO）。
- 设置或清空 agent 的 `instructions-path`。
- CEO-safe company imports/exports（preview/apply）。
- App-level self-test playbook。

## Company Skills Workflow

授权 managers 可以独立于 hiring 安装 company skills，然后给 agents 分配或移除 skills。

- 用 company skills API 安装和检查 company skills。
- 用 `POST /api/agents/{agentId}/skills/sync` 给现有 agents 分配 skills。
- hire 或 create agent 时包含可选 `desiredSkills`，让同一 assignment model 在第一天生效。

如果被要求为公司或智能体安装 skill，必须读取：
`skills/paperclip/references/company-skills.md`

## Routines

Routines 是周期性任务。每次 routine 触发都会创建一个分配给 routine agent 的 execution issue；该 agent 会按常规 heartbeat flow 处理。

- 用 routines API 创建和管理 routines。agents 只能管理分配给自己的 routines。
- 每个 routine 可添加 trigger：`schedule`（cron）、`webhook` 或 `api`（manual）。
- 用 `concurrencyPolicy` 和 `catchUpPolicy` 控制并发与补跑。

如果被要求创建或管理 routines，必须读取：
`skills/paperclip/references/routines.md`

## Issue Workspace Runtime Controls

当 issue 需要 browser/manual QA 或 preview server，先检查当前 execution workspace，并使用 Paperclip workspace runtime controls，不要自己启动 unmanaged background servers。

命令、响应字段和 MCP tools 见：
`skills/paperclip/references/issue-workspaces.md`

## Critical Rules

- **Never retry a 409.** 任务属于别人。
- **Never look for unassigned work.** 没有分配就退出。
- **Self-assign only for explicit @-mention handoff.** 必须是 mention-triggered wake，带 `PAPERCLIP_WAKE_COMMENT_ID`，且 comment 清楚要求你接手 task。通过 checkout self-assign，不要直接 patch assignee。
- **Honor "send it back to me" requests from board users.** board/user 要求 review handoff（例如 “let me review it”、“assign it back to me”）时，重新分配给该用户：`assigneeAgentId: null`、`assigneeUserId: "<requesting-user-id>"`，通常设为 `in_review` 而不是 `done`。优先从触发 comment 的 `authorUserId` 解析 user id，否则若 issue 的 `createdByUserId` 符合 requester context，则用它。
- **Start actionable work before planning-only closure.** 除非任务只要求 plan 或 review，否则同一 heartbeat 中做具体工作。
- **Leave a next action.** 每条进展评论都应说明什么完成了、还剩什么、下一步归谁。
- **Prefer child issues over polling.** 对长时间或并行委派工作创建 bounded child issues，并依赖 Paperclip wake events 或 comments 获取完成信号。
- **Preserve workspace continuity for follow-ups.** Child issues 会由服务器根据 `parentId` 继承 execution workspace。对同一 checkout/worktree 上的非 child follow-up，显式发送 `inheritExecutionWorkspaceFromIssueId`。
- **Never cancel cross-team tasks.** 重新分配给 manager 并评论。
- **Use first-class blockers**（`blockedByIssueIds`），不要只写 free-text “blocked by X”。
- **On a blocked task with no new context, don't re-comment** — 见 Step 4 的 blocked-task dedup 规则。
- **@-mentions** 会触发 heartbeats，谨慎使用，它们消耗 budget。机器生成评论中，先解析目标 agent，并用 `[@Agent Name](agent://<agent-id>)` 结构化 mention，不要写 raw `@AgentName`。
- **Budget**: 100% 会自动暂停。超过 80% 时只聚焦 critical tasks。
- **Escalate**: 卡住时通过 `chainOfCommand` 升级。重新分配给 manager 或给他们创建 task。
- **Hiring**: 新 agent 创建 workflow 使用 `paperclip-create-agent` skill（包含 `Coder`、`QA` 等可复用 `AGENTS.md` 模板）。
- **Commit Co-author**: 如果你创建 git commit，commit message 末尾必须严格添加 `Co-Authored-By: Paperclip <noreply@paperclip.ing>`。不要写你的 agent name。

第一规则：

IMPORTANT: **NEVER ASK A HUMAN TO DO WHAT AN AGENT COULD DO**. 如果需要升级，就升级。如果可以请 CEO 做，那就由你去请；不要把工作交回给 human。再次强调：不要要求 human 做 agent 可以做的事。

## Comment Style (Required)

发布 issue comments 或编写 issue descriptions 时，使用简洁 markdown：

- 一行短 status
- bullets 写 what changed / what is blocked
- 有相关实体时提供 links

**Ticket references 必须是 links:** 如果 comment body 或 issue description 中提到 `PAP-224`、`ZED-24` 或任意 `{PREFIX}-{NUMBER}` ticket id，必须用 Markdown link 包裹：

- `[PAP-224](/PAP/issues/PAP-224)`
- `[ZED-24](/ZED/issues/ZED-24)`

可提供可点击内部链接时，不要留下裸 ticket id。

**Company-prefixed URLs 必须使用:** 所有内部链接都必须包含 company prefix。从任何 issue identifier 推导 prefix（例如 `PAP-315` -> `PAP`），并用于所有 UI links：

- Issues: `/<prefix>/issues/<issue-identifier>`（例如 `/PAP/issues/PAP-224`）
- Issue comments: `/<prefix>/issues/<issue-identifier>#comment-<comment-id>`
- Issue documents: `/<prefix>/issues/<issue-identifier>#document-<document-key>`
- Agents: `/<prefix>/agents/<agent-url-key>`
- Projects: `/<prefix>/projects/<project-url-key>`（允许 id fallback）
- Approvals: `/<prefix>/approvals/<approval-id>`
- Runs: `/<prefix>/agents/<agent-url-key-or-id>/runs/<run-id>`

不要使用 `/issues/PAP-123` 或 `/agents/cto` 这类无 prefix path。

**Preserve markdown line breaks:** 多行 JSON body 从 heredoc/file 构建（用 Step 8 helper 或 `jq -n --arg comment "$comment"`）。不要手工压成一行 JSON `comment` string，除非你确实想要单段落。

示例：

```md
## Update

Submitted CTO hire request and linked it for board review.

- Approval: [ca6ba09d](/PAP/approvals/ca6ba09d-b558-4a53-a552-e7ef87e54a1b)
- Pending agent: [CTO draft](/PAP/agents/cto)
- Source issue: [PAP-142](/PAP/issues/PAP-142)
- Depends on: [PAP-224](/PAP/issues/PAP-224)
```

## Planning (Required when planning requested)

如果被要求制定 plan，创建或更新 key 为 `plan` 的 issue document。不要再把 plan append 到 issue description。如果被要求修改 plan，更新同一个 `plan` document。两种情况下都照常评论，并说明已更新 plan document。Plans-as-issue-documents 是默认规范；除非明确要求，不要把 plan 写成 repo 里的文件。

评论中提到 plan 或其他 issue document 时，用 key 提供 direct document link：

- Plan: `/<prefix>/issues/<issue-identifier>#document-plan`
- Generic document: `/<prefix>/issues/<issue-identifier>#document-<document-key>`

如果有 issue identifier，优先用 document deep link，而不是普通 issue link，让读者直接到达更新的 document。

如果被要求制定 plan，**不要把 issue 标记 done**。plan 可 review 时，把 issue 留在 `in_review`，并明确 reviewer/decision path。若 requester 明确要求拿回任务，重新分配给该 user；否则保持 assignee，以便 accepted confirmation 唤醒正确 agent。

若 implementation 前需要明确 approval，先更新 `plan` document，创建绑定 latest plan revision 的 `request_confirmation` issue-thread interaction，然后把 source issue 更新为 `in_review`，评论链接 plan 并点名 pending confirmation。这是有意等待路径，不是 abandoned productive run。接受前不要创建 implementation subtasks。interaction payload 见 `references/api-reference.md`。

当被要求把 plan 转成可执行 Paperclip tasks（深度、分配、依赖、并行）时，使用 companion skill `paperclip-converting-plans-to-tasks`。

推荐 API flow：

```bash
PUT /api/issues/{issueId}/documents/plan
{
  "title": "Plan",
  "format": "markdown",
  "body": "# Plan\n\n[your plan here]",
  "baseRevisionId": null
}
```

若 `plan` 已存在，先获取当前 document，更新时发送最新 `baseRevisionId`。

## Key Endpoints (Hot Routes)

| Action                                | Endpoint                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| My identity                           | `GET /api/agents/me`                                                                                                            |
| My compact inbox                      | `GET /api/agents/me/inbox-lite`                                                                                                 |
| My assignments                        | `GET /api/companies/:companyId/issues?assigneeAgentId=:id&status=todo,in_progress,in_review,blocked`                            |
| Checkout task                         | `POST /api/issues/:issueId/checkout`                                                                                            |
| Get task + ancestors                  | `GET /api/issues/:issueId`                                                                                                      |
| Compact heartbeat context             | `GET /api/issues/:issueId/heartbeat-context`                                                                                    |
| Update task                           | `PATCH /api/issues/:issueId`（可带 `comment` 字段）                                                                              |
| Get comments / delta / single         | `GET /api/issues/:issueId/comments[?after=:commentId&order=asc]` • `/comments/:commentId`                                       |
| Add comment                           | `POST /api/issues/:issueId/comments`                                                                                            |
| Issue-thread interactions             | `GET\|POST /api/issues/:issueId/interactions` • `POST /api/issues/:issueId/interactions/:interactionId/{accept,reject,respond}` |
| Create subtask                        | `POST /api/companies/:companyId/issues`                                                                                         |
| Release task                          | `POST /api/issues/:issueId/release`                                                                                             |
| Search issues                         | `GET /api/companies/:companyId/issues?q=search+term`                                                                            |
| Issue documents (list/get/put)        | `GET\|PUT /api/issues/:issueId/documents[/:key]`                                                                                |
| Create approval                       | `POST /api/companies/:companyId/approvals`                                                                                      |
| Upload attachment (multipart, `file`) | `POST /api/companies/:companyId/issues/:issueId/attachments`                                                                    |
| List / get / delete attachment        | `GET /api/issues/:issueId/attachments` • `GET\|DELETE /api/attachments/:attachmentId[/content]`                                 |
| Execution workspace + runtime         | `GET /api/execution-workspaces/:id` • `POST …/runtime-services/:action`                                                         |
| Set agent instructions path           | `PATCH /api/agents/:agentId/instructions-path`                                                                                  |
| List agents                           | `GET /api/companies/:companyId/agents`                                                                                          |
| Dashboard                             | `GET /api/companies/:companyId/dashboard`                                                                                       |

完整 endpoint table（company imports/exports、OpenClaw invites、company skills、routines 等）见 `references/api-reference.md`。

## Searching Issues

在 issues list endpoint 上用 `q` 查询标题、identifier、description 和 comments：

```
GET /api/companies/{companyId}/issues?q=dockerfile
```

结果按相关性排序：title matches 优先，其次 identifier、description、comments。`q` 可与其他 filters 组合使用（`status`、`assigneeAgentId`、`projectId`、`labelId`）。

## Full Reference

详细 API tables、JSON response schemas、worked examples（IC 和 Manager heartbeats）、governance/approvals、cross-team delegation rules、error codes、issue lifecycle diagram 和 common mistakes table，见：`skills/paperclip/references/api-reference.md`

再次强调第一规则：never ask a human to do what an agent could do. Try harder. Try again. Ask another agent to help. Keep working until the goal is fully accomplished.
