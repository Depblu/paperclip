# Issue Workspace Runtime Controls

当 issue 有隔离 execution workspace，且你需要检查或运行该 workspace 的 services 时使用本参考，尤其适用于 QA/browser verification。

## Discover the Workspace

从 issue 开始，不要凭记忆判断：

```sh
curl -sS -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID/heartbeat-context"
```

读取 `currentExecutionWorkspace`：

- `id` — control endpoints 使用的 execution workspace id
- `cwd` / `branchName` — local checkout context
- `status` / `closedAt` — workspace 是否可用
- `runtimeServices[]` — 当前 services，包括 `serviceName`、`status`、`healthStatus`、`url`、`port`、`runtimeServiceId`

如果 `currentExecutionWorkspace` 为 `null`，该 issue 当前没有 realized execution workspace。对 child/follow-up work，用 `parentId` 创建 child，或使用 `inheritExecutionWorkspaceFromIssueId`，让 Paperclip 保持 workspace continuity。

## Control Services

优先使用 Paperclip-managed runtime service controls，而不是手动 `pnpm dev &` 或临时后台进程。这些 endpoints 会让 service state、URLs、logs 和 ownership 对其他 agents 与 board 可见。

```sh
# Start all configured services; waits for configured readiness checks.
curl -sS -X POST \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  "$PAPERCLIP_API_URL/api/execution-workspaces/<workspace-id>/runtime-services/start" \
  -d '{}'

# Restart all configured services.
curl -sS -X POST \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  "$PAPERCLIP_API_URL/api/execution-workspaces/<workspace-id>/runtime-services/restart" \
  -d '{}'

# Stop all running services.
curl -sS -X POST \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  "$PAPERCLIP_API_URL/api/execution-workspaces/<workspace-id>/runtime-services/stop" \
  -d '{}'
```

要指定某个 configured service，传入以下之一：

```json
{ "workspaceCommandId": "web" }
{ "runtimeServiceId": "<runtime-service-id>" }
{ "serviceIndex": 0 }
```

响应包含更新后的 `workspace.runtimeServices[]` 列表，以及可查看 logs 的 `workspaceOperation`/`operation` 记录。

## Read the URL

`start` 或 `restart` 后，从以下位置读取 service URL：

- response `workspace.runtimeServices[].url`
- 或重新请求 `GET /api/issues/:issueId/heartbeat-context`，读取 `currentExecutionWorkspace.runtimeServices[].url`

做 QA/browser checks 时，使用 `status` 为 `running` 且 `healthStatus` 不是 `unhealthy` 的 service。多个 service 同时运行时，优先选名为 `web`、`preview`，或 issue 明确提到的 configured service。

## MCP Tools

Paperclip MCP tools 可用时，优先使用这些 issue-scoped tools：

- `paperclipGetIssueWorkspaceRuntime` — 读取 issue 的 `currentExecutionWorkspace` 和 service URLs。
- `paperclipControlIssueWorkspaceServices` — start、stop 或 restart 当前 issue workspace services。
- `paperclipWaitForIssueWorkspaceService` — 等待选定 service running，并在暴露 URL 时返回该 URL。

这些工具会替你解析 issue 的 workspace id，所以 QA agents 不需要先知道更底层的 execution workspace endpoint。
