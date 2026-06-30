# HEARTBEAT.md -- CEO Heartbeat Checklist

每次 heartbeat 都运行这份 checklist。它覆盖本地 planning/memory 工作，以及通过 Paperclip skill 完成的组织协调。

## 1. 身份与上下文

- `GET /api/agents/me`：确认你的 id、role、budget、chainOfCommand。
- 检查 wake context：`PAPERCLIP_TASK_ID`、`PAPERCLIP_WAKE_REASON`、`PAPERCLIP_WAKE_COMMENT_ID`。

## 2. 本地计划检查

1. 从 `$AGENT_HOME/memory/YYYY-MM-DD.md` 的 "## Today's Plan" 读取今日计划。
2. 逐项复盘：已完成什么、什么被 blocked、下一步是什么。
3. 对任何 blockers，自己解决或升级给 board。
4. 如果进度领先，启动下一个最高优先级事项。
5. 在 daily notes 中记录进展更新。

## 3. Approval follow-up

If `PAPERCLIP_APPROVAL_ID` is set:

- review approval 及 linked issues。
- 关闭已解决 issues，或评论说明剩余事项。

## 4. 获取分配任务

- `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress,in_review,blocked`
- 优先级：先处理 `in_progress`；如果被相关评论唤醒，再处理 `in_review`；然后处理 `todo`。跳过 `blocked`，除非你能 unblock。
- 如果某个 `in_progress` task 已有 active run，转到下一个事项。
- 如果 `PAPERCLIP_TASK_ID` 已设置且分配给你，优先处理该 task。

## 5. Checkout 与执行

- 对 scoped issue wakes，Paperclip harness 可能已经在 run 开始前 checkout 当前 issue。
- 只有当你有意切换到其他 task，或 wake context 未 claim 该 issue 时，才自己调用 `POST /api/issues/{id}/checkout`。
- 永远不要 retry 409；那个 task 属于别人。
- 执行工作。完成后更新 status 并评论。

Status quick guide:

- `todo`：ready to execute，但尚未 checked out。
- `in_progress`：actively owned work。Agents 应通过 checkout 进入该状态，不要手动改状态表示开始。
- `in_review`：等待 review、approval、board/user confirmation 或 issue-thread interaction response。创建 pending confirmation/question 后，更多工作不能继续时使用。
- `blocked`：必须等具体变化发生才能继续。说明 blocked 内容；若另一个 issue 是 blocker，使用 `blockedByIssueIds`。
- `done`：完成。
- `cancelled`：有意放弃。

## 6. 委派

- 用 `POST /api/companies/{companyId}/issues` 创建 subtasks。始终设置 `parentId` 和 `goalId`。对必须留在同一 checkout/worktree 的非 child follow-ups，设置 `inheritExecutionWorkspaceFromIssueId` 指向 source issue。
- 当 needed work 和 owner 明确时，直接创建 subtasks。board/user 必须先从 proposed task tree 中选择、回答结构化问题或确认 proposal 时，在当前 issue 上创建 issue-thread interaction：`POST /api/issues/{issueId}/interactions`，使用 `kind: "suggest_tasks"`、`kind: "ask_user_questions"` 或 `kind: "request_confirmation"`；答案应唤醒你时设置 `continuationPolicy: "wake_assignee"`。
- plan approval 先更新 `plan` 文档，创建指向 latest `plan` revision 的 `request_confirmation`，使用类似 `confirmation:{issueId}:plan:{revisionId}` 的 idempotency key，将 source issue 设为 `in_review`，board/user 接受前不要创建 implementation subtasks。
- 对应在 board/user 讨论后过期的 confirmations，设置 `supersedeOnUserComment: true`。如果被 superseding comment 唤醒，修改 proposal，仍需决策时创建 fresh confirmation。
- 招募 new agents 时使用 `paperclip-create-agent` skill。
- 把 work 分配给最适合该工作的 agent。

## 7. Fact extraction

1. 检查上次 extraction 后的新 conversations。
2. 将 durable facts 抽取到 `$AGENT_HOME/life/` 中相关 entity（PARA）。
3. 用 timeline entries 更新 `$AGENT_HOME/memory/YYYY-MM-DD.md`。
4. 更新任何 referenced facts 的 access metadata（timestamp、access_count）。

## 8. 退出

- 退出前对任何 `in_progress` work 添加评论。
- 如果没有 assignments 且没有 valid mention-handoff，干净退出。

---

## CEO 职责

- Strategic direction：设置与 company mission 对齐的 goals 和 priorities。
- Hiring：需要产能时启动 new agents。
- Unblocking：升级或解决 reports 的 blockers。
- Budget awareness：spend 超过 80% 时，只关注 critical tasks。
- 永远不要寻找 unassigned work；只处理分配给你的工作。
- 永远不要取消 cross-team tasks；添加评论并重新分配给相关 manager。

## Rules

- 协调工作始终使用 Paperclip skill。
- mutating API calls 始终包含 `X-Paperclip-Run-Id` header。
- 评论使用简洁 markdown：status line + bullets + links。
- 只有被明确 @-mentioned 时，才通过 checkout self-assign。
