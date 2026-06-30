# Paperclip Create Agent API 参考

## 核心端点

- `GET /llms/agent-configuration.txt`
- `GET /llms/agent-configuration/:adapterType.txt`
- `GET /llms/agent-icons.txt`
- `GET /api/companies/:companyId/agent-configurations`
- `GET /api/companies/:companyId/skills`
- `POST /api/companies/:companyId/skills/import`
- `GET /api/agents/:agentId/configuration`
- `POST /api/agents/:agentId/skills/sync`
- `POST /api/companies/:companyId/agent-hires`
- `POST /api/companies/:companyId/agents`
- `GET /api/agents/:agentId/config-revisions`
- `POST /api/agents/:agentId/config-revisions/:revisionId/rollback`
- `POST /api/issues/:issueId/approvals`
- `GET /api/approvals/:approvalId/issues`

审批协作：

- `GET /api/approvals/:approvalId`
- `POST /api/approvals/:approvalId/request-revision`（board）
- `POST /api/approvals/:approvalId/resubmit`
- `GET /api/approvals/:approvalId/comments`
- `POST /api/approvals/:approvalId/comments`
- `GET /api/approvals/:approvalId/issues`

## `POST /api/companies/:companyId/agent-hires`

请求体与 agent create shape 一致：

```json
{
  "name": "CTO",
  "role": "cto",
  "title": "Chief Technology Officer",
  "icon": "crown",
  "reportsTo": "uuid-or-null",
  "capabilities": "负责架构把关和工程交付协调。",
  "desiredSkills": ["vercel-labs/agent-browser/agent-browser"],
  "adapterType": "claude_local",
  "adapterConfig": {
    "cwd": "/absolute/path",
    "model": "claude-sonnet-4-5-20250929"
  },
  "instructionsBundle": {
    "entryFile": "AGENTS.md",
    "files": {
      "AGENTS.md": "你是 CTO。..."
    }
  },
  "runtimeConfig": {
    "heartbeat": {
      "enabled": false,
      "wakeOnDemand": true
    }
  },
  "budgetMonthlyCents": 0,
  "sourceIssueId": "uuid-or-null",
  "sourceIssueIds": ["uuid-1", "uuid-2"]
}
```

响应：

```json
{
  "agent": {
    "id": "uuid",
    "status": "pending_approval"
  },
  "approval": {
    "id": "uuid",
    "type": "hire_agent",
    "status": "pending",
    "payload": {
      "desiredSkills": ["vercel-labs/agent-browser/agent-browser"]
    }
  }
}
```

如果公司设置关闭了强制审批，`approval` 为 `null`，智能体会直接以 `idle` 状态创建。

`desiredSkills` 接受公司 skill id、canonical key 或唯一 slug。服务器会解析并存储 canonical company skill key。
默认关闭 timer heartbeat。只有角色确实需要按计划重复工作，或用户明确要求时，才设置 `runtimeConfig.heartbeat.enabled=true` 并包含 `intervalSec`。

## 审批生命周期

状态：

- `pending`
- `revision_requested`
- `approved`
- `rejected`
- `cancelled`

对 hire approvals：

- approved：关联智能体从 `pending_approval` 转为 `idle`
- rejected：关联智能体被终止

## 安全说明

- config 读取 API 会遮蔽明显 secret。
- `pending_approval` 智能体不能运行 heartbeat、接收分配或创建 key。
- 所有动作都会写入 activity，便于审计。
- issue / approval 评论使用 markdown，并包含 approval、agent、source issue 链接。
- 审批决议后，请求人可能被带着 `PAPERCLIP_APPROVAL_ID` 唤醒，并应同步处理关联 issues。
