# Paperclip 配置并关联 Clawith Agent 的需求约束与方案

## 1. 当前实现

Paperclip 的 `clawith_bridge` adapter 当前只配置 Bridge 连接参数：

- `baseUrl`
- `bridgeSecret`
- `timeoutSec`
- `mode=sync`
- `writeBack`
- `enabled`

运行时 Paperclip 先调用 Clawith Bridge：

- `POST /api/bridge/agents/sync`
- `POST /api/bridge/agents/{paperclip_agent_id}/wake`

`sync` 请求只发送 Paperclip 侧身份：

- `company_id`
- `agent_id`
- `agent_name`

Clawith 侧通过 `bridge_mappings` 表按 `(paperclip_company_id, paperclip_agent_id)` 查找映射。若不存在，`auto_create` 会先选择可运行的目标 tenant：

- 优先使用 `BRIDGE_TARGET_TENANT_ID` 指定的 tenant。
- 未指定时，如果只有一个 Clawith tenant 有默认或 enabled LLM model，则使用该 tenant。
- 否则才回退到 Paperclip 专用 tenant，并要求 `BRIDGE_LLM_*` 能创建 Bridge 专用模型。

随后创建 bridge user、Clawith agent，并写入：

- `paperclip_company_id`
- `paperclip_agent_id`
- `clawith_tenant_id`
- `clawith_agent_id`

因此当前关联方式是“首次运行自动创建并绑定”，或在 `link_existing` 模式下由 Paperclip UI 选择已有 Clawith agent。

## 2. 目标

在 Paperclip 的 Clawith adapter 配置中，允许用户显式选择或填写 Clawith agent，并让后续 heartbeat 固定唤醒该 agent。

必须保留当前自动创建行为，作为默认兼容模式。

## 3. 需求约束

### 3.1 关联边界

- Paperclip 只保存关联所需的 Clawith 标识，不编辑 Clawith agent 的 persona、memory、workspace、focus、reflection。
- Clawith 仍拥有 agent 运行时、模型调用、会话历史、工具和内部状态。
- Paperclip 只负责 issue、run、budget、audit、write-back。

### 3.2 映射唯一性

- 一个 Paperclip agent 在同一 Paperclip company 下只能绑定一个 Clawith agent。
- 一个 Clawith agent 是否允许被多个 Paperclip agent 绑定，需要 Clawith Bridge 明确约束；推荐默认禁止，避免会话和审计混淆。
- 映射键仍应保留 `(paperclip_company_id, paperclip_agent_id)`，显式绑定只是改变 mapping 创建方式。

### 3.3 安全与权限

- 所有 Bridge API 继续使用当前 HS256 JWT 认证。
- Clawith Bridge 必须校验 JWT 中的 `company_id`、`agent_id`、`run_id` 与请求体一致。
- Paperclip 不应直接持有 Clawith 数据库凭据。
- 选择已有 Clawith agent 时，Bridge 必须验证该 agent 属于允许访问的 tenant。
- `bridgeSecret` 不应展示给普通 agent，仅作为 adapter config secret 处理。

### 3.4 UI 约束

- Paperclip UI 需要支持两种模式：
  - `auto_create`：保持当前行为，首次运行自动创建 Clawith agent。
  - `link_existing`：绑定已有 Clawith agent。
- `link_existing` 至少需要配置：
  - `clawithTenantId`
  - `clawithAgentId`
- 若 Clawith Bridge 提供列表接口，UI 可渲染下拉选择；否则先使用文本输入。
- Test 按钮应显示 `link_existing` 目标校验结果：tenant、agent 状态。Paperclip adapter test context 没有真实 Paperclip agent id，因此 Test 不创建 mapping；真实 mapping 在 agent run 的 `/api/bridge/agents/sync` 阶段创建。

## 4. 推荐方案

### 4.1 Adapter config 扩展

在 Paperclip `clawith_bridge` adapter config 增加字段：

```json
{
  "linkMode": "auto_create",
  "clawithTenantId": "",
  "clawithAgentId": ""
}
```

字段含义：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `linkMode` | `auto_create \| link_existing` | 是 | 默认 `auto_create` |
| `clawithTenantId` | string | `link_existing` 时必填 | Clawith tenant UUID |
| `clawithAgentId` | string | `link_existing` 时必填 | Clawith agent UUID |

### 4.2 Bridge sync 协议扩展

Paperclip 调用 `/api/bridge/agents/sync` 时追加：

```json
{
  "link_mode": "link_existing",
  "clawith_tenant_id": "uuid",
  "clawith_agent_id": "uuid"
}
```

Clawith Bridge 行为：

- `auto_create`：沿用当前 `get_or_create_bridge_mapping()`。
- `link_existing`：
  - 校验 `clawith_tenant_id` 和 `clawith_agent_id` 存在。
  - 校验 agent 属于 tenant。
  - 若 mapping 不存在，创建 mapping 指向该 Clawith agent。
  - 若 mapping 已存在且指向同一 Clawith agent，返回成功。
  - 若 mapping 已存在但指向不同 Clawith agent，返回 `409 conflict`，除非请求显式带 `force_rebind=true`。

### 4.3 查询接口

最小可行版本不要求 agent 列表接口，用户可手动填 UUID。

更好的版本增加：

- `GET /api/bridge/tenants`
- `GET /api/bridge/tenants/{tenant_id}/agents`
- `GET /api/bridge/agents/{paperclip_agent_id}/state`

Paperclip UI 根据这些接口显示可选 agent，并在 Test 结果里展示当前绑定。

### 4.4 数据模型

当前 `bridge_mappings` 已有核心字段，可继续使用：

- `paperclip_company_id`
- `paperclip_agent_id`
- `clawith_tenant_id`
- `clawith_agent_id`
- `status`
- `metadata`

建议在 `metadata` 中记录绑定来源：

```json
{
  "linkMode": "link_existing",
  "linkedBy": "paperclip",
  "linkedAt": "iso-time"
}
```

若需要可审计 rebind，再新增历史表；最小版本可先不做。

## 5. 实施切片

### Phase 1：手动 UUID 绑定

- Paperclip adapter schema 增加 `linkMode`、`clawithTenantId`、`clawithAgentId`。
- Paperclip sync body 发送上述字段。
- Clawith `BridgeSyncRequest` 增加对应字段。
- Clawith mapping service 支持 `link_existing`。
- Test Environment 返回 `link_existing` 目标 Clawith tenant/agent 校验状态。

### Phase 2：下拉选择

- Clawith Bridge 提供 tenant/agent 列表接口。
- Paperclip schema 支持动态 options 或 UI 增加 Clawith agent picker。
- Test 展示 agent name、tenant name、status。

当前实现采用通用 remote options：Paperclip 后端用当前 adapter config 代理调用 Clawith Bridge，UI 只显示 `Clawith agent` 下拉；选择项写回隐藏的 `clawithTenantId` / `clawithAgentId`。

### Phase 3：重绑与解绑

- 增加 `force_rebind` 或单独 rebind endpoint。
- 增加 unlink/disable mapping 操作。
- 增加审计记录和冲突提示。

## 6. 验收标准

- 在 Paperclip 创建 `clawith_bridge` agent 时，可选择 `auto_create` 或 `link_existing`。
- `auto_create` 行为与当前实现兼容。
- `link_existing` 填入有效 Clawith tenant/agent 后，Test 返回 Passed，并显示校验通过的 `clawith_agent_id`。
- heartbeat 唤醒的是配置的 Clawith agent，不再自动创建新 agent。
- 无效 tenant/agent 返回明确错误。
- 已绑定到其他 Clawith agent 时返回 `409`，不会静默改绑。
- Bridge JWT、idempotency、run write-back 逻辑保持不变。

## 7. 推荐结论

先实现 Phase 1。它只扩展现有 sync 协议和 mapping 创建逻辑，不要求 Paperclip 直接读取 Clawith 数据库，也不改变 run/wake 主流程。UI 先用 UUID 文本输入即可满足“可配置并关联已有 Clawith agent”的核心需求。
