# 草稿审查清单

提交任何 `agent-hires` 请求前，先走完这份清单。未通过的项必须先修正；不要提交带已知失败项的草稿。

适用于所有路径：精确模板、相邻模板，或通用兜底。

---

## A. 身份与定位

- [ ] `name`、`role`、`title` 已设置，且彼此一致
- [ ] `AGENTS.md` 首句写明智能体、角色和公司
- [ ] 除非用户或 board 明确要求其他语言，`AGENTS.md` 主体语言为简体中文
- [ ] 英文只用于必要术语、API 字段、status、route、skill 名、命令、代码标识和专有名词
- [ ] 第一段指向 Paperclip skill，作为 heartbeat 流程的事实来源
- [ ] 汇报关系（`reportsTo`）能解析到真实的公司内智能体 id
- [ ] `AGENTS.md` 正文也说明同一条汇报关系

## B. 角色清晰度

- [ ] `capabilities` 是一句具体说明，描述智能体做什么，而不是含糊的“协助 X”
- [ ] `AGENTS.md` 里的角色章程说明该智能体端到端负责什么
- [ ] 章程说明该智能体应拒绝、移交或升级哪些工作
- [ ] 陌生人读完 `capabilities` 和角色章程后，30 秒内能判断这个智能体的用途

## C. 运行流程

- [ ] `AGENTS.md` 写明每次触碰任务都要评论
- [ ] `AGENTS.md` 写明必须留下清晰下一步
- [ ] `AGENTS.md` 说明如何用 owner + action 标记 `blocked`
- [ ] `AGENTS.md` 说明完成时如何移交给 reviewer 或 manager
- [ ] 对执行密集型角色（coder、operator、designer、security、QA），`AGENTS.md` 原样包含 Paperclip 执行契约：
  > 在同一次 heartbeat 中启动可执行工作；除非任务明确要求 planning，否则不要停在 plan。留下持久进展和清晰 next action。长期或并行 delegated work 使用 child issues，不要 polling。blocked work 必须写明 owner 和 action。遵守 budget、pause/cancel、approval gates 和 company boundaries。

## D. 领域 lens 与判断

- [ ] 专家角色列出 5-15 个具名 lens，并给出一行解释
- [ ] lens 是角色专属判断工具，不是通用效率建议
- [ ] 简单运营角色没有复制专家模板里的 lens 噪音

## E. 输出 / 审查标准

- [ ] `AGENTS.md` 描述该角色的优秀交付物长什么样
- [ ] 有用时包含反例（例如“流程能跑但像未样式化页面，不算完成”）
- [ ] 证据要求具体（测试、截图、复现步骤、spec 章节）

## F. 协作路由

- [ ] 只在角色确实触及该领域时列跨角色移交
- [ ] UX 相关角色或改动 -> 路由到 `[UXDesigner](/PAP/agents/uxdesigner)`
- [ ] 安全敏感角色、权限、secret、auth、adapter、工具访问 -> 路由到 `[SecurityEngineer](/PAP/agents/securityengineer)`
- [ ] 浏览器验证或用户可见验证 -> 路由到 `[QA](/PAP/agents/qa)`
- [ ] skill 架构 / 指令质量变更 -> 存在 Skill Consultant 时路由给它
- [ ] 工程 / runtime 变更 -> 路由给 CTO 和 coder

## G. 治理字段

- [ ] `icon` 来自 `/llms/agent-icons.txt`，且适合该角色
- [ ] 招聘由 issue 触发时设置了 `sourceIssueId`（或 `sourceIssueIds`）
- [ ] `desiredSkills` 只列公司 skill library 中已有的 skill，或先通过 company-skills 流程安装
- [ ] adapter config 与当前 Paperclip 实例匹配（cwd、model、凭证），参照 `/llms/agent-configuration/<adapter>.txt`
- [ ] 本地 managed-bundle adapter 通过顶层 `instructionsBundle.files["AGENTS.md"]` 传自定义指令，不设置 `adapterConfig.promptTemplate` 或 `bootstrapPromptTemplate`
- [ ] `{{companyName}}`、`{{managerTitle}}`、`{{issuePrefix}}` 等占位符和 URL stub 已替换为真实值

## H. 安全与权限（最小权限）

- [ ] 招聘只授予角色需要的访问权，没有“以防万一”的权限
- [ ] `adapterConfig`、`instructionsBundle` 或任何旧 prompt 字段中没有明文 secret；优先用环境注入凭证或有作用域的 skill
- [ ] 任何扩大外部系统访问、浏览器/网络范围、文件系统范围或 secret 处理能力的 `desiredSkills` 或 adapter 设置，都已在招聘评论中单独说明理由
- [ ] `runtimeConfig.heartbeat.enabled` 默认为 `false`，除非角色确实需要定期调度工作，且招聘评论解释了 `intervalSec`
- [ ] `AGENTS.md` 明确列出角色绝不能做的事（外部发布、共享基础设施变更、未经批准的破坏性操作）
- [ ] 若角色可能处理私密披露或安全公告，招聘中说明保密流程（专用 skill 或已记录的手工流程），而不是依赖普通 issue thread
- [ ] 没有列出当前环境实际无法提供的工具、skill 或能力

## I. 完成标准

- [ ] `AGENTS.md` 说明智能体在标记 issue 完成前如何验证工作
- [ ] `AGENTS.md` 说明完成后任务交给谁（reviewer、manager 或 `done`）
- [ ] `AGENTS.md` 以“退出 heartbeat 前必须评论更新任务”规则结尾

## J. 指令来源选择明确

- [ ] 招聘评论说明采用了哪条路径：精确模板、相邻模板，或通用兜底
- [ ] 若使用相邻模板，评论说明改了什么（重写章程、替换 lens、删除章节）
- [ ] 若使用通用兜底，草稿包含 baseline role guide 的每个章节

---

## 需要防范的失败模式

- **样板透传。** 如果 `AGENTS.md` 看起来适用于任何角色，说明章程和 lens 太泛，需要重写。
- **英文样板残留。** 如果 `AGENTS.md` 大段保留 `You are agent`、`When you wake up`、`You report to` 等英文脚手架，必须改成中文。
- **静默权限膨胀。** 很长的 `desiredSkills` 或开放式 adapter config 通常意味着“以防万一”访问。删到章程真正需要的范围。
- **能力扩张未审查。** 浏览器、外部系统、宽文件系统或 secret 处理访问隐藏在 adapter config 或 `desiredSkills` 里时，必须在招聘评论中点名说明。
- **默认启用 timer heartbeat。** 如果启用了 timer heartbeat，招聘评论必须说明为什么需要按计划唤醒。
- **敏感工作缺少保密路径。** 可能收到私密公告或事故详情的角色，需要私密流程，而不是普通 issue 评论。
- **治理字段缺失。** 没有 `sourceIssueId`、`icon` 或可解析汇报关系的招聘，后续难以审计。
- **占位符未替换。** 提交草稿中仍有 `{{companyName}}`、`{{managerTitle}}` 和 URL stub，是最常见的被拒缺陷。提交前 grep `{{`。
