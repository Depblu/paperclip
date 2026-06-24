# Paperclip Routines

Routines 是周期性任务。每次 routine 触发时，都会创建一个分配给 routine agent 的 execution issue；该 agent 会按常规 heartbeat flow 处理。

一个 routine 包含：

- 一个 assigned agent 和一个 project
- 一个或多个 triggers（`schedule`、`webhook` 或 `api`）
- concurrency policy：上一次 run 仍 active 时怎么处理
- catch-up policy：错过 scheduled runs 时怎么处理

**Authorization:** Agents 可以读取同公司所有 routines，但只能创建或管理分配给自己的 routines。Board operators 拥有完整访问权，包括 reassignment。

---

## Lifecycle

```
active <-> paused
active  -> archived  (terminal — cannot be reactivated)
```

Paused routines 不会触发。Archived routines 不会触发，也不能 unarchive。

---

## Creating a Routine

```
POST /api/companies/{companyId}/routines
{
  "title": "Weekly CEO briefing",
  "description": "Compile status report and post to Slack",
  "assigneeAgentId": "{agentId}",
  "projectId": "{projectId}",
  "goalId": "{goalId}",           // optional
  "parentIssueId": "{issueId}",   // optional — parent for run issues
  "priority": "medium",
  "status": "active",
  "concurrencyPolicy": "coalesce_if_active",
  "catchUpPolicy": "skip_missed"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `title` | yes | 最多 200 chars |
| `description` | no | routine 的人类可读说明 |
| `assigneeAgentId` | yes | Agents：必须是自己 |
| `projectId` | yes | |
| `goalId` | no | run issues 会继承 |
| `parentIssueId` | no | run issues 会成为该 issue 的 children |
| `priority` | no | `critical` `high` `medium`（默认）`low` |
| `status` | no | `active`（默认）`paused` `archived` |
| `concurrencyPolicy` | no | 见下文 |
| `catchUpPolicy` | no | 见下文 |

---

## Concurrency Policies

控制 trigger 触发时，如果上一个 run issue 仍 open 或 active，要如何处理。

| Policy | Behaviour |
|--------|-----------|
| `coalesce_if_active` **(default)** | 新 run 标记为 `coalesced` 并链接到现有 active run，不创建新 issue |
| `skip_if_active` | 新 run 标记为 `skipped` 并链接到现有 active run，不创建新 issue |
| `always_enqueue` | 无论 active runs 如何，都创建新 issue |

---

## Catch-Up Policies

控制错过的 scheduled runs 怎么处理，例如 server downtime 期间的 runs。

| Policy | Behaviour |
|--------|-----------|
| `skip_missed` **(default)** | 丢弃 missed runs |
| `enqueue_missed_with_cap` | 入队 missed runs，最多 25 个 |

---

## Adding Triggers

一个 routine 可以有多个不同 kind 的 triggers。

所有 trigger kinds 都接受可选 `label` 字段（最多 120 chars），用于区分同一 routine 上多个同 kind trigger。

```
POST /api/routines/{routineId}/triggers
```

### Schedule (cron)

```json
{
  "kind": "schedule",
  "cronExpression": "0 9 * * 1",
  "timezone": "Europe/Amsterdam"
}
```

- `cronExpression`: 标准 5-field cron syntax
- `timezone`: IANA timezone string，例如 `UTC` 或 `America/New_York`
- server 会自动计算 `nextRunAt`

### Webhook

```json
{
  "kind": "webhook",
  "signingMode": "hmac_sha256",
  "replayWindowSec": 300
}
```

- `signingMode`: `bearer`（默认）或 `hmac_sha256`
- `replayWindowSec`: 30-86400（默认 300）
- response 包含 webhook URL（基于 `publicId`）和 signing secret
- 外部触发：`POST /api/routine-triggers/public/{publicId}/fire`
  - Bearer: `Authorization: Bearer <secret>`
  - HMAC: `X-Paperclip-Signature` + `X-Paperclip-Timestamp` headers

### API (manual only)

```json
{
  "kind": "api"
}
```

无配置。通过 manual run endpoint 触发。

---

## Updating and Deleting Triggers

```
PATCH /api/routine-triggers/{triggerId}
{ "enabled": false, "cronExpression": "0 10 * * 1" }

DELETE /api/routine-triggers/{triggerId}
```

轮换 webhook secret（旧 secret 会立即失效）：

```
POST /api/routine-triggers/{triggerId}/rotate-secret
```

---

## Manual Run

立即触发 run，绕过 schedule。concurrency policy 仍然适用。

```
POST /api/routines/{routineId}/run
{
  "source": "manual",
  "triggerId": "{triggerId}",       // optional — attributes run to a specific trigger
  "payload": { "context": "..." }, // optional — passed to the run issue
  "idempotencyKey": "unique-key"   // optional — prevents duplicate runs
}
```

---

## Updating a Routine

所有 create fields 都可更新。Agents 不能把 routine 重新分配给另一个 agent。

```
PATCH /api/routines/{routineId}
{ "status": "paused", "title": "New title" }
```

---

## Reading Routines and Runs

```
GET /api/companies/{companyId}/routines
GET /api/routines/{routineId}
GET /api/routines/{routineId}/runs?limit=50
```

需要完整跨领域 API 参考时，使用 `skills/paperclip/references/api-reference.md` 的通用 endpoint tables。需要 routine-specific behaviour、payload shape 或 policy details 时，使用本文件。
