# Paperclip 外挂飞书审批方案设计

## 1. 目标与范围

本文描述以独立外挂服务方式，为 Paperclip 现有人类审批能力接入飞书交互式卡片。

首要目标是：

1. Paperclip 核心代码修改 0、数据库迁移 0、Plugin SDK 修改 0、Approval 状态机修改 0、权限模型修改 0。完全通过独立外挂服务、现有公开 REST API 和现有 Board API Key 实现。
2. 对通用 Approval 类型复用现有审批状态机、认证、Activity 和各类型已有副作用。
3. 飞书或外挂服务故障时，不影响 Paperclip 自身运行和 Web 页面审批。
4. 外挂恢复后能够重新发现未处理审批并补发通知。
5. Web UI 与飞书 Bridge 以 Paperclip 为唯一事实来源，两个入口之间不直接调用。
6. 飞书卡片与动作凭证绑定审批版本快照，作为 best-effort 防护降低旧卡片操作新一轮 payload 的风险（不能消除 GET 与 POST 之间的竞态窗口，见 §2.5）。

第一阶段范围：

- 发现 Paperclip 待审批记录。
- 按配置将审批卡片发送给相关飞书人员。
- 仅对显式配置为可操作的通用 Approval 类型支持同意和拒绝。
- 通过 Paperclip 现有 REST API 写回审批结果。
- 更新飞书卡片状态。
- 保留投递、回调和操作审计。
- 保证飞书操作最终只产生一次有效审批状态变更。
- 投递记录和动作凭证绑定审批版本，回调前校验版本一致性。

暂不实现：

- `budget_override_required` 的飞书审批操作（第一阶段只展示和引导到 Paperclip 预算控制页面）。
- 飞书侧"请求修改"按钮（但必须防止旧卡片审批新一轮 payload）。
- 飞书原生审批中心。
- 多级审批、会签、顺序审批。
- 飞书用户与 Paperclip 用户的一一绑定。
- 飞书 SSO。
- 对 Paperclip 审批领域模型的重构。
- 消息队列或 Active-Active 多实例部署。

---

## 2. 设计原则

### 2.1 Paperclip 是唯一事实来源

审批真实状态始终以 Paperclip `approvals` 数据为准：

- `pending`
- `revision_requested`
- `approved`
- `rejected`
- `cancelled`

飞书卡片只是外部交互入口，不维护独立审批状态机。

### 2.2 外挂不复制 Paperclip 业务逻辑

外挂服务禁止直接修改 Paperclip 数据库，也不复制：

- 审批状态流转。
- Agent 激活或终止。
- Activity Log。
- 请求审批 Agent 的 Wakeup。
- Issue 与 Approval 的关联处理。
- 同意和拒绝的并发状态判断。

通用 Approval 的同意和拒绝均调用 Paperclip 现有 API，由 Paperclip 执行现有业务副作用。Bridge 不复制也不补偿 Paperclip 内部副作用；审批状态提交与 Activity、Agent 激活、预算策略和 Wakeup 等后续动作不应视为一个跨组件原子事务。

当前 `approve`/`reject` 使用带状态条件的原子 UPDATE（`WHERE id = ? AND status IN (pending, revision_requested)`），在多个 approve/reject 请求之间具备 first-wins 语义。此语义不适用于 approve/reject 与 requestRevision/resubmit 的并发。`requestRevision` 的并发安全是 Paperclip 内部事务，不属于 Bridge 职责；Bridge 通过版本绑定（见 §8.3）在自身侧 best-effort 防护旧卡片操作新一轮 payload，不要求也不等待 Paperclip 做任何源码修改。

`budget_override_required` 需要预算 Incident 专用处理动作和金额参数，不能使用通用 Approval API，因此第一阶段只展示和引导，不开放飞书操作。飞书侧第一阶段不提供"请求修改"按钮；版本绑定仅作为 best-effort 防护，用于降低旧卡片操作新一轮 payload 的风险，不能提供绝对保证（见 §2.5、§8.3、§9.4）。

### 2.3 失败隔离

外挂不可用时：

- Paperclip Web 页面审批仍然可用。
- Agent 与任务调度不受影响。
- 待审批数据不会丢失。
- 外挂恢复后通过轮询补偿。

### 2.4 最小权限

为外挂创建独立 Paperclip 用户，并为该用户创建专用 Board API Key。

该用户应：

- 不是实例管理员。
- 只加入需要接入飞书的 Company。
- Membership 不能是只读 `viewer`，否则无法调用审批写接口。
- 不与真实管理员个人账号共用凭据。
- 可以单独撤销、轮换和审计。

当前 Board API Key 继承该用户在 Company 内的完整 Board 权限，并不是 Approval-only 凭据。部署时应通过独立用户、最少 Company Membership、网络访问控制和 API 路径限制共同收缩权限面。

Board API Key 默认可能存在有效期，Bridge 必须监控到期时间、401 响应并建立轮换流程，不能依赖长期不失效的静态密钥。

### 2.5 零源码修改方案的能力边界

以下限制由零源码原则和现有 Paperclip API 能力决定，Sidecar 无法消除：

1. **并发竞态**：Web `requestRevision` 与飞书 approve/reject 并发时，无法保证严格 first-wins。最坏情况下 Approval 状态被改回 `revision_requested`，但 approve 对应的部分 Paperclip 内部副作用可能已经执行。
2. **操作约束**：接入飞书审批的 Approval 在 pending 期间应避免或禁止从 Paperclip Web 执行"请求修改"；无法落实此约束时，业务必须接受上述并发风险。
3. **检查-执行竞态窗口**：GET 版本校验与 POST approve/reject 之间存在无法由 Sidecar 消除的竞态窗口。版本绑定只能在回调读取时已检测到版本变化时拒绝旧卡片，不能消除查询与提交之间的固有限制。
4. **非原子性**：Approval 状态更新与 Paperclip 内部副作用（Activity、Agent 激活、Wakeup）不能保证原子完成。
5. **版本绑定是 best-effort 防护**：不能绝对防止旧卡片审批新 payload，只能降低风险。Sidecar 版本绑定不能修复 Paperclip 内部并发问题。
6. **飞书卡片投递不保证 exactly-once**：跨 SQLite 与飞书 API 无法实现分布式 exactly-once。
7. **非真实 Actor**：Paperclip 记录 Bridge 专用用户为决策者，而非真实飞书审批人。
8. **Board API Key 非 Approval-only**：继承用户在 Company 内的完整 Board 权限。
9. **白名单 fail-closed**：仅显式配置的 Approval 类型允许操作；未知类型拒绝。
10. **`budget_override_required` 只通知和跳转**：不开放飞书操作。
11. **单实例**：第一阶段仅允许一个有效 Bridge 实例，不支持 Active-Active。
12. **最终一致性**：只提供轮询和对账意义上的最终一致性，不提供实时事件驱动。

---

## 3. 可直接复用的 Paperclip 能力

### 3.1 现有实现位置

```text
packages/db/src/schema/approvals.ts
server/src/services/approvals.ts
server/src/routes/approvals.ts
server/src/services/board-auth.ts
server/src/middleware/auth.ts
```

当前审批类型包括：

```text
hire_agent
approve_ceo_strategy
budget_override_required
request_board_approval
```

### 3.2 现有审批 API

外挂服务直接调用：

```http
GET /api/companies/{companyId}/approvals?status=pending
GET /api/approvals/{approvalId}
GET /api/approvals/{approvalId}/issues
GET /api/approvals/{approvalId}/comments

POST /api/approvals/{approvalId}/approve
POST /api/approvals/{approvalId}/reject
```

审批意见中记录真实飞书审批人，例如：

```text
通过飞书完成审批；审批人：张三；飞书用户标识：已脱敏；意见：同意。
```

Paperclip 接收到审批 API 调用后，按 Approval 类型执行对应副作用：

- 更新 Approval 状态（所有类型）。
- 写入 Activity（所有类型）。
- `hire_agent` 同意时：激活或创建待审批 Agent，设置月度预算策略；拒绝时：终止对应 Agent。
- 存在 `requestedByAgentId` 时：Route 层可能请求 Wakeup。
- 其他类型（`approve_ceo_strategy`、`request_board_approval`）：仅状态变更和 Activity，不涉及 Agent 激活或预算。

### 3.3 Board API Key 身份

Board API Key 会映射到真实 Paperclip 用户，并继承该用户的 Company Membership 和访问边界。因此第一阶段不需要增加新的认证方式。

---

## 4. 总体架构

```text
┌─────────────────────────────────────────────┐
│               Paperclip Core                │
│                                             │
│  Existing Approval REST API                 │
│  Existing Board Authentication              │
│  Existing Approval State Machine            │
│  Existing Activity / Wakeup / Side Effects │
└──────────────────────▲──────────────────────┘
                       │
                       │ Existing REST API
                       │
┌──────────────────────┴──────────────────────┐
│         paperclip-feishu-bridge             │
│                                             │
│  Approval Poller                           │
│  Paperclip API Client                      │
│  Approver Routing                          │
│  Approval Card Renderer                    │
│  Feishu Long Connection                    │
│  Callback Validation and Deduplication     │
│  Delivery Repository                       │
│  Reconciliation and Retry                  │
└──────────────────────┬──────────────────────┘
                       │
                       │ Feishu Open Platform
                       │
┌──────────────────────▼──────────────────────┐
│                   飞书                      │
│                                             │
│  单聊审批卡片                              │
│  同意 / 拒绝                               │
│  审批结果卡片更新                          │
└─────────────────────────────────────────────┘
```

外挂服务是独立进程或容器，不加载进 Paperclip Server 进程。它可以与 Paperclip 部署在同一网络，也可以通过 HTTPS 远程访问 Paperclip。

### 4.1 与 Paperclip Web UI 的关系

Web UI 与飞书 Bridge 是两个平级的人类审批入口，二者不直接调用：

```text
飞书卡片 ──> Bridge ──> Paperclip Approval API / DB <── Web UI
```

飞书点击同意或拒绝后，Bridge 调用 Paperclip 现有 Approval API，Paperclip 更新唯一审批状态并写入 Approval Activity。Web UI 的实时更新机制收到该 Activity 后刷新审批列表，因此列表和 Inbox 可以近实时联动。

当前 Web UI 的实时失效逻辑主要刷新 Approval 列表。若用户已经停留在某个 Approval 详情页，该页面可能要在重新聚焦、重新进入或手动刷新后才显示新状态。为获得完整即时联动，建议在现有 Web UI Activity 处理处同时失效 `queryKeys.approvals.detail(entityId)`；这是 Web UI 缓存刷新补全，不建立 Bridge 到浏览器的直接依赖。

反方向上，用户从 Web UI 完成审批后，Paperclip 状态立即变化；Bridge 通过状态对账发现终态并更新、禁用飞书卡片。第一阶段该方向的卡片更新时延不超过一个对账周期。

---

## 5. 为什么第一阶段采用轮询

虽然当前 Paperclip 插件系统存在 `approval.created` 和 `approval.decided` 事件，但第一阶段不依赖这些事件：

1. 当前事件总线是进程内机制，不是持久化消息队列。
2. 插件或 Paperclip 重启期间可能错过事件。
3. 普通插件不应直接执行审批决定。
4. 当前插件 Webhook 返回模型不适合飞书卡片同步响应。
5. 修改 Plugin SDK 会扩大对 Paperclip 的侵入。

建议每 5 至 10 秒扫描一次：

```http
GET /api/companies/{companyId}/approvals?status=pending
```

轮询适合审批场景，因为：

- 审批通常不要求毫秒级实时性。
- 重启后可从当前状态恢复。
- 不依赖历史事件是否成功投递。
- 容易补发和对账。
- 不需要修改 Paperclip。

---

## 6. 外挂模块设计

建议目录：

```text
feishu_plugin/
├── docs/
│   └── feishu-approval-sidecar-design.md
├── src/
│   ├── main.ts
│   ├── config/
│   ├── paperclip/
│   │   ├── client.ts
│   │   └── approval-poller.ts
│   ├── feishu/
│   │   ├── client.ts
│   │   ├── long-connection.ts
│   │   ├── card-renderer.ts
│   │   └── callback-handler.ts
│   ├── approvals/
│   │   ├── coordinator.ts
│   │   ├── routing.ts
│   │   ├── action-token.ts
│   │   └── reconciliation.ts
│   ├── storage/
│   │   ├── database.ts
│   │   └── repositories.ts
│   └── observability/
│       ├── logger.ts
│       └── metrics.ts
├── package.json
├── Dockerfile
└── README.md
```

### 6.1 Paperclip API Client

职责：

- 查询 Company 的待审批记录。
- 查询审批详情、关联 Issue 和评论。
- 调用同意、拒绝 API。
- 统一处理超时、网络错误和 HTTP 错误。

约束：

- 不访问 Paperclip 数据库。
- 不调用 Paperclip 内部服务函数。
- 写操作只通过现有公开 REST API。
- 日志不得记录认证凭据。

### 6.2 Approval Poller

职责：

- 周期扫描配置中的 Company。
- 发现需要投递的 pending Approval。
- 将待处理项提交给 Approval Coordinator。
- 控制扫描和发送并发。

建议默认值：

```text
轮询周期：5 秒
对账周期：60 秒
扫描并发：4
请求超时：10 秒
```

### 6.3 Approval Coordinator

职责：

- 根据 Approval 类型选择审批人。
- 生成安全展示摘要。
- 调用飞书发送卡片。
- 保存投递映射。
- 处理飞书操作回调。
- 调用 Paperclip 审批 API。
- 更新所有相关卡片。
- 执行状态对账和失败补偿。

Coordinator 只协调两个系统，不拥有审批业务状态。

### 6.4 Feishu Transport

第一阶段使用飞书长连接接收卡片回调：

- 无需为 Paperclip 暴露公网回调地址。
- 不依赖 Paperclip 插件 Webhook。
- 适合单实例和小规模部署。
- 飞书传输层可以独立替换。

建议保留统一接口：

```ts
interface FeishuTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendApprovalCard(input: SendApprovalCardInput): Promise<DeliveryReference>;
  updateApprovalCard(input: UpdateApprovalCardInput): Promise<void>;
}
```

以后需要多实例部署时，可在外挂内部新增 Webhook Transport，不影响 Paperclip 和审批协调逻辑。

---

## 7. 审批人路由

第一阶段由外挂配置决定飞书审批人。可以按 Company 和 Approval 类型配置：

```yaml
companies:
  - companyId: "paperclip-company-id"
    defaultApprovers:
      - openId: "feishu-default-approver"
        name: "默认审批人"
    routing:
      hire_agent:
        approvers:
          - openId: "feishu-hr-approver"
            name: "人力负责人"
      approve_ceo_strategy:
        approvers:
          - openId: "feishu-owner-approver"
            name: "公司负责人"
```

第一阶段采用 `any / first-wins` 策略（仅适用于多个 approve/reject 请求之间，由 Paperclip 当前条件更新保证；不适用于 approve/reject 与 requestRevision/resubmit 的并发）：

```text
任一授权审批人完成有效 approve/reject 操作后，审批立即生效；其他人的后续 approve/reject 只返回最终状态。
此语义不覆盖 approve/reject 与 Web 端 requestRevision/resubmit 的并发场景（见 §2.5）。
```

回调时必须校验：

1. 飞书操作人属于当前 Approval 的审批人列表。
2. Company 与路由配置一致。
3. 回调动作凭证有效且未过期。
4. Approval 当前仍处于可处理状态。

收到卡片不等于自动获得审批权限。

---

## 8. 卡片设计

### 8.1 展示内容

卡片建议展示：

- 审批类型。
- Approval ID 短格式。
- 申请 Agent 或申请用户。
- 关联 Issue 标题和编号。
- 安全业务摘要。
- 创建时间。
- 当前状态。
- Paperclip 详情页链接。

卡片禁止展示：

- 完整 Adapter 配置。
- 运行环境敏感配置。
- 认证信息。
- Approval 原始 payload 中未经筛选的数据。

### 8.2 操作按钮

第一阶段支持：

- 同意。
- 拒绝。
- 查看详情。

拒绝应要求填写意见，可以通过飞书表单或二次卡片收集文本。请求修改暂不开放，避免飞书与 Paperclip Web 并发时产生不可预期的状态竞争（见 §2.5）。

### 8.3 回调动作凭证与版本绑定

卡片只携带随机、不透明、短期有效的动作凭证。外挂本地记录其对应的：

- approvalId。
- companyId。
- 目标审批人。
- 允许动作。
- 到期时间。
- 是否已经使用。
- **approval_version**：投递时的审批版本快照（见下文）。

**版本绑定**：Paperclip Web 已支持 request revision 和 resubmit，且 resubmit 保持同一个 Approval ID、可能更新 payload 并回到 pending。即使飞书第一阶段不提供"请求修改"按钮，也必须防止旧卡片审批新一轮 payload。

版本快照采用简单可实现方案：投递时记录 `approval_updated_at`（Paperclip Approval 的 `updatedAt` 字段）和 `payload_hash`（payload JSON 的 SHA-256 摘要）。二者组合构成稳定版本标识，无需 Paperclip 新增字段。

回调处理前，Bridge 必须重新读取 Approval 当前状态，按以下顺序判断：

1. **先按状态判断**：
   - `approved` / `rejected` / `cancelled`：审批已终结，返回最终状态并禁用卡片，不记为新审批轮次。
   - `revision_requested`：禁用旧卡片并显示等待修改，不记为新审批轮次。
   - `pending`：继续步骤 2。
2. **再比较版本**（仅 pending 时）：比较当前 `updatedAt` + payload hash 与动作凭证绑定的版本快照：
   - 版本一致：允许继续调用 Paperclip 审批 API。
   - 版本不一致：说明审批已经历新一轮（resubmit），拒绝旧卡片操作、使旧凭证失效，记为 `version_mismatch`，更新或重发卡片。

只有"状态仍为 pending 且版本变化"才记 `version_mismatch` / 新一轮。

最终是否允许审批仍以 Paperclip 当前状态为准；版本绑定是 Bridge 侧的 best-effort 额外防护层，不能消除 GET 版本校验与 POST 提交之间的竞态窗口（见 §2.5）。

---

## 9. 关键流程

### 9.1 发送审批卡片

```text
Approval Poller
    │
    │ 查询 pending approvals
    ▼
发现本地尚未成功投递的 Approval
    │
    ├── 查询审批详情
    ├── 记录版本快照（updated_at + payload hash）
    ├── 查询关联 Issue
    ├── 根据审批类型选择审批人
    ├── 构建安全卡片（携带版本绑定的动作凭证）
    ├── 向每位审批人发送单聊卡片
    └── 保存投递记录（含版本快照）与 Approval 映射
```

建议每位审批人收到独立单聊卡片，便于身份校验、独立更新和审计，不建议第一阶段在群聊中开放审批按钮。

### 9.2 同意

```text
飞书用户点击同意
    │
    ▼
外挂接收回调
    │
    ├── 校验飞书应用和租户
    ├── 校验回调事件未处理
    ├── 校验动作凭证（含版本绑定）
    ├── 校验操作人为授权审批人
    ├── 重新查询 Paperclip Approval
    ├── 先按状态判断：
    │       ├── approved/rejected/cancelled → 返回最终状态、禁用卡片
    │       ├── revision_requested → 禁用旧卡片、显示等待修改
    │       └── pending → 继续版本校验
    ├── 校验版本一致性（updated_at + payload hash）
    │       │
    │       └── 版本不一致 → 拒绝操作、失效旧凭证、记 version_mismatch、更新或重发卡片
    │
    └── 调用现有 approve API
              │
              ▼
        Paperclip 按类型执行原有逻辑
              │
              ├── 更新状态
              ├── 记录 Activity
              ├── hire_agent：激活/创建 Agent、设置预算
              ├── requestedByAgentId：可能请求 Wakeup
              └── 返回 Approval 结果或 HTTP 错误
              │
              ▼
        Bridge 处理响应
              │
              ├── 2xx → 更新卡片、记录 succeeded
              ├── 5xx → 重新读取 Approval 判断是否已提交
              │       ├── 已达目标终态 → 记录 decision_committed_side_effect_unknown
              │       └── 未达终态 → 按重试策略处理
              └── 4xx → 记录 permanent_failed
```

成功后外挂更新全部相关卡片，显示实际飞书操作人和最终结果，并禁用操作按钮。

### 9.3 拒绝

外挂调用现有 reject API，并将飞书审批人和拒绝意见写入 `decisionNote`。

### 9.4 请求修改、重新提交与版本防护

第一阶段飞书侧不提供"请求修改"按钮，但 Paperclip Web 已支持 request revision 和 resubmit（resubmit 保持同一 Approval ID、可能更新 payload 并回到 pending）。因此 Bridge 必须在第一阶段就防止旧卡片审批新一轮 payload。

**Bridge 侧版本防护**（见 §8.3）：

- 回调重新读取 Approval 后，先按状态判断：终态直接返回；`revision_requested` 禁用旧卡片；仅 `pending` 时再比较版本。
- 投递记录和动作凭证绑定 `approval_updated_at` + `payload_hash` 版本快照。
- 仅"状态仍为 pending 且版本变化"时拒绝操作、失效旧凭证、记 `version_mismatch`、更新或重发卡片。
- 对账发现 Approval 重新回到 pending 且版本变化时，作废旧投递记录和凭证，生成新凭证并重发卡片。

**固有限制**：版本绑定是 best-effort 防护，不能消除 GET 版本校验与 POST 提交之间的检查-执行竞态窗口（见 §2.5）。

后续如需飞书"请求修改"能力，仍需在零源码原则约束下重新评估是否存在可用的现有 Paperclip API 支撑；当前文档不承诺该能力，不在第一阶段范围内。

### 9.5 重复和并发点击

处理顺序：

1. 通过飞书事件 ID 做回调去重。
2. 校验动作凭证版本绑定（updated_at + payload hash）。
3. 操作前重新读取 Paperclip Approval，先按状态判断：终态直接返回、`revision_requested` 禁用旧卡片、仅 `pending` 时继续。
4. 校验版本一致性（仅 pending 时）；版本不一致记 `version_mismatch` 并拒绝。
5. 调用 Paperclip 原有审批 API。
6. Paperclip 返回已不可处理时，转换为友好提示。
7. Paperclip 返回 5xx 时，重新读取 Approval 判断是否已提交（见 §11.3）。

第二位审批人点击时返回：

```text
该审批已经处理，请以当前 Paperclip 状态为准。
```

---

## 10. 外挂本地数据

第一阶段建议使用 SQLite，数据不进入 Paperclip 数据库。

### 10.1 卡片投递记录

建议字段：

```text
id
approval_id
company_id
approval_type
approval_status
approval_updated_at      -- 投递时 Approval 的 updatedAt
payload_hash             -- 投递时 payload 的 SHA-256 摘要
feishu_tenant_key
recipient_open_id
recipient_name
message_id
card_id
delivery_status
attempt_count
last_error
last_attempt_at
sent_at
updated_at
```

唯一约束：

```text
approval_id + recipient_open_id + approval_updated_at + payload_hash
```

版本变化（resubmit 或 Web 端操作导致 updatedAt/payload 变更）时，旧投递记录标记为 `superseded`，新建投递记录。

### 10.2 回调审计和去重

建议字段：

```text
event_id
approval_id
company_id
operator_open_id
operator_name
action
decision_note
result_status
result_message
paperclip_status
version_matched          -- 回调时版本是否与凭证绑定一致
processed_at
```

`event_id` 必须唯一。

`result_status` 取值：

```text
processing
succeeded
retryable_failed
permanent_failed
version_mismatch         -- 版本不一致，旧凭证操作被拒绝
decision_committed_side_effect_unknown  -- 见 §11.3
```

### 10.3 动作凭证

建议字段：

```text
credential_hash
approval_id
company_id
recipient_open_id
allowed_actions
approval_updated_at      -- 绑定的审批版本
payload_hash             -- 绑定的 payload 摘要
expires_at
consumed_at
invalidated_at           -- 版本不一致或审批已处理时标记失效
created_at
```

数据库只保存摘要，不保存可直接使用的明文值。版本不一致或审批已处理时，凭证标记为 `invalidated_at`，后续回调直接拒绝。

---

## 11. 状态对账和可靠性

### 11.1 Reconciliation

建议每分钟执行一次：

1. 查询本地仍显示 pending 的投递记录。
2. 重新读取对应 Paperclip Approval。
3. 先按状态判断：
   - `approved` / `rejected` / `cancelled` → 更新卡片为最终状态，标记旧投递记录和凭证为 `superseded`/`invalidated`。
   - `revision_requested` → 显示等待修改，标记当前投递记录和凭证失效。
   - `pending` → 继续步骤 4。
4. 比对版本快照（updated_at + payload hash）：
   - 版本不一致（新一轮 resubmit）→ 标记旧投递记录和凭证失效，生成新凭证并重发卡片。
   - 版本一致 → 继续常规对账。
5. 投递失败时进入重试。

这可以覆盖：

- 用户直接在 Paperclip Web 页面审批或请求修改。
- Agent 通过 Web/MCP 重新提交（resubmit）导致 payload 变化。
- 外挂发送卡片后崩溃。
- 飞书卡片更新失败。
- Paperclip 或外挂重启。

### 11.2 重试、幂等和故障窗口

- 查询操作可进行有限网络重试。
- 审批写操作不能盲目重试，必须先重新查询状态。
- 飞书卡片发送采用指数退避。
- 卡片更新失败由对账任务补偿。
- 回调审计记录使用 `processing / succeeded / retryable_failed / permanent_failed / version_mismatch / decision_committed_side_effect_unknown` 状态，不能只用一个已处理布尔值。

建议退避节奏：

```text
5 秒、30 秒、2 分钟、10 分钟、30 分钟
```

发送卡片前必须先持久化投递意图，并使用 `pending / sending / sent / unknown / failed` 状态机。飞书发送成功但本地落库前进程崩溃时，无法仅靠 SQLite 与飞书 API 保证绝对 exactly-once；如飞书接口支持稳定幂等键应优先使用，否则通过 `unknown` 状态、消息查询或后续对账减少重复卡片。

回调处理同样不能宣称跨 SQLite 与 Paperclip 的分布式 exactly-once。第一阶段保证的是：重复事件或重试最终最多产生一次有效 Approval 状态变更；允许在故障恢复过程中重复发起无副作用或由 Paperclip 幂等处理的 HTTP 请求。

飞书投递失败不能反向取消或拒绝 Paperclip Approval。

### 11.3 决策已提交但副作用未知

Paperclip 可能先把 Approval 状态更新为 approved/rejected（状态已提交），随后 Agent 激活、预算设置或 Route 层 Activity/Wakeup 失败，导致 POST 返回 5xx。

Bridge 收到 5xx 后的处理规则：

1. **必须重新读取 Approval**。若当前状态已达到目标终态（approved/rejected），说明决策已提交，不得盲目重试决定写操作。
2. 回调审计记录状态设为 `decision_committed_side_effect_unknown`。
3. 触发高优先级日志和运维告警（见 §15），由运维人员检查 Paperclip 内部副作用是否完整。
4. Bridge **不得**自行补偿 Paperclip 内部的 Agent 激活、预算设置、Activity 写入或 Wakeup 请求。这些是 Paperclip 内部一致性问题，不属于 Bridge 职责。
5. 飞书卡片仍应更新为最终审批结果（以 Paperclip 当前状态为准）。

若重新读取后发现 Approval 未达目标终态（例如 5xx 发生在状态更新之前），则按 `retryable_failed` 处理，进入正常重试流程。

---

## 12. 身份和审计边界

完全外挂、零源码修改方案下，Paperclip 的 `decidedByUserId` 记录的是外挂专用用户，而不是真实飞书用户。

真实飞书审批人保存在：

1. Paperclip `decisionNote`。
2. 外挂回调审计表。
3. 飞书最终卡片。

这是第一阶段为保持核心零修改而接受的边界。

飞书审批人授权应使用稳定的飞书用户标识及租户、应用上下文，姓名仅用于展示，不能作为权限依据。

---

## 13. 配置设计

配置应包含：

```text
Paperclip 服务地址
Paperclip 专用认证凭据的运行时引用
飞书应用标识和凭据的运行时引用
轮询周期
对账周期
SQLite 路径
动作凭证有效期
Company 列表
每个 Company 的默认审批人
每种 Approval 类型的审批人路由
Paperclip 公网页面地址
```

敏感配置只通过部署环境或受控文件注入，不写入仓库和普通日志。

---

## 14. 部署方式

推荐作为独立容器运行：

```text
paperclip-server
paperclip-db
paperclip-feishu-bridge
```

外挂容器需要：

- 能访问 Paperclip HTTP API。
- 能访问飞书开放平台。
- 持久化挂载 SQLite 数据目录。
- 只读挂载非敏感业务配置。
- 通过运行环境注入敏感配置。

首个版本不要求修改 Paperclip 主仓库的 Docker Compose，可以单独部署和运维。

---

## 15. 可观测性

日志建议包含：

- approvalId。
- companyId。
- Approval 类型。
- 脱敏后的飞书用户标识。
- messageId。
- eventId。
- action。
- Paperclip HTTP 状态。
- 飞书错误码。
- 重试次数。

禁止记录认证凭据、完整动作凭证和敏感 Approval payload。

建议指标：

```text
pending_approvals_discovered_total
approval_cards_sent_total
approval_card_send_failures_total
approval_callbacks_total
approval_callback_duplicates_total
approval_version_mismatches_total
paperclip_decision_requests_total
paperclip_decision_failures_total
decision_committed_side_effect_unknown_total
reconciliation_repairs_total
credential_invalidations_total
```

告警规则：

- `decision_committed_side_effect_unknown_total` 增加时触发高优先级告警，通知运维检查 Paperclip 内部副作用完整性。
- `approval_version_mismatches_total` 持续增加时触发中优先级告警，可能表示频繁 resubmit 或 Web/飞书并发冲突。

健康检查至少覆盖：

- SQLite 可读写。
- Paperclip API 可达。
- 飞书长连接状态。
- 最近一次成功轮询时间。

---

## 16. 第一阶段实施范围

### 16.1 必须实现

1. 独立 Node.js/TypeScript 外挂服务。
2. Paperclip Board API Key 认证。
3. 多 Company pending Approval 轮询。
4. Approval 类型到飞书审批人的静态路由。
5. 飞书单聊交互式卡片。
6. 通用 Approval 的同意和拒绝。
7. 回调动作凭证校验（含版本绑定）。
8. 飞书回调事件去重。
9. SQLite 投递和审计记录（含版本快照字段）。
10. 卡片状态更新。
11. Reconciliation 补偿（含版本不一致处理）。
12. Dockerfile 和部署说明。
13. `decision_committed_side_effect_unknown` 状态处理与告警。

### 16.2 暂不实现

- Paperclip 核心代码改动。
- Paperclip 数据库迁移。
- Plugin SDK 改动。
- Paperclip 用户与飞书用户正式绑定。
- 多级审批和会签。
- 飞书群审批。
- 飞书原生审批中心。
- 飞书 SSO。
- 分布式消息队列和 Outbox。
- 多实例 Active-Active Bridge。

---

## 17. 验收标准

### 17.1 功能验收

1. 新建受支持的 pending Approval 后，10 秒内审批人收到飞书卡片。
2. 同意后 Paperclip 状态变为 `approved`。
3. 拒绝后 Paperclip 状态变为 `rejected`。
4. Paperclip 按 Approval 类型执行对应副作用（hire_agent 涉及 Agent 激活/终止和预算；存在 requestedByAgentId 时可能 Wakeup；所有类型记录 Activity）。
5. 多人同时点击最终只产生一次有效状态变更。
6. 外挂重启后能够识别 `sending` 或 `unknown` 投递并通过幂等键、消息查询或对账尽量避免重复卡片。
7. 外挂停机期间产生的审批，恢复后能够补发。
8. 飞书审批后，Web UI 审批列表和 Inbox 通过现有 Activity 实时更新机制刷新。
9. Paperclip 页面直接审批后，飞书卡片能在对账周期内更新。
10. 飞书故障不影响 Paperclip Web 页面审批。
11. `budget_override_required` 不显示可操作审批按钮，并明确引导到 Paperclip 预算控制页面处理。
12. Approval 经历 resubmit 后（状态仍为 pending 且 updatedAt 或 payload 变化），旧飞书卡片的操作被拒绝，旧凭证失效，记 `version_mismatch`，对账周期内重发新卡片。已终态或 `revision_requested` 的 Approval 不记为 `version_mismatch`。
13. Paperclip 返回 5xx 且 Approval 已达目标终态时，Bridge 记录 `decision_committed_side_effect_unknown`、触发告警、不盲目重试写操作、不自行补偿内部副作用。

### 17.2 安全验收

1. 未配置的飞书用户不能审批。
2. 过期、伪造或版本不匹配的动作凭证不能审批。
3. 重复事件最终不会产生第二次有效 Approval 状态变更，回调审计能够区分处理中、成功、可重试失败、永久失败、版本不匹配和副作用未知。
4. 日志中不包含认证凭据和完整动作凭证。
5. 外挂用户不能访问未加入的 Company。
6. 卡片不出现敏感 Approval payload。

---

## 18. 后续演进（零源码原则约束）

后续演进仍只能发生在 Sidecar、飞书应用或外围基础设施层面。任何超出现有 Paperclip 公开 REST API 能力的需求，在本方案下标记为**不支持**，不通过修改 Paperclip 源码、数据库或 Plugin SDK 实现。

### 18.1 真实飞书审批人成为 Paperclip Actor — 不支持

Paperclip 当前 API 不支持外部身份映射，`decidedByUserId` 只能记录 Bridge 专用用户。在零源码原则下，真实飞书 Actor 无法成为 Paperclip 审批主体。此需求不通过修改 Paperclip 外部身份接口实现。

### 18.2 Paperclip 原生可靠事件通知 — 不支持

当前 Paperclip 事件总线是进程内机制，不是持久化消息队列，不存在可被外部订阅的可靠 Webhook 或 Outbox。在零源码原则下，Bridge 只能通过轮询和对账实现最终一致性，不通过修改 Paperclip 事件系统实现。

### 18.3 飞书统一待办中心

可在 Sidecar 侧接入飞书三方审批中心 API，同时保持 Paperclip 为事实来源。此演进不涉及 Paperclip 修改。

### 18.4 多级审批 — 不支持

会签、或签、顺序审批、审批代理等需求需要 Paperclip Approval 模型支持。在零源码原则下，Bridge 不私自维护复杂审批状态机，此需求标记为不支持。

---

## 19. 结论

当前推荐方案：

```text
独立 paperclip-feishu-bridge
    + 飞书长连接
    + 飞书交互式单聊卡片
    + Paperclip 专用 Board API Key
    + Paperclip 现有 Approval REST API
    + 外挂 SQLite
    + 定时轮询和状态对账
```

对 Paperclip 的影响：

```text
核心代码修改：0
数据库迁移：0
Plugin SDK 修改：0
Approval 状态机修改：0
权限模型修改：0
```

### 可承诺

- Paperclip 零修改。
- Sidecar 故障隔离，不影响 Paperclip 自身运行。
- 现有 approve/reject API 写回。
- 重复 approve/reject 最多一次有效决定（Paperclip 条件更新保证）。
- 审计与告警。
- 回调读取时已检测到版本变化时，必须拒绝旧卡片。

### 不可承诺

- requestRevision/resubmit 与 approve/reject 跨入口严格一致。
- 分布式事务或跨组件原子性。
- 飞书卡片 exactly-once 投递。
- Paperclip 内部副作用原子成功。
- 真实飞书 Actor 作为 Paperclip 审批主体。
- Approval-only 权限 token。
- Active-Active 多实例。
- 多级审批、会签、顺序审批。
- 预算通用审批（`budget_override_required` 飞书操作）。
- GET 版本校验与 POST 提交之间无竞态。

代价是 Paperclip 内部记录的决策用户为 Bridge 专用用户，真实飞书审批人通过 `decisionNote` 和外挂审计数据保存。对于当前“通知飞书相关人员并在飞书中完成人类审批”的目标，这是最简单、稳定、容易上线和回滚的实现路径。
