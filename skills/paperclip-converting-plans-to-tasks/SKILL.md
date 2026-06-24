---
name: paperclip-converting-plans-to-tasks
description: >
  Paperclip 将计划转换为可执行任务的方法。凡是在 Paperclip company 内被要求 plan、
  scope 或 break down work 时使用。提供行业无关的指导，说明如何把 plan 转成带正确
  specialty、dependencies 和 parallelization 的 assigned issues，让 Paperclip executor
  能接手执行；它不规定 plan 格式。与 `paperclip` skill 配合使用；后者覆盖写入 plan
  document 和重新分配 issue 的具体机制。
---

# Paperclip：将计划转换为任务

这是把 plan 转成可执行 Paperclip 工作的 companion skill。它**不**规定 plan structure；使用适合工作和用户偏好的任何格式。它说明如何将该 plan 翻译成 issues，让 Paperclip 的其他机制为你工作。

关于记录 plan 的**具体机制**（key 为 `plan` 的 issue document、comment link、approval gate、要重新分配给谁），遵循 `paperclip` skill 的 _Planning_ section。本 skill 覆盖 planning method，不覆盖 API surface。

## 当你被要求规划时

- **深入规划。** 尽可能捕获真实细节：goals、constraints、unknowns、success criteria、risks。浅计划会在下游返工；assignee 只能执行他们读得到的内容。
- **了解团队。** 分配前先查公司 agents 和他们的 specialties（reporting lines、role descriptions、prior work）。不要默认把工作分给自己；有更适合的 agent 就用它。不要分配给未核查的名字。
- **按 specialty 分配。** 每块工作交给最相关的 agent。若无人合适，明确指出缺口：hire、tool、external dependency 或 board decision，不要糊过去。
- **承担责任。** specialty matching 是双向的：当你是某块工作的最佳 agent，就分配给自己，不要 reflexively delegate。不要为了躲负载而交接。
- **使用 dependency tree。** Paperclip executor 会自动启动所有没有 open blockers 的 assigned task。把每个具体 deliverable 表达为 issue，并用 `blockedByIssueIds` 连接真实 blocker（不要写 prose “blocked by X”）。当 blocker `done` 后，dependents 会自动 wake。
- **先排序，再并行。** 按真实 dependencies 排序，不按个人偏好排序。graph 的独立分支应并行启动。不同于人，大多数 agents 允许 concurrent runs，因此可以把并行工作分给同一个 agent。
- **足够即可。** plan 是为了解锁 execution，不是替代 execution。若下一步小而明确，直接做，或让 plan 自身成立。反复重新规划，或把一个 agent 能很快完成的工作拆到比执行更久，是拖延；交付点东西。

## 发布计划前的快速 checklist

- [ ] 细节足够，assignee 无需反复追问即可行动。
- [ ] 每个具体 deliverable 都是 issue，或被点名为 known follow-up。
- [ ] 每个 issue 都有有意选择、匹配 specialty 的 assignee，而不是默认 planner。
- [ ] 每个 issue 的真实 blocker 都通过 `blockedByIssueIds` 声明。
- [ ] 独立分支可以并行启动。
- [ ] 缺口（missing skills、hires、decisions、external inputs）被显式暴露，没有隐藏。

## 本 skill 不是什么

- 不是 plan template。使用任何适合的格式：prose、outline、table、RACI、Gantt 都可以。
- 不是软件开发专属。marketing、research、ops、design、hiring、finance 等工作同样适用。
- 不是 `paperclip` skill planning mechanics 的替代品。两个一起用。
