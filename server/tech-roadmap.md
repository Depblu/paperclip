# 技术路线图 v0 — 领完 (Lingwan)

## CEO 摘要

**Tech stack**: Next.js (全栈) + Turso (SQLite edge) + Auth.js + Vercel (部署)。**MVP**: 3 周上线 5 用户内测，覆盖 B2B 申领创建→审批→履约→审计全链路，无发票 OCR、无多级组织、无 SSO。**首 6 周**: W1-W2 搭骨架，W3-W4 跑通核心流程，W5-W6 硬化到可交付。**最大风险**: 审批流引擎从零写 vs 买 vs 嵌入 — 选错将吃掉 2 周回退时间。

---

## 一、Tech Stack 选型

### 1.1 前端

| 选择 | 理由 | 否决备选 | 否决理由 |
|------|------|----------|----------|
| **Next.js 14 (App Router)** | 全栈一体化，减少认知开销；SSR/SSG 免费；Vercel 生态闭环 | Remix | 社区小 1 轮，招聘难度 ×2 |
| | | SPA (Vite + React) | 需要额外搭 API server, SEO 要用 SSR 补, 对 B2B 场景无优势 |
| **Tailwind CSS + shadcn/ui** | 组件可审计(源码可见), 改色系统即 rebrand; 5 人内团队无需设计系统团队 | Ant Design | 太重, Table 太多无用的; UI 锁死, 改品牌需要 override 成本 |
| | | Material UI | 同上; 首屏 JS 过大 |
| **TanStack Query** | 声明式缓存 + optimistic update 天然适合审批类操作 | SWR | 功能对等但生态小; 招聘面窄 |
| **Zustand** | 认证/权限 client state 需要; Zustand 是 200 行, 比 Redux 少 10× | Redux Toolkit | 样板代码比业务代码多 |
| **Vitest + Playwright** | Vitest 与 Vite 共享配置; Playwright 是唯一事实标准 | Jest | Jest 已事实被 Vitest 替代; 配置繁琐 |

**可逆性**: 前端框架是**可逆**的（B2B 用户不关心 URL 结构），但切换成本 ~2 周。Tailwind 完全可逆。TanStack Query 可逆。

### 1.2 后端

| 选择 | 理由 | 否决备选 | 否决理由 |
|------|------|----------|----------|
| **Next.js API Routes (App Router)** | MVP 无需独立 server; 与前端同仓库减少上下文切换 | Express/Fastify + separate deploy | 多一个独立部署单元, MVP 阶段纯开销 |
| | | Python FastAPI | 如果团队 Python 为主会选它, 但全栈 Next.js 需要 JS 团队 |
| **tRPC** (type-safe RPC) | 端到端类型安全，无需 manual API 文档; Prisma → tRPC → 前端类型链条不断 | REST (手写) | 无类型安全, 需要手动同步 contract; B2B 场景 API 数量有限但类型复杂 |
| | | GraphQL (Apollo) | 过度抽象; 查询复杂度不可控; 5 人团队不要引入 schema registry |
| **Auth.js (v5)** | 内置 credential + OAuth adapter; 支持 Turso Drizzle adapter | Clerk | 锁定外部服务; 自托管不能; B2B 隐私需求可能强制 on-prem |
| | | Lucia | 社区版已 archive; 转手 Auth.js |
| **Drizzle ORM** | 比 Prisma 更接近 SQL, bundle size 小, Turso 原生支持 | Prisma | Prisma engine 二进制文件 20MB+; Turso 支持晚; Drizzle 更快 |
| **Zod** | 运行时校验 + 类型推导; Drizzle 内置 | Joi/Yup | Zod 生态整合度最高 |

**可逆性**: Next.js API Routes 在用户 >50 后**不可逆**（需要拆独立 server）。tRPC 可逆（加一层 REST wrapper）。Drizzle 可逆（schema 可迁移）。

**⚠ 不可逆决策**: 数据模型（见 1.3）。审批流引擎选择（见 1.7）。

### 1.3 数据库

| 选择 | 理由 | 否决备选 | 否决理由 |
|------|------|----------|----------|
| **Turso** (SQLite edge, libsql) | 零运维, 免费额度足够 MVP(500MB/5GB/月); 与 Drizzle 无缝; 支持分支用于 preview | PostgreSQL (Supabase) | Supabase 免费额度紧 (500MB, row limit); 自托管需要 DBA 资源 |
| | | MongoDB | B2B 申领单 / 审批链需要事务和 schema 约束; NoSQL 在这里是反模式 |
| **LibSQL** (Turso 开源核心) | 可将来自托管, 不锁 Turso cloud | — | — |

**数据模型核心实体** (MVP):

```
User (id, email, name, role: admin/manager/user, orgId, createdAt)
Organization (id, name, slug, settings: JSON)
Claim (id, orgId, requesterId, category, amount, currency, status: pending/approved/rejected/fulfilled, description, attachments: string[], createdAt, updatedAt)
ClaimApproval (id, claimId, approverId, status, comment, createdAt)  — 每个审批步骤一条
Fulfillment (id, claimId, fulfilledById, amount, receiptUrl, notes, createdAt)
AuditLog (id, actorId, action, entityType, entityId, oldValue, newValue, ip, userAgent, createdAt)
```

**可逆性**: 数据库选型在没有用户数据时完全可逆（export → import）。有用户后**不可逆**（迁移成本高）。

### 1.4 部署 & 基础设施

| 选择 | 理由 | 否决备选 | 否决理由 |
|------|------|----------|----------|
| **Vercel** (Pro tier) | 与 Next.js 原生集成; preview deployments 免费; 零运维 | AWS ECS/Fargate | 需要 Docker + CI/CD 配置; MVP 阶段没人手的 DevOps |
| | | Railway | 稳定性不如 Vercel; 偶尔 cold start 问题 |
| **Turso** (cloud) | 免费额度用完前不需要操心 | — | — |
| **S3-compatible** (R2 或 AWS S3) | 附件存储 (receipts, 报销单据) | Local filesystem | 不可扩展; 多实例部署不共享 |

**可逆性**: Vercel → 自托管**不可逆**（rewrite 规则, middleware, edge runtime 都需要改）。R2 完全可逆（换 bucket URL）。

### 1.5 监控 & 可观测

| 选择 | 理由 | 否决备选 | 否决理由 |
|------|------|----------|----------|
| **Sentry** (免费 tier) | 错误追踪免费额度够 MVP | Datadog | 500 美金 / 月起; MVP 不需要 APM |
| **Axiom** (或自建 Loki) | 结构化日志; 免费 1TB/月 | Elastic | 太重; 需要 ES 运维 |
| **PostHog** (自托管免费) | 产品分析 + feature flag + session replay | Amplitude / Mixpanel | 贵; 数据不在自己手里 |

### 1.6 CI/CD

| 选择 | 理由 | 否决备选 | 否决理由 |
|------|------|----------|----------|
| **GitHub Actions** | 与 repo 同生态; 免费额度够用 | CircleCI | 独自分页; 需要多学一套 |
| **Vercel** | auto deploy on main branch | — | — |

### 1.7 身份认证 & 权限模型

**认证**: Auth.js (v5) + credentials provider (早期) + 预留 OAuth (Google/WeChat 对接位)。

**权限模型** — 扁平 RBAC:

```
Role: admin | manager | user
- admin: 全组织所有操作
- manager: 审批自己团队的申领、查看团队所有记录
- user: 创建自己的申领、查看自己记录
```

**不可逆决策**: RBAC schema 一旦有数据, 改为 ABAC/ReBAC 需要一次数据迁移。选扁平 RBAC, 不做组织层级。

### 1.8 审批流引擎

**MVP 选择**: 硬编码状态机（Claim.status 字段 + 按角色简单判断）。

```
status 流转: pending → approved_by_manager → fulfilled 或 denied
```

**否决备选**:
- Camunda/Zeebe: 太重, MVP 不需要 BPMN 建模
- Temporal: 分布式工作流, 对 5 用户场景是核武器
- Step Functions (AWS): 供应商锁定

**什么时候再回来**: 当客户 >5 且要求自定义审批链（多层、条件分支）时, 引入 [**Temporal**] 或 [**n8n** 嵌入]。

### 1.9 可审计日志

每个写操作（创建/更新/删除）写一条 AuditLog。用 Drizzle middleware 拦截所有 mutation。审计日志不删除、不改写（append-only）。

---

## 二、MVP 范围

### 2.1 核心功能（3 周 5 用户可跑通）

1. **组织注册** — 管理员创建组织, 邀请成员加入（email invite）
2. **用户登录** — email + password (Auth.js credentials)
3. **申领创建** — user 填写申领单: 类别、金额、描述、附件(图片)
4. **审批** — manager 看到待审批申领, 批准/驳回 + 备注
5. **履约** — admin 标记申领为已履约, 填写实际金额
6. **审计日志** — 所有操作记录在 AuditLog, admin 可查看
7. **基础权限** — user 只能看自己的; manager 看团队; admin 看全部

### 2.2 Cut List（明确不做）

| 不做 | 理由 | 什么时候再做 |
|------|------|------------|
| 发票 OCR / 智能识别 | 非核心验证目标; 用户可手动上传 | 用户反应填表太慢时 |
| 多级组织架构 | B2B 第一个客户大概率 <50 人 | 客户要求部门预算时 |
| SSO / SAML | 早期客户不需要 | 进入 enterprise sales 时 |
| 预算额度控制 | MVP 假设先审批后履约, 额度是审出来的 | 客户要求"预审批"额度时 |
| 移动端 | Web 端 responsive 即可 | 用户要求 APP 时 |
| 多语言 / i18n | 首版仅中文 | 有海外客户时 |
| API / Webhook | 无第三方集成需求 | 需要对接 ERP 时 |
| 报表 / 数据分析 | 先收集真实数据 | 用户想看趋势时 |

### 2.3 不可砍的底线（即使拖慢上线）

- **审计日志** — B2B 合规必需; 没有审计日志实际不可用
- **密码哈希(bcrypt)** + HTTPS 强制 — 安全基线
- **合理错误处理** — 数据不能因为异常丢失
- **数据导出** — 用户可以在任何时候带走自己的数据（合规底线, 也是信任底线）

---

## 三、首 6 周 Sprint 拆解

### Sprint 1: W1-W2 — 搭骨架

**Week 1: 基础设施 + 认证 + 数据模型**

- [ ] Next.js 项目脚手架, Tailwind + shadcn/ui 配置
- [ ] Turso 数据库初始化, Drizzle schema 定义全部实体
- [ ] Auth.js 集成 (credentials provider), 注册/登录/登出页面
- [ ] 组织创建流程（管理员注册即建组织）
- [ ] 扁平 RBAC middleware + session 注入
- [ ] AuditLog middleware (Drizzle hook)
- [ ] Vercel 部署 + 自定义域名 + HTTPS
- [ ] Sentry 集成 + 基础错误边界

**Week 2: 基础 UI + 用户管理**

- [ ] 用户邀请流程（admin 发送 invite email → 用户接收 → 注册加入组织）
- [ ] 组织设置页面（基本信息）
- [ ] 基础布局 (Sidebar + Topbar), 导航
- [ ] 用户管理页面（查看/禁用成员）
- [ ] Playwright 冒烟测试: 注册 → 登录 → 邀请 → 退出
- [ ] GitHub Actions CI (lint + test + build)
- [ ] PostHog 集成 (产品分析)

**W2 末可见 demo**: admin 注册, 邀请成员, 成员登录, 看到空组织首页。

---

### Sprint 2: W3-W4 — 核心流程

**Week 3: 申领创建 + 审批**

- [ ] 申领表单页（类别选择器、金额输入、描述、附件上传 S3）
- [ ] 申领列表页（我创建的 / 我审批的 两个 tabs）
- [ ] 申领详情页（状态 timeline、审批意见、操作按钮）
- [ ] 审批流状态机 (pending → approved → fulfilled / denied)
- [ ] 审批操作（批准/驳回 + 备注输入）
- [ ] 通知（审批待办, 先用 in-app notification banner, 下个 sprint 加 email）
- [ ] 权限校验（user 不能修改/批准他人的申领）

**Week 4: 履约 + 审计**

- [ ] 履约页（admin 标记已履约、填实付金额、传回执）
- [ ] 审计日志详情页（按时间线展示所有操作）
- [ ] 组织首页 dashboard（统计: 待审批数 / 本月申领总额 / 近 7 天趋势）
- [ ] 搜索 / 筛选申领（按状态、日期、类别）
- [ ] 错误处理: 全局 error boundary, toast 通知
- [ ] 基础 loading/skeleton/empty state 覆盖
- [ ] Playwright E2E: 创建申领 → 审批 → 履约 → 查看审计日志

**W4 末可见 demo**: 4 步完整流程跑通, 审计日志可查。

---

### Sprint 3: W5-W6 — 内测硬化

**Week 5: 可观测 + 错误处理 + 安全**

- [ ] 全局错误处理策略: 区分用户错误 vs 系统错误
- [ ] Sentry 告警规则配置 (critical errors → email/dingtalk)
- [ ] 日志规范化: 所有 API route 输出结构化日志
- [ ] Rate limiting (Vercel KV 或 simple in-memory for MVP)
- [ ] 附件上传大小限制 + 类型校验
- [ ] CSRF 防护 (Auth.js 默认已包含)
- [ ] 灰度发布策略: feature flag in PostHog, 支持按组织百分比
- [ ] 回滚策略: Vercel instant rollback; Turso DB backup cron

**Week 6: 内测准备 + 文档 + 反馈闭环**

- [ ] 5 个内测用户 onboarding guide（文字 + 录屏）
- [ ] 数据导出功能（用户可导出自己数据为 CSV）
- [ ] 内测反馈入口（in-app feedback widget, 简单 form → 写回 AuditLog）
- [ ] 性能 baseline: Lighthouse score >85, API p95 <500ms
- [ ] 加载体验: skeleton everywhere, 无白屏
- [ ] 部署 checklist: 域名, SSL, backup, alerting, 联系人
- [ ] Playwright 全流程 E2E suite (关键路径通过率 = 100%)

**W6 末交付**: 5 个内测用户获取 → 开始真实使用 → 收集第一条反馈。

---

## 四、风险登记表

| # | 风险 | 概率 | 影响 | 缓解措施 |
|---|------|------|------|----------|
| 1 | 审批流需求在第一周就超出硬编码状态机 | M | H | 预留状态机扩展点; 如客户要求多层审批, 引入 Temporal |
| 2 | Turso 免费额度不够 (500MB, 5GB 月流量) | L | M | 监控用量; 超额时升 Pro ($39/mo) 或切 libsql 自托管 |
| 3 | 附件存储成本失控 | L | M | 限制单文件 <10MB; 使用 R2 免费 10GB; 超限前提醒 |
| 4 | Vercel cold start 影响体验 | M | L | W5 测量 p95; 如 >1s 考虑 edge runtime 或 Vercel Pro 的 advanced infra |
| 5 | B2B 客户要求 on-prem 部署 | L | H | 架构上保持 libsql 可自托管; Next.js 可 Docker 化; 但不承诺 MVP 阶段 |
| 6 | MVP 用户数 <5 导致无法验证假设 | M | H | W2 开始并行寻找内测客户; 如找不到, 改为 founders 手动模拟 |
| 7 | 开发者只有 1 人, W5-W6 工作量溢出 | H | H | 前面决不允许拖延; W4 末做工作量审计, 必要时 cut 非关键功能 |

---

## 五、对 working hypothesis 的挑战

**假设**: B2B 领用 / 报销审计是一个可独立上市的产品。

**CTO 判断**: ✅ 勉强成立, 但前提是：

1. **审批流不是护城河** — 所有竞品 (分贝通、每刻报销、Expensify) 3 个月就能复刻。如果领完的 moat 是审批流本身, 那做不出来。如果需要 moat 是「审计级合规 + 零审核体验」, 那就需要在 OCR/AI 分类/自动对账上投入, 这超出 MVP 范围。
2. **MVP 验证的不是功能而是分销** — 如果 3 周跑通的流程全部是已知需求, 验证的唯一变量是"有没有人愿意用"。因此 CEO 在 W1-W2 就应该开始找内测客户, 而不是等产品出来再找。
3. **单客户 vs 多组织** — 第一个客户大概率会要求定制（自定义审批链、自定义类别）。MVP 必须硬性拒绝定制需求, 否则会拖垮工程。在 W6 反馈收集时单独跟踪"定制需求数量", 如果 >3 条说明产品定位太宽, 需要缩窄到一个垂直行业。

**不可验证的假设**: 「小企业愿意为审计合规付费」。MVP 只能验证"是否能跑通", 不能验证"是否愿意付费"。付费意愿需要另外的定价实验（W8+）。
