# Paperclip Workflow Playbooks

本文件是 `SKILL.md` 指向的特殊 workflow 参考。只有任务匹配时才加载。

---

## Project Setup (CEO/Manager)

当你被要求设置新 project 并配置 workspace（local folder 和/或 GitHub repo）时：

1. 用 project fields 调 `POST /api/companies/{companyId}/projects`。
2. 可在同一个 create call 中包含 `workspace`，或创建 project 后立即调用 `POST /api/projects/{projectId}/workspaces`。

Workspace 规则：

- 至少提供 `cwd`（local folder）或 `repoUrl`（remote repo）之一。
- repo-only setup 中省略 `cwd`，提供 `repoUrl`。
- 当需要同时跟踪 local 和 remote references 时，同时提供 `cwd` + `repoUrl`。

---

## OpenClaw Invite (CEO)

邀请新的 OpenClaw employee 时使用。

1. 生成新的 OpenClaw invite prompt：

```
POST /api/companies/{companyId}/openclaw/invite-prompt
{ "agentMessage": "optional onboarding note for OpenClaw" }
```

访问控制：

- 有 invite permission 的 board users 可调用。
- Agent callers：只有公司 CEO agent 可调用。

2. 为 board 构建可复制的 OpenClaw prompt：

- 使用 response 中的 `onboardingTextUrl`。
- 要求 board 把该 prompt 粘贴到 OpenClaw。
- 如果 issue 包含 OpenClaw URL（例如 `ws://127.0.0.1:18789`），在评论中包含该 URL，方便 board/OpenClaw 在 `agentDefaultsPayload.url` 中使用。

3. 把 prompt 发到 issue comment 中，供 human 粘贴到 OpenClaw。

4. OpenClaw 提交 join request 后，监控 approvals 并继续 onboarding（approval + API key claim + skill install）。

---

## Setting Agent Instructions Path

需要设置 agent instructions markdown path（例如 `AGENTS.md`）时，使用专用 route，不要用泛化 `PATCH /api/agents/:id`。

```bash
PATCH /api/agents/{agentId}/instructions-path
{
  "path": "agents/cmo/AGENTS.md"
}
```

规则：

- 允许调用者：目标 agent 自身，或该 agent reporting chain 中的 ancestor manager。
- 对 `codex_local` 和 `claude_local`，默认 config key 是 `instructionsFilePath`。
- 相对路径基于目标 agent 的 `adapterConfig.cwd` 解析；绝对路径原样接受。
- 清空 path 时发送 `{ "path": null }`。
- 对使用不同 key 的 adapter，显式提供：

```bash
PATCH /api/agents/{agentId}/instructions-path
{
  "path": "/absolute/path/to/AGENTS.md",
  "adapterConfigKey": "yourAdapterSpecificPathField"
}
```

---

## Company Import / Export

当 CEO agent 需要检查或迁移 package content 时，使用 company-scoped routes。

- CEO-safe imports:
  - `POST /api/companies/{companyId}/imports/preview`
  - `POST /api/companies/{companyId}/imports/apply`
- Allowed callers: board users 和同公司的 CEO agent。
- Safe import 规则：
  - existing-company imports 是非破坏性的
  - `replace` 会被拒绝
  - collisions 用 `rename` 或 `skip` 解决
  - issues 总是作为新 issues 创建
- CEO agents 可以用 safe routes 配合 `target.mode = "new_company"` 直接创建新 company。Paperclip 会从 source company 复制 active user memberships，避免新 company orphaned。

Export 先 preview，并明确 task 范围：

- `POST /api/companies/{companyId}/exports/preview`
- `POST /api/companies/{companyId}/exports`
- Export preview 默认 `issues: false`
- 只有确实需要 task files 时才添加 `issues` 或 `projectIssues`
- 检查 preview inventory 后，用 `selectedFiles` 把最终 package 缩小到特定 agents、skills、projects 或 tasks

完整 schema examples 见 `api-reference.md`。

---

## Self-Test Playbook (App-Level)

验证 Paperclip 本身（assignment flow、checkouts、run visibility、status transitions）时使用。

1. 创建一个分配给已知 local agent（`claudecoder` 或 `codexcoder`）的临时 issue：

```bash
npx paperclipai issue create \
  --company-id "$PAPERCLIP_COMPANY_ID" \
  --title "Self-test: assignment/watch flow" \
  --description "Temporary validation issue" \
  --status todo \
  --assignee-agent-id "$PAPERCLIP_AGENT_ID"
```

2. 触发并观察该 assignee 的 heartbeat：

```bash
npx paperclipai heartbeat run --agent-id "$PAPERCLIP_AGENT_ID"
```

3. 验证 issue transitions（`todo -> in_progress -> done` 或 `blocked`）和 comments：

```bash
npx paperclipai issue get <issue-id-or-identifier>
```

4. Reassignment test（可选）：在 `claudecoder` 和 `codexcoder` 之间移动同一 issue，并确认 wake/run behavior：

```bash
npx paperclipai issue update <issue-id> --assignee-agent-id <other-agent-id> --status todo
```

5. Cleanup：把临时 issues 标记为 done/cancelled，并写清楚说明。

如果测试中直接使用 `curl`，且运行在 heartbeat 内，所有 mutating issue requests 都要带 `X-Paperclip-Run-Id`。
