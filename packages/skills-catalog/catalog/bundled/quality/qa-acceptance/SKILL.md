---
name: qa-acceptance
description: 为功能变更产出 QA acceptance criteria 和手工验证计划，覆盖 golden path、边界情况、错误状态、性能限制，以及明确的 pass/fail 证据。
key: paperclipai/bundled/quality/qa-acceptance
recommendedForRoles:
  - qa
  - engineer
  - product
tags:
  - qa
  - acceptance
  - validation
  - testing
---

# QA 验收

编写 reviewer 能在运行中的 app 上执行，并独立判断 pass / fail 的 acceptance criteria。criteria 是契约；自动化测试覆盖正确性，QA 覆盖功能级行为。

## 何时使用

- 功能变更即将进入 QA，需要书面验证计划。
- reviewer 被要求验证影响用户可见行为的 PR。
- 事故复盘要求在防复发前补充 regression check。
- release candidate 需要发布前 smoke pass。

## 何时不要使用

- 改动只涉及 unit test 或内部实现（utility refactor、内部命名）。acceptance criteria 是不必要的噪音。
- 你被要求针对 API contract 写测试。应使用 contract testing，而不是功能 QA。

## Acceptance criteria 格式

每条 criterion 是单个可独立验证的陈述：

```md
- **Given** <起始状态>, **when** <动作>, **then** <可观察结果>.
```

示例：

```md
- **Given** CSV export 有 0 行数据, **when** 用户点击 Export, **then** 下载的文件只包含 header row，且 UI 显示 "Exported 0 rows"。
```

避免一条 criterion 包含多个 `when` 或 `then`。拆开写。

## 每个计划必须覆盖

1. **Golden path。** 最常见的成功流程，端到端覆盖。
2. **空状态与最小状态。** 0 个 item、1 个 item、缺少可选输入。
3. **边界输入。** 最大长度字符串、最大数值、Unicode、适用时的 RTL 文本。
4. **错误状态。** 网络失败、权限拒绝、validation 失败、conflict (409)、not found (404)。
5. **并发与顺序。** 两个用户同时操作、与 background job 竞争、mutation 期间刷新。
6. **性能边界。** 变更必须处理的最大现实输入，不应 UI 卡死或 timeout。
7. **向后兼容。** 既有数据、既有 URL、持久化用户偏好继续可用。
8. **Telemetry 与 audit。** 变更应产生的 events、logs 或 activity entries。

若某节确实不适用，写 `N/A: <原因>`，不要静默省略。

## 证据

每条 criterion 在验证时都需要证据：

- UI 行为用 screenshot 或短 clip。
- API 行为用 console / network 输出。
- telemetry 用 log snippet 或 activity row。
- 性能 criteria 用时间测量。

没有证据的 “Looks good to me” 不是 pass。

## 隔离与跟进

- 失败 criterion 会阻塞验收，除非 owner 明确 waiver 并关联 follow-up issue。
- 没有 linked follow-up 的 “Known issue” 不是 waiver。
- 如果中途新增 criterion，重新开始该 pass；部分覆盖会掩盖 regression。

## 交还给作者

返回验证计划，包含三节：

- **Pass。** 已通过 criteria，附一行证据摘要。
- **Fail。** 失败 criteria，附精确复现步骤。
- **Blocked。** 无法运行的 criteria，附原因。

作者负责将失败项转成修复或接受的 deferral。

## 反模式

- 把 acceptance 写成测试计划（“为 X 写 Cypress test”）。acceptance 是变更发布后应成立的事实；测试只是检查方式。
- criteria 依赖实现细节（selector、query plan）。保持可观察。
- 长 checklist 没有优先级。明确标记 must-pass criteria 和 nice-to-have。
- 验证报告说 “passed” 但没有证据。reviewer 无法审计。
