# Feishu Bridge 能力状态

> 基于当前仓库实现整理。Feishu Bridge 是独立 Sidecar，通过 Paperclip 现有 REST API 和 Board API Key 接入，不修改 Paperclip Core 源码、数据库或 Plugin SDK。

## 能力状态表

| 能力 | 当前状态 | 说明 |
|---|---|---|
| Paperclip 通用 Approval 发现 | 已实现 | 定时轮询各已配置 Company 的 pending approvals。 |
| 飞书审批卡片发送 | 已实现 | 按 Company、审批类型和审批人路由发送交互式单聊卡片。 |
| 飞书直接同意/拒绝 | 已实现 | `hire_agent`、`approve_ceo_strategy`、`request_board_approval` 可通过现有 Paperclip Approval API 写回结果。 |
| 查看审批详情 | 已实现 | 可在飞书卡片内查看审批信息、关联 Issue 和评论。 |
| 飞书回调身份与权限校验 | 已实现 | 校验动作 Token、审批 ID、Company、操作人和配置审批人。 |
| 审批版本绑定 | 已实现，best-effort | 卡片绑定审批更新时间和 payload 哈希，可降低旧卡片操作新版本审批的风险，但无法消除 GET 与 POST 之间的竞态窗口。 |
| 重复回调防护 | 已实现 | 使用回调事件记录和 Paperclip 状态机避免产生第二次有效审批变更。 |
| Paperclip Web 操作后同步飞书卡片 | 已实现，最终一致 | 通过定时对账发现状态变化并更新飞书卡片，不是实时事件推送。 |
| 投递、回调和动作凭证持久化 | 已实现 | 使用外挂 SQLite 保存投递记录、回调审计和动作 Token。 |
| Bridge 重启后补发待审批通知 | 已实现 | 恢复后重新轮询 pending approvals，并依据投递记录去重或补发。 |
| 多 Company 隔离与路由 | 已实现 | 每个 Company 独立配置飞书应用绑定、默认审批人和类型路由。 |
| Paperclip CLI 授权接入 | 已实现 | 管理界面支持连接并授权 Paperclip，保存 Board API Key 和授权元数据。 |
| 飞书 App 配置与连通性测试 | 已实现 | 管理界面支持飞书凭据校验、长连接检查和测试卡片结果等待。 |
| `budget_override_required` 飞书直接处理 | 不支持 | 当前仅发送只读通知和详情，不通过通用 approve/reject API 操作。 |
| 飞书侧“请求修改” | 不支持 | 当前卡片只提供同意、拒绝和查看详情。 |
| Paperclip Issue 状态变化通知 | 未实现 | 当前 Bridge 只围绕 Approval 工作。 |
| Agent 运行、失败、完成通知 | 未实现 | 尚未接入 Agent 运行事件。 |
| Activity、Routine、Goal 等通用通知 | 未实现 | 尚未实现 Paperclip 全事件通知桥。 |
| Paperclip 原生 Webhook / 可靠事件订阅 | 不支持 | Paperclip 当前没有供外部 Bridge 使用的持久化 Webhook 或 Outbox，当前使用轮询和对账。 |
| 飞书用户映射为 Paperclip 真实审批 Actor | 不支持 | Paperclip 中记录的是 Bridge 所使用的 Board 用户，真实飞书操作人仅写入 decision note 和 Bridge 审计。 |
| 多级审批、会签、顺序审批 | 不支持 | 当前不维护独立复杂审批状态机。 |
| Active-Active 多实例 | 不支持 | 当前设计按单有效 Bridge 实例运行。 |
| 飞书原生审批中心 | 未实现 | 当前使用飞书交互式消息卡片，不是飞书原生审批中心。 |

## 当前定位

当前实现可视为：

- **Paperclip 人类审批专用飞书 Bridge：主要闭环已实现。**
- **Paperclip 通用飞书通知桥：尚未实现。**
- **Paperclip Core 原生集成：未实现；当前为零源码修改的外部 REST API 集成。**
