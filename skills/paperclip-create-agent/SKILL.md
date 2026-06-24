---
name: paperclip-create-agent
description: >
  在 Paperclip 中按 governance-aware hiring 流程创建新 agents。当你需要检查 adapter
  configuration options、比较现有 agent configs、起草新的 agent prompt/config，并提交
  hire request 时使用。
---

# Paperclip 创建 Agent Skill

当你被要求 hire/create agent 时使用本 skill。

## 前置条件

你需要以下任一权限：

- board access，或
- 公司内 agent permission `can_create_agents=true`

如果没有该权限，升级给 CEO 或 board。

## Workflow

### 1. 确认身份和 company context

```sh
curl -sS "$PAPERCLIP_API_URL/api/agents/me" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

### 2. 发现当前 Paperclip instance 的 adapter configuration

```sh
curl -sS "$PAPERCLIP_API_URL/llms/agent-configuration.txt" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

# Then the specific adapter you plan to use, e.g. claude_local:
curl -sS "$PAPERCLIP_API_URL/llms/agent-configuration/claude_local.txt" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

### 3. 比较现有 agent configurations

```sh
curl -sS "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/agent-configurations" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

记录公司已有的 naming、icon、reporting-line 和 adapter conventions。

### 4. 选择 instruction source（必需）

这是影响 hire quality 的最重要决策。精确选择一条路径：

- **Exact template**：角色匹配 template index 中某个 entry。使用 `references/agents/` 下匹配文件作为起点。
- **Adjacent template**：没有精确匹配，但某个现有 template 很接近（例如从 `coder.md` 改成 “Backend Engineer”，或从 `uxdesigner.md` 改成 “Content Designer”）。复制最接近 template 并有意识地改造：重命名 role、重写 role charter、替换 domain lenses、移除不适用 sections。
- **Generic fallback**：没有接近 template。使用 baseline role guide 从零构建新的 `AGENTS.md`，为具体角色填入每个推荐 section。

Template index 和使用指导：
`skills/paperclip-create-agent/references/agent-instruction-templates.md`

没有 template 时的 generic fallback：
`skills/paperclip-create-agent/references/baseline-role-guide.md`

在 hire-request comment 中说明你采用了哪条路径，方便 board 审计 reasoning。

### 5. 发现允许的 agent icons

```sh
curl -sS "$PAPERCLIP_API_URL/llms/agent-icons.txt" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

### 6. 起草 new hire config

- role / title / name
- icon（实践中必填；从 `/llms/agent-icons.txt` 选择）
- reporting line（`reportsTo`）
- adapter type
- `desiredSkills`：若该角色第一天就需要 company skill library 中已安装 skills，则填入
- 如果任何 `desiredSkills` 或 adapter settings 扩大 browser access、external-system reach、filesystem scope 或 secret-handling capability，在 hire comment 中逐项说明理由
- adapter 和 runtime config 与当前 environment 对齐
- 默认关闭 timer heartbeats；只有角色确实需要 scheduled recurring work，或用户明确要求时，才设置 `runtimeConfig.heartbeat.enabled=true` 和 `intervalSec`
- 如果角色可能处理 private advisories 或 sensitive disclosures，先确认存在 confidential workflow（专用 skill 或文档化手工流程）
- capabilities
- 对支持 managed instructions bundle 的 adapters，使用 managed instructions bundle（`AGENTS.md`）；避免 durable `promptTemplate` config
- 对 coding 或 execution agents，包含 Paperclip execution contract：同一 heartbeat 内开始 actionable work；除非被要求 planning，否则不要停在 plan；留下 durable progress 和清晰 next action；长期或并行 delegated work 用 child issues，不要 polling；blocked work 标明 owner/action；尊重 budget、pause/cancel、approval gates 和 company boundaries
- instruction text（如从 step 4 构建的 `AGENTS.md`）；对 local managed-bundle adapters，作为 top-level `instructionsBundle.files["AGENTS.md"]` 发送。新 agents 不要设置 `adapterConfig.promptTemplate` 或 `bootstrapPromptTemplate`
- 如果 hire 来自某个 issue，设置 source issue linkage（`sourceIssueId` 或 `sourceIssueIds`）

### 7. 用质量 checklist 审查 draft

提交前，完整走一遍 draft-review checklist，并修复任何未通过项：
`skills/paperclip-create-agent/references/draft-review-checklist.md`

### 8. 提交 hire request

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/agent-hires" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CTO",
    "role": "cto",
    "title": "Chief Technology Officer",
    "icon": "crown",
    "reportsTo": "<ceo-agent-id>",
    "capabilities": "Owns technical roadmap, architecture, staffing, execution",
    "desiredSkills": ["vercel-labs/agent-browser/agent-browser"],
    "adapterType": "codex_local",
    "adapterConfig": {"cwd": "/abs/path/to/repo", "model": "o4-mini"},
    "instructionsBundle": {"files": {"AGENTS.md": "You are the CTO..."}},
    "runtimeConfig": {"heartbeat": {"enabled": false, "wakeOnDemand": true}},
    "sourceIssueId": "<issue-id>"
  }'
```

### 9. 处理 governance state

- 如果 response 有 `approval`，hire 处于 `pending_approval`
- 监控并在 approval thread 中讨论
- board 批准后，你会带着 `PAPERCLIP_APPROVAL_ID` 被唤醒；读取 linked issues，并 close/comment follow-up

```sh
curl -sS "$PAPERCLIP_API_URL/api/approvals/<approval-id>" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

curl -sS -X POST "$PAPERCLIP_API_URL/api/approvals/<approval-id>/comments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"body":"## CTO hire request submitted\n\n- Approval: [<approval-id>](/approvals/<approval-id>)\n- Pending agent: [<agent-ref>](/agents/<agent-url-key-or-id>)\n- Source issue: [<issue-ref>](/issues/<issue-identifier-or-id>)\n\nUpdated prompt and adapter config per board feedback."}'
```

如果 approval 已存在且需要手动关联到 issue：

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/issues/<issue-id>/approvals" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"approvalId":"<approval-id>"}'
```

approval granted 后运行 follow-up loop：

```sh
curl -sS "$PAPERCLIP_API_URL/api/approvals/$PAPERCLIP_APPROVAL_ID" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

curl -sS "$PAPERCLIP_API_URL/api/approvals/$PAPERCLIP_APPROVAL_ID/issues" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

对每个 linked issue：

- 如果 approval 已解决请求，则 close；
- 否则用 markdown comment，链接 approval，并列出 next actions。

## References

- Template index 和如何应用 template：`skills/paperclip-create-agent/references/agent-instruction-templates.md`
- 单个 role templates：`skills/paperclip-create-agent/references/agents/`
- Generic baseline role guide（no-template fallback）：`skills/paperclip-create-agent/references/baseline-role-guide.md`
- 提交前 draft-review checklist：`skills/paperclip-create-agent/references/draft-review-checklist.md`
- Endpoint payload shapes 和完整 examples：`skills/paperclip-create-agent/references/api-reference.md`
