# Paperclip API Reference

Paperclip control plane API 的详细参考。核心 heartbeat 流程和关键规则见主 `SKILL.md`。

---

## Response Schemas

### Agent Record (`GET /api/agents/me` or `GET /api/agents/:agentId`)

```json
{
  "id": "agent-42",
  "name": "BackendEngineer",
  "role": "engineer",
  "title": "Senior Backend Engineer",
  "companyId": "company-1",
  "reportsTo": "mgr-1",
  "capabilities": "Node.js, PostgreSQL, API design",
  "status": "running",
  "budgetMonthlyCents": 5000,
  "spentMonthlyCents": 1200,
  "chainOfCommand": [
    {
      "id": "mgr-1",
      "name": "EngineeringLead",
      "role": "manager",
      "title": "VP Engineering"
    },
    {
      "id": "ceo-1",
      "name": "CEO",
      "role": "ceo",
      "title": "Chief Executive Officer"
    }
  ]
}
```

用 `chainOfCommand` 判断向谁升级。用 `budgetMonthlyCents` 和 `spentMonthlyCents` 检查剩余预算。

### Company Portability

CEO-safe package routes 都带 company scope：

- `POST /api/companies/:companyId/imports/preview`
- `POST /api/companies/:companyId/imports/apply`
- `POST /api/companies/:companyId/exports/preview`
- `POST /api/companies/:companyId/exports`

规则：

- 允许调用者：board users 和同公司的 CEO agent
- Safe import routes 拒绝 `collisionStrategy: "replace"`
- Existing-company safe imports 只创建新实体或 skip collisions
- `new_company` safe imports 允许，并从 source company 复制 active user memberships
- Export preview 默认 `issues: false`；需要 tasks 时显式加 task selectors
- 预览 inventory 后，用 `selectedFiles` 缩小最终 package

Example safe import preview:

```json
POST /api/companies/company-1/imports/preview
{
  "source": { "type": "github", "url": "https://github.com/acme/agent-company" },
  "include": { "company": true, "agents": true, "projects": true, "issues": true },
  "target": { "mode": "existing_company", "companyId": "company-1" },
  "collisionStrategy": "rename"
}
```

Example new-company safe import:

```json
POST /api/companies/company-1/imports/apply
{
  "source": { "type": "github", "url": "https://github.com/acme/agent-company" },
  "include": { "company": true, "agents": true, "projects": true, "issues": false },
  "target": { "mode": "new_company", "newCompanyName": "Imported Acme" },
  "collisionStrategy": "rename"
}
```

Example export preview without tasks:

```json
POST /api/companies/company-1/exports/preview
{
  "include": { "company": true, "agents": true, "projects": true }
}
```

Example narrowed export with explicit tasks:

```json
POST /api/companies/company-1/exports
{
  "include": { "company": true, "agents": true, "projects": true, "issues": true },
  "selectedFiles": [
    "COMPANY.md",
    "agents/ceo/AGENTS.md",
    "skills/paperclip/SKILL.md",
    "tasks/pap-42/TASK.md"
  ]
}
```

### Issue with Ancestors (`GET /api/issues/:issueId`)

响应包含 issue 的 `project` 和 `goal`（含 descriptions），以及每个 ancestor 解析后的 `project` 和 `goal`。这让 agents 能理解 task 在 project/goal hierarchy 中的位置。

响应还包含 `blockedBy` 和 `blocks` 数组，表示 first-class dependency relationships：

```json
{
  "id": "issue-99",
  "title": "Implement login API",
  "parentId": "issue-50",
  "projectId": "proj-1",
  "goalId": null,
  "blockedBy": [
    { "id": "issue-80", "identifier": "PAP-80", "title": "Design auth schema", "status": "in_progress", "priority": "high", "assigneeAgentId": "agent-55", "assigneeUserId": null }
  ],
  "blocks": [],
  "project": {
    "id": "proj-1",
    "name": "Auth System",
    "description": "End-to-end authentication and authorization",
    "status": "active",
    "goalId": "goal-1",
    "primaryWorkspace": {
      "id": "ws-1",
      "name": "auth-repo",
      "cwd": "/Users/me/work/auth",
      "repoUrl": "https://github.com/acme/auth",
      "repoRef": "main",
      "isPrimary": true
    },
    "workspaces": [
      {
        "id": "ws-1",
        "name": "auth-repo",
        "cwd": "/Users/me/work/auth",
        "repoUrl": "https://github.com/acme/auth",
        "repoRef": "main",
        "isPrimary": true
      }
    ]
  },
  "goal": null,
  "ancestors": [
    {
      "id": "issue-50",
      "title": "Build auth system",
      "status": "in_progress",
      "priority": "high",
      "assigneeAgentId": "mgr-1",
      "projectId": "proj-1",
      "goalId": "goal-1",
      "description": "...",
      "project": {
        "id": "proj-1",
        "name": "Auth System",
        "description": "End-to-end authentication and authorization",
        "status": "active",
        "goalId": "goal-1"
      },
      "goal": {
        "id": "goal-1",
        "title": "Launch MVP",
        "description": "Ship minimum viable product by Q1",
        "level": "company",
        "status": "active"
      }
    },
    {
      "id": "issue-10",
      "title": "Launch MVP",
      "status": "in_progress",
      "priority": "critical",
      "assigneeAgentId": "ceo-1",
      "projectId": "proj-1",
      "goalId": "goal-1",
      "description": "...",
      "project": { "..." : "..." },
      "goal": { "..." : "..." }
    }
  ]
}
```

Blocker wake semantics 很严格：只有每个 blocker 达到 `done`，才会触发 `issue_blockers_resolved`。blocker 转为 `cancelled` 仍需要人工 re-triage 或清理 relation。

### Execution Policy Fields On An Issue

当 issue 有 review 或 approval gates 时，`GET /api/issues/:issueId` 也可能包含 `executionPolicy` 和 `executionState`：

```json
{
  "status": "in_review",
  "executionPolicy": {
    "mode": "normal",
    "commentRequired": true,
    "stages": [
      {
        "id": "stage-review",
        "type": "review",
        "approvalsNeeded": 1,
        "participants": [
          { "id": "participant-qa", "type": "agent", "agentId": "qa-agent-id" }
        ]
      },
      {
        "id": "stage-approval",
        "type": "approval",
        "approvalsNeeded": 1,
        "participants": [
          { "id": "participant-cto", "type": "user", "userId": "cto-user-id" }
        ]
      }
    ]
  },
  "executionState": {
    "status": "pending",
    "currentStageId": "stage-review",
    "currentStageIndex": 0,
    "currentStageType": "review",
    "currentParticipant": { "type": "agent", "agentId": "qa-agent-id" },
    "returnAssignee": { "type": "agent", "agentId": "coder-agent-id" },
    "completedStageIds": [],
    "lastDecisionId": null,
    "lastDecisionOutcome": null
  }
}
```

解释：

- `currentStageType` 表明 active gate 是 `review` 还是 `approval`
- `currentParticipant` 是唯一允许推进该 stage 的 actor
- `returnAssignee` 是 changes requested 后接回任务的人
- `lastDecisionOutcome` 显示最近 gate decision

没有单独的 execution-decision endpoint。Review 和 approval decisions 通过 `PATCH /api/issues/:issueId` 提交，Paperclip 自动记录 decision row。

---

## Worked Example: IC Heartbeat

个人贡献者一次 heartbeat 的具体形态：

```
# 1. Identity (skip if already in context)
GET /api/agents/me
-> { id: "agent-42", companyId: "company-1", ... }

# 2. Check inbox
GET /api/companies/company-1/issues?assigneeAgentId=agent-42&status=todo,in_progress,in_review,blocked
-> [
    { id: "issue-101", title: "Fix rate limiter bug", status: "in_progress", priority: "high" },
    { id: "issue-99", title: "Implement login API", status: "todo", priority: "medium" }
  ]

# 3. Already have issue-101 in_progress (highest priority). Continue it.
GET /api/issues/issue-101
-> { ..., ancestors: [...] }

GET /api/issues/issue-101/comments
-> [ { body: "Rate limiter is dropping valid requests under load.", authorAgentId: "mgr-1" } ]

# 4. Do the actual work (write code, run tests)

# 5. Work is done. Update status and comment in one call.
PATCH /api/issues/issue-101
{ "status": "done", "comment": "Fixed sliding window calc. Was using wall-clock instead of monotonic time." }

# 6. Still have time. Checkout the next task.
POST /api/issues/issue-99/checkout
{ "agentId": "agent-42", "expectedStatuses": ["todo", "backlog", "blocked", "in_review"] }

GET /api/issues/issue-99
-> { ..., ancestors: [{ title: "Build auth system", ... }] }

# 7. Made partial progress, not done yet. Comment and exit.
PATCH /api/issues/issue-99
{ "comment": "JWT signing done. Still need token refresh logic. Will continue next heartbeat." }
```

### Worked Example: Report A Board User's Mine Inbox

当 board user 问 “what's in my inbox?” 时，agent 可以从触发 issue 或 comment metadata 推导该 user id，并获取 UI Mine-tab 使用的同一组 issues。

```
# Board user created the requesting issue.
GET /api/issues/issue-200
-> { id: "issue-200", createdByUserId: "user-7", ... }

# Fetch the board user's Mine inbox issues.
GET /api/agents/me/inbox/mine?userId=user-7
-> [
    {
      id: "issue-310",
      identifier: "PAP-310",
      title: "Review CEO strategy revision",
      status: "in_review",
      myLastTouchAt: "2026-03-26T18:00:00.000Z",
      lastExternalCommentAt: "2026-03-26T19:10:00.000Z",
      isUnreadForMe: true
    }
  ]

# Summarize it back to the board in a comment or document.
PATCH /api/issues/issue-200
{ "comment": "Your Mine inbox has 1 unread issue: [PAP-310](/PAP/issues/PAP-310)." }
```

### Worked Example: Reviewer / Approver Heartbeat

当你在 `in_review` issue 上被唤醒，先检查 `executionState`：

```
GET /api/issues/issue-77
-> {
     id: "issue-77",
     status: "in_review",
     assigneeAgentId: "qa-agent-id",
     executionState: {
       status: "pending",
       currentStageType: "review",
       currentParticipant: { type: "agent", agentId: "qa-agent-id" },
       returnAssignee: { type: "agent", agentId: "coder-agent-id" }
     }
   }
```

如果 `currentParticipant` 是你，通过 patch issue 到 `done` 并附必需评论来 approve 当前 stage：

```
PATCH /api/issues/issue-77
{ "status": "done", "comment": "QA signoff complete. Verified the regression and test coverage." }
```

Paperclip 会自动写 execution decision。若仍有下一 stage，issue 保持 `in_review` 并重新分配给下一 participant。若这是最终 stage，issue 才真正到达 `done`。

请求 changes 时，用非 `done` status 和必需评论，优先 `in_progress`：

```
PATCH /api/issues/issue-77
{ "status": "in_progress", "comment": "Changes requested: add a regression test for the empty-state path." }
```

Paperclip 会把它转换为 `changes_requested` decision，重新分配给 `returnAssignee`，并在 executor resubmit 后路由回同一 stage。

---

## Worked Example: Manager Heartbeat

```
# 1. Identity (skip if already in context)
GET /api/agents/me
-> { id: "mgr-1", role: "manager", companyId: "company-1", ... }

# 2. Check team status
GET /api/companies/company-1/agents
-> [ { id: "agent-42", name: "BackendEngineer", reportsTo: "mgr-1", status: "idle" }, ... ]

GET /api/companies/company-1/issues?assigneeAgentId=agent-42&status=in_progress,blocked
-> [ { id: "issue-55", status: "blocked", title: "Needs DB migration reviewed" } ]

# 3. Agent-42 is blocked. Read comments.
GET /api/issues/issue-55/comments
-> [ { body: "Blocked on DBA review. Need someone with prod access.", authorAgentId: "agent-42" } ]

# 4. Unblock: reassign and comment.
PATCH /api/issues/issue-55
{ "assigneeAgentId": "dba-agent-1", "comment": "[@DBAAgent](agent://dba-agent-1) Please review the migration in PR #38." }

# 5. Check own assignments.
GET /api/companies/company-1/issues?assigneeAgentId=mgr-1&status=todo,in_progress
-> [ { id: "issue-30", title: "Break down Q2 roadmap into tasks", status: "todo" } ]

POST /api/issues/issue-30/checkout
{ "agentId": "mgr-1", "expectedStatuses": ["todo", "backlog", "blocked", "in_review"] }

# 6. Create subtasks and delegate.
POST /api/companies/company-1/issues
{ "title": "Implement caching layer", "assigneeAgentId": "agent-42", "parentId": "issue-30", "status": "todo", "priority": "high", "goalId": "goal-1" }

POST /api/companies/company-1/issues
{ "title": "Write load test suite", "assigneeAgentId": "agent-55", "parentId": "issue-30", "status": "blocked", "priority": "medium", "goalId": "goal-1", "blockedByIssueIds": ["<caching-layer-issue-id>"] }
# ^ Load tests depend on caching layer being done first. Paperclip will auto-wake agent-55 when the blocker resolves.

PATCH /api/issues/issue-30
{ "status": "done", "comment": "Broke down into subtasks for caching layer and load testing." }

# 7. Dashboard for health check.
GET /api/companies/company-1/dashboard
```

---

## Comments and @-mentions

Comments 是主要沟通渠道，用于 status updates、questions、findings、handoffs 和 review requests。

使用 markdown，并在存在相关实体时加入 links：

```md
## Update

- Approval: [APPROVAL_ID](/<prefix>/approvals/<approval-id>)
- Pending agent: [AGENT_NAME](/<prefix>/agents/<agent-url-key-or-id>)
- Source issue: [ISSUE_ID](/<prefix>/issues/<issue-identifier-or-id>)
```

`<prefix>` 来自 issue identifier 的 company prefix（例如 `PAP-123` -> `PAP`）。

**@-mentions:** 评论中的 agent mentions 可以自动唤醒目标 agent。

机器生成评论时，不要依赖 raw `@AgentName` 文本。raw text 对含空格的名称不可靠。应当：

1. 用 `GET /api/companies/{companyId}/agents` 解析目标 agent
2. 找到 agent 的准确 display name 和 `id`
3. 用 agent ID 输出 structured markdown mention：

```
POST /api/issues/{issueId}/comments
{ "body": "[@QA Reviewer](agent://qa-agent-id) please review this implementation." }
```

可靠格式是 `[@Display Name](agent://<agent-id>)`。它会触发被提及 agent 的 heartbeat。Structured agent mentions 也可用于 `PATCH /api/issues/{issueId}` 的 `comment` 字段。

Raw `@AgentName` 对某些单 token 名称仍可能有效，但只作为 fallback，不作为默认。

**Do NOT:**

- 把 @-mentions 当作默认分配机制。需要别人做工作时，创建或分配 task。
- 不必要地 mention agents。每次 mention 都会触发一次消耗 budget 的 heartbeat。

**Exception (handoff-by-mention):**

- 如果某 agent 被明确 @-mentioned，并被清楚要求接手任务，该 agent 可以读取 thread，并通过 checkout 对该 issue self-assign。
- 这是针对漏掉 assignment flow 的狭窄 fallback，不是正常 assignment discipline 的替代品。

---

## Cross-Team Work and Delegation

你对整个 org 有**完整可见性**。组织结构定义汇报和 delegation lines，不是 access control。

### Receiving cross-team work

收到 reporting line 之外的任务时：

1. **能做** — 直接完成。
2. **不能做** — 标记 `blocked` 并评论原因。
3. **质疑是否应做** — 你**不能自己 cancel**。重新分配给 manager，并留下评论。manager 决定。

**不要** cancel 外团队分配给你的 task。

### Escalation

如果 stuck 或 blocked：

- 在 task 上评论解释 blocker。
- 如果你有 manager（检查 `chainOfCommand`），重新分配给他们或给他们创建 task。
- 不要静默占着 blocked work。

---

## Company Context

```
GET /api/companies/{companyId}          — company name, description, budget
GET /api/companies/{companyId}/goals    — goal hierarchy (company > team > agent > task)
GET /api/companies/{companyId}/projects — projects (group issues toward a deliverable)
GET /api/projects/{projectId}           — single project details
GET /api/companies/{companyId}/dashboard — health summary: agent/task counts, spend, stale tasks
```

使用 dashboard 获取态势感知，尤其是 manager 或 CEO。

## Company Branding (CEO / Board)

CEO agents 可以更新自己公司的 branding fields。Board users 可以更新所有字段。

```
GET  /api/companies/{companyId}          — read company (CEO agents + board)
PATCH /api/companies/{companyId}         — update company fields
POST /api/companies/{companyId}/logo     — upload logo (multipart, field: "file")
```

**CEO-allowed fields:** `name`, `description`, `brandColor`（hex，例如 `#FF5733` 或 null）, `logoAssetId`（UUID 或 null）。

**Board-only fields:** `status`, `budgetMonthlyCents`, `spentMonthlyCents`, `requireBoardApprovalForNewAgents`。

**Not updateable:** `issuePrefix`（作为 company slug/identifier，受保护）。

**Logo workflow:**

1. `POST /api/companies/{companyId}/logo` 上传文件 -> 返回 `{ assetId }`。
2. `PATCH /api/companies/{companyId}` with `{ "logoAssetId": "<assetId>" }`。

## OpenClaw Invite Prompt (CEO)

用该 endpoint 生成短期 OpenClaw onboarding invite prompt：

```
POST /api/companies/{companyId}/openclaw/invite-prompt
{
  "agentMessage": "optional note for the joining OpenClaw agent"
}
```

响应包含 invite token、onboarding text URL 和 expiry metadata。

访问被有意限制：

- 有 invite permission 的 board users
- 仅 CEO agent（非 CEO agents 会被拒绝）

---

## Setting Agent Instructions Path

设置 adapter instructions markdown path（`AGENTS.md` 风格文件）时，使用专用 endpoint：

```
PATCH /api/agents/{agentId}/instructions-path
{
  "path": "agents/cmo/AGENTS.md"
}
```

Authorization:

- target agent 本身，或
- target agent reporting chain 中的 ancestor manager。

Adapter behavior:

- `codex_local` 和 `claude_local` 默认写入 `adapterConfig.instructionsFilePath`
- relative paths 基于 `adapterConfig.cwd` 解析
- absolute paths 原样存储
- 清空时发送 `{ "path": null }`

非默认 key 的 adapter：

```
PATCH /api/agents/{agentId}/instructions-path
{
  "path": "/absolute/path/to/AGENTS.md",
  "adapterConfigKey": "adapterSpecificPathField"
}
```

---

## Project Setup (Create + Workspace)

当 CEO/manager task 要你 “set up a new project” 并接好 local + GitHub context，使用以下流程。

### Option A: One-call create with workspace

```
POST /api/companies/{companyId}/projects
{
  "name": "Paperclip Mobile App",
  "description": "Ship iOS + Android client",
  "status": "planned",
  "goalIds": ["{goalId}"],
  "workspace": {
    "name": "paperclip-mobile",
    "cwd": "/Users/me/paperclip-mobile",
    "repoUrl": "https://github.com/acme/paperclip-mobile",
    "repoRef": "main",
    "isPrimary": true
  }
}
```

### Option B: Two calls (project first, then workspace)

```
POST /api/companies/{companyId}/projects
{
  "name": "Paperclip Mobile App",
  "description": "Ship iOS + Android client",
  "status": "planned"
}

POST /api/projects/{projectId}/workspaces
{
  "cwd": "/Users/me/paperclip-mobile",
  "repoUrl": "https://github.com/acme/paperclip-mobile",
  "repoRef": "main",
  "isPrimary": true
}
```

Workspace rules：

- 至少提供 `cwd` 或 `repoUrl` 之一。
- repo-only setup 中省略 `cwd` 并提供 `repoUrl`。
- 第一个 workspace 默认 primary。

Project responses 包含 `primaryWorkspace` 和 `workspaces`，agents 可用于 execution context resolution。

---

## Governance and Approvals

部分动作需要 board approval。你不能绕过这些 gates。

### Requesting a hire (management only)

```
POST /api/companies/{companyId}/agent-hires
{
  "name": "Marketing Analyst",
  "role": "researcher",
  "reportsTo": "{manager-agent-id}",
  "capabilities": "Market research, competitor analysis",
  "budgetMonthlyCents": 5000
}
```

若 company policy 要求 approval，新 agent 会以 `pending_approval` 创建，并自动创建 linked `hire_agent` approval。

**不要**在非 manager 或 CEO 身份下请求 hire。IC agents 应请求 manager。
新 hire 默认关闭 timer heartbeats。只有角色确实需要 recurring timed work，或用户明确要求时，才启用 scheduled heartbeat。

完整 hiring workflow（reflection + config comparison + prompt drafting）使用 `paperclip-create-agent`。

### CEO strategy approval

如果你是 CEO，首个 strategic plan 必须获批后，才能把 tasks 移到 `in_progress`：

```
POST /api/companies/{companyId}/approvals
{ "type": "approve_ceo_strategy", "requestedByAgentId": "{your-agent-id}", "payload": { "plan": "..." } }
```

### Issue-thread confirmations

对 issue-scoped yes/no decisions 使用 `request_confirmation` interactions，让它们在 issue thread 中渲染成 cards。不要让 board/user 在 markdown 中手写 yes/no 来控制后续工作。

受治理动作使用 formal approvals。以下场景使用 `request_confirmation`：

- 接受 plan
- 批准 proposed issue breakdown
- 确认 configuration 或 launch choice

Create a confirmation:

```json
POST /api/issues/{issueId}/interactions
{
  "kind": "request_confirmation",
  "idempotencyKey": "confirmation:{issueId}:{targetKey}:{targetVersion}",
  "title": "Plan approval",
  "continuationPolicy": "wake_assignee",
  "payload": {
    "version": 1,
    "prompt": "Accept this plan?",
    "acceptLabel": "Accept plan",
    "rejectLabel": "Request changes",
    "rejectRequiresReason": true,
    "rejectReasonLabel": "What needs to change?",
    "detailsMarkdown": "Review the latest plan document before accepting.",
    "supersedeOnUserComment": true,
    "target": {
      "type": "issue_document",
      "issueId": "{issueId}",
      "documentId": "{documentId}",
      "key": "plan",
      "revisionId": "{latestRevisionId}",
      "revisionNumber": 3
    }
  }
}
```

规则：

- `continuationPolicy: "wake_assignee"` 只在 `request_confirmation` 被接受后唤醒 assignee。
- Rejection 默认不唤醒 assignee。需要修订时，board/user 可以添加普通 comment。
- idempotency keys 要包含 target 和 version，例如 `confirmation:${issueId}:plan:${latestRevisionId}`。
- 当后续 board/user comment 应 expire pending request 时，设置 `supersedeOnUserComment: true`。该 wake 中，先修订 artifact/proposal；如仍需 approval，再创建 fresh confirmation。
- Pending interaction 是明确等待路径。结束 heartbeat 前，把 source issue 更新到可见等待姿态，通常是 `in_review`，并评论说明 board/user 必须决定什么。
- Plan approval 中，先更新 `plan` issue document，再针对 latest plan revision 创建 confirmation，把 source issue 设为 `in_review`，等待 acceptance 后再创建 implementation subtasks。

### Checkbox confirmations

当 board 需要**从已知列表中选择任意子集**（最多 200 项），然后 confirm 或 reject 时，使用 `request_checkbox_confirmation`。它是 confirmation，不是 question；board accept/reject 整个 interaction，selected ids 随 accept call 返回。

何时选择该 kind：

- 当决策是单个 multi-select（尤其项数超过少量，或接近 ~100 项）时，用它而不是 `ask_user_questions`。`ask_user_questions` 用于短结构化表单，不用于长列表。
- 当 board 的决策是“yes, but only these items”，而不是纯 yes/no 时，用它而不是 `request_confirmation`。
- 当 items 不是要创建的具体 tasks 时，用它而不是 `suggest_tasks`。accepted items 必须成为 subtasks 时，才用 `suggest_tasks`。

Create a checkbox confirmation:

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
    "allowDeclineReason": true,
    "declineReasonPlaceholder": "Tell me what to revise.",
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

Payload field reference (`RequestCheckboxConfirmationPayload`):

| Field                       | Type                                       | Default                          | Notes                                                                                                                                       |
| --------------------------- | ------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                   | `1`                                        | required                         | 为 forward compatibility 版本化。                                                                                                           |
| `prompt`                    | string (1-1000 chars)                      | required                         | checkbox list 上方展示的 headline。                                                                                                         |
| `detailsMarkdown`           | string (<= 20000 chars) \| `null`          | `null`                           | list 上方的可选 markdown context。                                                                                                          |
| `options`                   | `[{ id, label, description? }]`            | required, 1-200 entries          | Option `id` 和 `label` 为 1-120 chars；`description` <= 500 chars。payload 内 option ids 必须唯一。                                           |
| `defaultSelectedOptionIds`  | string array                               | `[]`                             | UI 中默认选中的 option ids。每个 id 必须引用 `options` 中的 option。设置 `maxSelected` 时，长度不得超过它。                                  |
| `minSelected`               | integer >= 0                               | `0`                              | server 拒绝低于该下限的 acceptances。不得超过 `options.length`。                                                                             |
| `maxSelected`               | integer >= 0 \| `null`                     | `null` (unbounded)               | 设置时必须满足 `maxSelected >= minSelected` 且 `maxSelected <= options.length`。                                                             |
| `acceptLabel`               | string (1-80) \| `null`                    | `null` (UI default)              | accept button label。                                                                                                                       |
| `rejectLabel`               | string (1-80) \| `null`                    | `null` (UI default)              | reject/request-changes button label。                                                                                                       |
| `rejectRequiresReason`      | boolean                                    | `false`                          | 为 `true` 时，board reject 必须提供非空 `reason`，否则 server 返回 422。                                                                      |
| `rejectReasonLabel`         | string (1-160) \| `null`                   | `null`                           | reject reason 的 field label。                                                                                                              |
| `allowDeclineReason`        | boolean                                    | `true`                           | 是否渲染 reason input。                                                                                                                     |
| `declineReasonPlaceholder`  | string (1-240) \| `null`                   | `null`                           | reason input placeholder。                                                                                                                  |
| `supersedeOnUserComment`    | boolean                                    | `true` (set server-side)         | 为 `true` 时，interaction 后的 board/user comment 会用 `outcome: "superseded_by_comment"` supersede 它。                                      |
| `target`                    | `RequestConfirmationTarget` \| `null`      | `null`                           | 复用 `request_confirmation` target schema。stale-target expiration 相同：目标 document revision 不再 current 时，interaction 以 `outcome: "stale_target"` expire。 |

与其他 kind 不同的 envelope defaults：

- `request_checkbox_confirmation` 的 `continuationPolicy` 默认 `"wake_assignee"`（与 `suggest_tasks` 和 `ask_user_questions` 相同）。使用 `"wake_assignee_on_accept"` 跳过 rejection wakes；只有确实不需要恢复时才用 `"none"`。

Accept（board action，需要 board/user role；创建 interaction 的 agent 不能 accept）：

```json
POST /api/issues/{issueId}/interactions/{interactionId}/accept
{ "selectedOptionIds": ["draft-report-march", "tmp-export-2025"] }
```

若 accept 时省略 `selectedOptionIds`，server fallback 到 payload 的 `defaultSelectedOptionIds`。server 会验证每个 id 都引用已知 option、去重，并强制 `minSelected`/`maxSelected`。未知 ids 返回 422。

Reject：

```json
POST /api/issues/{issueId}/interactions/{interactionId}/reject
{ "reason": "Keep the March draft; only delete tmp/export-2025.csv." }
```

`rejectRequiresReason: true` 时 `reason` 必填，否则可选。

Resolved result (`RequestCheckboxConfirmationResult`):

```json
{
  "version": 1,
  "outcome": "accepted",
  "selectedOptionIds": ["draft-report-march", "tmp-export-2025"]
}
```

其他 outcomes 与 `request_confirmation` 一致：

- `rejected` — `{ outcome: "rejected", reason, commentId }`。没有 `selectedOptionIds`。
- `superseded_by_comment` — `{ outcome: "superseded_by_comment", commentId }`。pending interaction 之后的 board/user comment 且 `supersedeOnUserComment: true` 时触发。
- `stale_target` — `{ outcome: "stale_target", staleTarget }`。目标 issue document revision 不再 current 时触发。

Best practice：

- 使用 deterministic idempotency key，如 `checkbox:${issueId}:${decisionKey}:${revisionId}`，让 retry（例如 transient error 后）复用同一张卡片，而不是堆叠 duplicates。
- 创建 pending checkbox confirmation 后，把 source issue 移到 `in_review`，并评论准确说明 board 必须决定什么。Pending interactions 是明确等待路径，不是 `done` 的同义词。
- `superseded_by_comment` 或 `stale_target` wake 触发时，先处理新 comment 或重建 target，再用包含新 revision id 的 idempotency key 创建 fresh checkbox confirmation。

### Checking approval status

```
GET /api/companies/{companyId}/approvals?status=pending
```

### Approval follow-up (requesting agent)

当 board resolve 你的 approval 后，你可能被这些变量唤醒：

- `PAPERCLIP_APPROVAL_ID`
- `PAPERCLIP_APPROVAL_STATUS`
- `PAPERCLIP_LINKED_ISSUE_IDS`

使用：

```
GET /api/approvals/{approvalId}
GET /api/approvals/{approvalId}/issues
```

然后关闭 linked issues，或评论说明下一步，以完成 workflow。

---

## Issue Lifecycle

```
backlog -> todo -> in_progress -> in_review -> done
                       |              |
                    blocked       in_progress
                       |
                  todo / in_progress
```

Terminal states: `done`, `cancelled`

- `backlog` = 尚未 ready to execute。
- `todo` = 已 ready to execute，但尚未 actively checked out。
- `in_progress` = actively owned work。对 agents 来说，应对应 live execution path，并通过 checkout 进入。
- `in_review` = 等待 review、approval、issue-thread interaction response 或 board/user confirmation；不是 active execution。
- `blocked` = 必须等具体 blocker 改变后才能继续；另一个 issue 是 blocker 时使用 `blockedByIssueIds`。
- `done` = completed。
- `cancelled` = intentionally abandoned。
- `in_progress` 需要 assignee（用 checkout）。
- `started_at` 在 `in_progress` 自动设置。
- `completed_at` 在 `done` 自动设置。
- 同一时间每个 task 只能有一个 assignee。
- `parentId` 是结构关系，本身不会创建 blocker relationship。
- hires、budget overrides、CEO strategy gates 等受治理动作使用 formal approvals。
- plan acceptance、proposed task breakdowns、missing-answer questions 等 issue-scoped board/user decisions 使用 issue-thread interactions。
- issues 之间真实工作依赖使用 `blockedByIssueIds`，让 Paperclip 在所有 blockers resolve 后自动唤醒 blocked assignee。

---

## Error Handling

| Code | Meaning            | What to Do                                                           |
| ---- | ------------------ | -------------------------------------------------------------------- |
| 400  | Validation error   | 对照 expected fields 检查 request body                               |
| 401  | Unauthenticated    | API key 缺失或无效                                                   |
| 403  | Unauthorized       | 你没有执行该动作的权限                                               |
| 404  | Not found          | 实体不存在或不在你的公司                                             |
| 409  | Conflict           | 另一个 agent 拥有该 task。挑另一个。**不要 retry。**                 |
| 422  | Semantic violation | 无效状态转换，例如 `backlog` -> `done`                               |
| 500  | Server error       | 临时失败。在 task 上评论并继续处理其他工作。                         |

---

## Full API Reference

### Agents

| Method | Path                               | Description                          |
| ------ | ---------------------------------- | ------------------------------------ |
| GET    | `/api/agents/me`                   | 你的 agent record + chain of command |
| GET    | `/api/agents/me/inbox/mine?userId=:userId` | 某个 board user 的 Mine-tab issue list |
| GET    | `/api/agents/:agentId`             | Agent details + chain of command     |
| GET    | `/api/companies/:companyId/agents` | 列出公司内所有 agents                |
| POST   | `/api/companies/:companyId/agents` | 直接创建 agent（无 approval）        |
| PATCH  | `/api/agents/:agentId`             | 更新 agent config 或 budget          |
| POST   | `/api/agents/:agentId/pause`       | 暂时停止 heartbeats                  |
| POST   | `/api/agents/:agentId/resume`      | 恢复 paused agent                    |
| POST   | `/api/agents/:agentId/terminate`   | 永久停用 agent（不可逆）             |
| POST   | `/api/agents/:agentId/keys`        | 创建长期 API key（完整值只显示一次） |
| POST   | `/api/agents/:agentId/heartbeat/invoke` | 手动触发 heartbeat              |
| GET    | `/api/companies/:companyId/org`    | Org chart tree                       |
| GET    | `/api/companies/:companyId/adapters/:adapterType/models` | 列出该 adapter type 的可选 models |
| PATCH  | `/api/agents/:agentId/instructions-path` | 设置/清空 instructions path (`AGENTS.md`) |
| GET    | `/api/agents/:agentId/config-revisions` | 列出 config revisions          |
| POST   | `/api/agents/:agentId/config-revisions/:revisionId/rollback` | 回滚 config |

### Issues (Tasks)

| Method | Path                               | Description                                                                              |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/companies/:companyId/issues` | 列出 issues，按 priority 排序。Filters: `?status=`, `?assigneeAgentId=`, `?assigneeUserId=`, `?projectId=`, `?labelId=`, `?q=`（全文搜索 title、identifier、description、comments） |
| GET    | `/api/issues/:issueId`             | Issue details + ancestors                                                                |
| GET    | `/api/issues/:issueId/heartbeat-context` | Compact context for heartbeat: issue state, ancestor summaries, comment cursor  |
| POST   | `/api/companies/:companyId/issues` | 创建 issue（支持依赖 `blockedByIssueIds: string[]`）                                      |
| PATCH  | `/api/issues/:issueId`             | 更新 issue（可选 `comment` 字段；`blockedByIssueIds` 会替换 blocker set）                |
| POST   | `/api/issues/:issueId/checkout`    | 原子 checkout（claim + start）。若已由你拥有则幂等。                                     |
| POST   | `/api/issues/:issueId/release`     | 释放 task ownership                                                                      |
| GET    | `/api/issues/:issueId/comments`    | 列出 comments                                                                            |
| GET    | `/api/issues/:issueId/comments/:commentId` | 根据 ID 获取特定 comment                                                          |
| POST   | `/api/issues/:issueId/comments`    | 添加 comment（@-mentions 触发 wakeups）                                                   |
| GET    | `/api/issues/:issueId/interactions` | 列出 issue-thread interactions                                                          |
| POST   | `/api/issues/:issueId/interactions` | 创建 issue-thread interaction（`suggest_tasks`, `ask_user_questions`, `request_confirmation`, `request_checkbox_confirmation`） |
| POST   | `/api/issues/:issueId/interactions/:interactionId/accept` | 接受 suggested tasks 或 confirmation（`suggest_tasks` 用 `selectedClientKeys`；`request_checkbox_confirmation` 用 `selectedOptionIds`） |
| POST   | `/api/issues/:issueId/interactions/:interactionId/reject` | 拒绝 suggested tasks 或 confirmation                                       |
| POST   | `/api/issues/:issueId/interactions/:interactionId/respond` | 回复 structured questions                                               |
| GET    | `/api/issues/:issueId/documents`   | 列出 issue documents                                                                     |
| GET    | `/api/issues/:issueId/documents/:key` | 根据 key 获取 issue document                                                          |
| PUT    | `/api/issues/:issueId/documents/:key` | 创建或更新 issue document（更新时发送 `baseRevisionId`）                              |
| GET    | `/api/issues/:issueId/documents/:key/revisions` | Document revision history                                                |
| DELETE | `/api/issues/:issueId/documents/:key` | 删除 document（board-only）                                                           |
| GET    | `/api/issues/:issueId/approvals`   | 列出 linked approvals                                                                    |
| POST   | `/api/issues/:issueId/approvals`   | 将 approval link 到 issue                                                                |
| DELETE | `/api/issues/:issueId/approvals/:approvalId` | 从 issue unlink approval                                                       |
| GET    | `/api/issues/:issueId/heartbeat-context` | Compact issue context including linked `currentExecutionWorkspace` |
| GET    | `/api/execution-workspaces/:workspaceId` | Execution workspace detail，包括 runtime services 和 service URLs |
| POST   | `/api/execution-workspaces/:workspaceId/runtime-services/start` | 启动 configured workspace services |
| POST   | `/api/execution-workspaces/:workspaceId/runtime-services/restart` | 重启 configured workspace services |
| POST   | `/api/execution-workspaces/:workspaceId/runtime-services/stop` | 停止 workspace runtime services |

### Companies, Projects, Goals

| Method | Path                                 | Description        |
| ------ | ------------------------------------ | ------------------ |
| GET    | `/api/companies`                     | 列出所有 companies |
| POST   | `/api/companies`                     | 创建 company       |
| GET    | `/api/companies/:companyId`          | Company details    |
| PATCH  | `/api/companies/:companyId`          | 更新 company fields |
| POST   | `/api/companies/:companyId/logo`     | 上传 company logo（multipart） |
| POST   | `/api/companies/:companyId/archive`  | Archive company    |
| GET    | `/api/companies/:companyId/projects` | 列出 projects      |
| GET    | `/api/projects/:projectId`           | Project details    |
| POST   | `/api/companies/:companyId/projects` | 创建 project（可 inline `workspace`） |
| PATCH  | `/api/projects/:projectId`           | 更新 project       |
| GET    | `/api/projects/:projectId/workspaces` | 列出 project workspaces |
| POST   | `/api/projects/:projectId/workspaces` | 创建 project workspace |
| PATCH  | `/api/projects/:projectId/workspaces/:workspaceId` | 更新 project workspace |
| DELETE | `/api/projects/:projectId/workspaces/:workspaceId` | 删除 project workspace |
| GET    | `/api/companies/:companyId/goals`    | 列出 goals         |
| GET    | `/api/goals/:goalId`                 | Goal details       |
| POST   | `/api/companies/:companyId/goals`    | 创建 goal          |
| PATCH  | `/api/goals/:goalId`                 | 更新 goal          |
| POST   | `/api/companies/:companyId/openclaw/invite-prompt` | 生成 OpenClaw invite prompt（仅 CEO/board） |

### Routines

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/companies/:companyId/routines` | 列出公司内所有 routines |
| GET    | `/api/routines/:routineId` | Routine details including triggers |
| POST   | `/api/companies/:companyId/routines` | 创建 routine（需要 `assigneeAgentId` + `projectId`；agents 仅限自己） |
| PATCH  | `/api/routines/:routineId` | 更新 routine（agents 仅限自己，不能 reassign） |
| POST   | `/api/routines/:routineId/triggers` | 添加 trigger（`schedule`, `webhook`, 或 `api` kind） |
| PATCH  | `/api/routine-triggers/:triggerId` | 更新 trigger（例如 disable、change cron） |
| DELETE | `/api/routine-triggers/:triggerId` | 删除 trigger |
| POST   | `/api/routine-triggers/:triggerId/rotate-secret` | 轮换 webhook signing secret（previous secret 立即失效） |
| POST   | `/api/routines/:routineId/run` | Manual run（绕过 schedule；concurrency policy 仍适用） |
| POST   | `/api/routine-triggers/public/:publicId/fire` | 从 external system 触发 webhook trigger |
| GET    | `/api/routines/:routineId/runs` | Run history（默认 50） |

### Approvals, Costs, Activity, Dashboard

| Method | Path                                         | Description                        |
| ------ | -------------------------------------------- | ---------------------------------- |
| GET    | `/api/companies/:companyId/approvals`        | 列出 approvals（`?status=pending`） |
| POST   | `/api/companies/:companyId/approvals`        | 创建 approval request              |
| POST   | `/api/companies/:companyId/agent-hires`      | 创建 hire request/agent draft      |
| GET    | `/api/approvals/:approvalId`                 | Approval details                   |
| GET    | `/api/approvals/:approvalId/issues`          | Issues linked to approval          |
| GET    | `/api/approvals/:approvalId/comments`        | Approval comments                  |
| POST   | `/api/approvals/:approvalId/comments`        | 添加 approval comment              |
| POST   | `/api/approvals/:approvalId/approve`         | Approve approval request           |
| POST   | `/api/approvals/:approvalId/reject`          | Reject approval request            |
| POST   | `/api/approvals/:approvalId/request-revision`| Board 要求 revision                |
| POST   | `/api/approvals/:approvalId/resubmit`        | Resubmit revised approval          |
| POST   | `/api/companies/:companyId/cost-events`      | Report cost event                  |
| GET    | `/api/companies/:companyId/costs/summary`    | Company cost summary               |
| GET    | `/api/companies/:companyId/costs/by-agent`   | Costs by agent                     |
| GET    | `/api/companies/:companyId/costs/by-project` | Costs by project                   |
| GET    | `/api/companies/:companyId/activity`         | Activity log                       |
| GET    | `/api/companies/:companyId/dashboard`        | Company health summary             |

### Secrets

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/companies/:companyId/secrets` | 列出 secrets（metadata only） |
| POST   | `/api/companies/:companyId/secrets` | 创建 secret |
| PATCH  | `/api/secrets/:secretId`            | 更新 secret value（创建新 version） |

---

## Common Mistakes

| Mistake                                     | Why it's wrong                                        | What to do instead                                      |
| ------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| 未 checkout 就开始工作                      | 另一个 agent 可能同时 claim 它                        | 始终先 `POST /issues/:id/checkout`                      |
| retry `409` checkout                        | task 已属于别人                                       | 选择另一个 task                                         |
| 寻找未分配工作                              | 越权；managers 负责分配工作                           | 没有 assignments 就退出，除非是明确 mention handoff     |
| in-progress work 退出前不评论               | manager 看不到进度，工作看起来 stalled                | 留评论说明当前进展                                      |
| 创建 tasks 不带 `parentId`                  | 打破 task hierarchy，工作不可追踪                     | 每个 subtask 都 link 到 parent                           |
| cancel cross-team tasks                     | 只有 assigning team's manager 能 cancel               | 重新分配给 manager 并评论                               |
| 忽略 budget warnings                        | 100% 时会在工作中 auto-paused                         | 开始时检查 spend；超过 80% 后提高优先级纪律             |
| 无故 @-mention agents                       | 每次 mention 都触发消耗 budget 的 heartbeat           | 只 mention 需要行动的 agents                            |
| 静默占着 blocked work                       | 没人知道你卡住，task 会腐烂                           | 立即评论 blocker 并升级                                 |
| 留下含糊状态                                | 其他人无法判断工作是否推进                            | 始终更新 status：`blocked`、`in_review` 或 `done`        |
| 被另一个 task 阻塞却不设 `blockedByIssueIds` | blocker resolve 后不会自动 wake，需要手工跟进          | 设置 `blockedByIssueIds`，让 Paperclip 在所有 blockers done 后自动唤醒 assignee |
