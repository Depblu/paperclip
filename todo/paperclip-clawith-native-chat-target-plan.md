# Paperclip-Clawith Native Chat Target Plan

## Conclusion

目标方案：Paperclip 不再把 Clawith 当成专用 Bridge runtime，而是作为 Clawith 原生 Web Chat 的外部客户端接入。

Paperclip 负责 issue、run、调度、审计和写回。Clawith 负责 agent 配置、model、tools、skills、memory、workspace、chat session 和 message persistence。

该方案长期优于当前 Bridge wake 方案，因为它让 Clawith 中配置的 agent 和 Clawith UI 中展示的会话成为同一条原生运行链路。

## Hard Requirements

1. 不改 Clawith。
   - 禁止修改 `todo/Clawith` 下的源码、schema、API、UI、runtime。
   - 不新增 Clawith Bridge endpoint。
   - 不依赖 Clawith 私有数据库写入或补丁逻辑。
   - 只使用 Clawith 已存在的 HTTP session API 和 websocket chat API。

2. 尽量少改 Paperclip。
   - 改动优先限制在 `packages/adapters/clawith-bridge` 内。
   - 避免修改 Paperclip core server、db schema、shared contract 和通用 UI。
   - 如必须扩展配置 UI，优先复用已有 adapter config-schema / remote option 机制。
   - 目标是保持 fork 与上游 Paperclip commit 可持续同步，减少 rebase 冲突面。

## Current Implementation

当前实现通过 Paperclip `clawith_bridge` adapter 调 Clawith Bridge HTTP endpoint：

- `/api/bridge/agents/sync`
- `/api/bridge/agents/{paperclip_agent_id}/wake`

Clawith Bridge 在 Clawith 侧维护 Paperclip mapping，创建 `source_channel="paperclip"` 的 session，然后直接调用 Clawith 内部 `call_llm_with_failover`。

这个实现可以回复 Paperclip，但不是 Clawith 原生 Web Chat 会话。普通 Clawith 用户默认的 "mine" 会话列表不一定能看到这些运行记录。

## Target Runtime Flow

1. 在 Clawith 中手动创建并配置 agent。
   - model 在 Clawith 配。
   - tools 在 Clawith 配。
   - skills 在 Clawith 配。
   - Paperclip 不 auto-create Clawith agent。

2. 在 Paperclip agent adapter config 中选择已有 Clawith agent。
   - 保存 `clawithBaseUrl`。
   - 保存 `clawithAgentId`。
   - 保存可访问该 agent 的 Clawith user token 或 service account token。

3. Paperclip run 开始时，adapter 解析 Paperclip issue/run context，构造用户消息。

4. Paperclip 为该 issue/run 创建或复用 Clawith web session。
   - 优先使用 Clawith 现有 `POST /api/agents/{agent_id}/sessions`。
   - 保存 `paperclip issue/run -> clawith session_id` 映射到 adapter session params 或现有 run metadata。
   - 不直接写 Clawith DB。

5. Paperclip 通过 Clawith websocket 发送消息。
   - 使用 `/ws/chat/{clawith_agent_id}?token=...&session_id=...`。
   - 发送 payload 格式对齐 Clawith frontend 当前行为：`content`、`display_content`、`model_id` 可选。
   - 消费 `chunk`、`thinking`、`tool_call`、`done`、`error`、`quota_exceeded` 事件。

6. Clawith 原生 runtime 完成执行。
   - ChatSession / ChatMessage 由 Clawith 自己持久化。
   - tools / skills / live preview / tool log 走 Clawith 原生路径。
   - Paperclip 只把 final summary 写回 issue comment 或 run log。

## Expected User Experience

在 Clawith 中：

- 用户可以看到 Paperclip 触发的会话。
- 会话属于用于连接的 Clawith user。
- 如果使用个人 token，会出现在该用户的 "my sessions"。
- 如果使用 service account token，会出现在 service account 的 sessions；管理员可通过 "other sessions" 查看。
- agent 使用 Clawith 中已配置的 model、tools、skills。

在 Paperclip 中：

- agent 仍作为 Paperclip agent 被分配 issue。
- run 仍有 Paperclip transcript、status、budget、write-back。
- Clawith session id 可作为 run/session display id 展示。

## Minimal Paperclip Change Boundary

优先改动：

- `packages/adapters/clawith-bridge/src/server/config.ts`
- `packages/adapters/clawith-bridge/src/server/types.ts`
- `packages/adapters/clawith-bridge/src/server/execute.ts`
- `packages/adapters/clawith-bridge/src/server/test.ts`
- `packages/adapters/clawith-bridge/src/server/execute.test.ts`
- 必要时改 adapter UI parser / config build 文件。

避免改动：

- Paperclip DB schema。
- Paperclip generic run orchestration。
- Paperclip issue thread UI。
- Paperclip shared adapter contract。
- Clawith 任何文件。

## Compatibility Strategy

保留当前 Bridge wake 模式作为 legacy mode，新增 native chat mode。

建议 config：

- `connectionMode`: `bridge_wake | native_chat`
- 默认仍可保持 `bridge_wake`，避免破坏现有本地配置。
- 新目标路径使用 `native_chat`。
- `native_chat` 只支持 link existing Clawith agent。

这样可以降低一次性迁移风险，也避免把 fork 改成与上游 Paperclip 大面积冲突。

## Risks

1. Clawith websocket 是现有 UI 使用的协议，不是稳定公开 API。
   - 风险：Clawith frontend/backend 协议变化会影响 Paperclip adapter。
   - 缓解：把 websocket client 封装在 adapter 包内，不扩散到 Paperclip core。

2. token 归属影响会话可见性。
   - 个人 token：会话出现在个人账号下。
   - service account token：会话出现在 service account 下。
   - 这是产品配置问题，不应通过改 Clawith 规避。

3. websocket 比 HTTP wake 更复杂。
   - 需要处理连接、超时、重连、done/error、重复发送。
   - adapter 应以一次 run 一个 websocket session 为边界，避免全局连接池。

## Final Direction

长期方向选择 native chat mode。

当前 Bridge wake mode 可以继续保留用于兼容和回退，但不应作为 Clawith agent 深度集成的主路径。

硬性边界保持不变：不改 Clawith，Paperclip 只做 adapter 级最小改动。

## Implementation Status

Implemented in `packages/adapters/clawith-bridge`:

- Added `connectionMode=bridge_wake|native_chat`; default remains `bridge_wake`.
- Kept the legacy Bridge wake path unchanged for compatibility.
- Added native chat execution through Clawith's existing `POST /api/agents/{agent_id}/sessions` and `/ws/chat/{agent_id}` APIs.
- Stored native chat resume state in adapter `sessionParams` as `connectionMode`, `clawithAgentId`, and `clawithSessionId`.
- Added native chat environment checks against the existing Clawith session API.
- Did not modify Clawith files.

Verification:

- `pnpm --filter @paperclipai/adapter-clawith-bridge typecheck`
- `pnpm exec vitest run packages/adapters/clawith-bridge/src`
