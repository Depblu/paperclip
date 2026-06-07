# AGENTS.md

本仓库的人类与 AI 贡献者协作指引。

## 1. 目的

Paperclip 是面向 AI 代理公司的控制平面。
当前实现目标是 V1，定义见 `doc/SPEC-implementation.md`。

## 2. 必读顺序

修改前,按顺序阅读:

1. `doc/GOAL.md`
2. `doc/PRODUCT.md`
3. `doc/SPEC-implementation.md`
4. `doc/DEVELOPING.md`
5. `doc/DATABASE.md`

`doc/SPEC.md` 提供长期产品上下文。
`doc/SPEC-implementation.md` 是 V1 的具体构建契约。

## 3. 仓库结构

- `server/`: Express REST API 与编排服务
- `ui/`: React + Vite 看板 UI
- `packages/db/`: Drizzle schema、迁移、DB 客户端
- `packages/shared/`: 共享类型、常量、校验器、API 路径常量
- `packages/adapters/`: 代理适配器实现(Claude、Codex、Cursor 等)
- `packages/adapter-utils/`: 适配器共享工具
- `packages/plugins/`: 插件系统包
- `doc/`: 运营与产品文档

## 4. 开发环境(自动数据库)

开发环境保持 `DATABASE_URL` 未设置,使用内嵌 PGlite。

```sh
pnpm install
pnpm dev
```

启动后:

- API: `http://localhost:3100`
- UI: `http://localhost:3100`(由 API 服务在 dev middleware 模式下提供)

快速检查:

```sh
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

重置本地开发数据库:

```sh
rm -rf data/pglite
pnpm dev
```

## 5. 核心工程规范

1. 变更以公司为单位隔离。
   每个领域实体都应归属于某个公司,且公司边界必须在 routes/services 中强制执行。

2. 契约保持同步。
   修改 schema/API 行为时,需同步更新所有受影响层:
   - `packages/db` schema 与导出
   - `packages/shared` 类型/常量/校验器
   - `server` routes/services
   - `ui` API 客户端与页面

3. 保留控制平面不变量。
   - 单承接人任务模型
   - 原子化的 issue checkout 语义
   - 受控动作的审批闸口
   - 预算硬上限自动暂停行为
   - 变更动作的活动日志

4. 未经要求不整体替换战略文档。
   优先采用增量更新。保持 `doc/SPEC.md` 与 `doc/SPEC-implementation.md` 对齐。

5. 仓库计划文档需带日期并集中管理。
   在仓库内创建计划文件时,新计划文档应放在 `doc/plans/`,文件名格式 `YYYY-MM-DD-slug.md`。这不替代 Paperclip issue 规划:若 Paperclip issue 要求计划,应按 `paperclip` 技能更新 issue 的 `plan` 文档,而不是创建仓库级 markdown。

6. 附带可检查的生成产物。
   当任务产出用户可检查的文件时,在最终处理前遵循 Paperclip 技能中的 "Generated Artifacts and Work Products" 工作流。本仓库优先使用 `skills/paperclip/scripts/paperclip-upload-artifact.sh` 自包含脚本,确保文件通过 Paperclip API 可用;在交付物为文件时创建/更新 artifact 工作产品;在最终 issue 评论中链接已上传 artifact,然后再设置状态。不要仅依赖本地文件系统路径作为唯一访问方式。`.mp4` 与 `.webm` 示例见 `doc/AGENT-ARTIFACTS.md`。

## 6. 数据库变更流程

修改数据模型时:

1. 编辑 `packages/db/src/schema/*.ts`
2. 确保新表从 `packages/db/src/schema/index.ts` 导出
3. 生成迁移:

```sh
pnpm db:generate
```

4. 校验编译:

```sh
pnpm -r typecheck
```

注意:
- `packages/db/drizzle.config.ts` 从 `dist/schema/*.js` 读取已编译 schema
- `pnpm db:generate` 会先编译 `packages/db`

## 7. 交付前验证

本地/代理默认测试路径:

```sh
pnpm test
```

这是轻量默认,只跑 Vitest 套件。浏览器套件按需启用:

```sh
pnpm test:e2e
pnpm test:release-smoke
```

仅在变更涉及浏览器套件,或明确验证 CI/发布流程时才运行浏览器套件。

常规 issue 工作先跑最相关的最小验证。当更窄的检查足以证明变更正确时,不要在每次心跳都默认跑全仓 typecheck/build/test。

在宣称 PR-ready 交付完成前,或当变更范围广、针对性检查不够时,运行完整检查:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

若某些步骤无法运行,需明确报告未运行内容及原因。

## 8. API 与认证约定

- 基础路径: `/api`
- 看板访问视为全控操作员上下文
- 代理访问使用 bearer API key(`agent_api_keys`),静态存储时哈希
- 代理 key 不得访问其他公司

新增接口时:

- 实施公司访问检查
- 强制执行 actor 权限(看板 vs 代理)
- 为变更操作写入活动日志
- 返回一致的 HTTP 错误(`400/401/403/404/409/422/500`)

## 9. UI 约定

- 路由与导航与可用 API 接口保持一致
- 公司范围页面使用公司选择上下文
- 明确暴露失败;不得静默忽略 API 错误

## 10. Pull Request 要求

创建 PR(通过 `gh pr create` 或其他方式)时,**必须**阅读并填写 [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) 的每一节。不要临时拼凑 PR 正文 — 以模板作为 PR 描述结构。必填小节:

- **Thinking Path** — 从项目上下文推导至本次变更的推理链路(示例见 `CONTRIBUTING.md`)
- **What Changed** — 具体变更的项目符号列表
- **Verification** — 评审者如何确认可用
- **Risks** — 可能出错的点
- **Model Used** — 产出或协助本次变更的 AI 模型(提供商、精确模型 ID、上下文窗口、能力)。若未使用 AI,填写 "None — human-authored"。
- **Checklist** — 所有项已勾选

## 11. 完成标准

变更在以下条件全部满足时视为完成:

1. 行为符合 `doc/SPEC-implementation.md`
2. Typecheck、测试、构建全部通过
3. 契约在 db/shared/server/ui 同步
4. 行为或命令变更时文档已更新
5. PR 描述遵循 [PR 模板](.github/PULL_REQUEST_TEMPLATE.md),所有小节(含 Model Used)已填写

## 11. Fork 专属: HenkDz/paperclip

这是 `paperclipai/paperclip` 的 fork,在 `feat/externalize-hermes-adapter` 分支([tree](https://github.com/HenkDz/paperclip/tree/feat/externalize-hermes-adapter))上带 QoL 补丁与**仅外部**的 Hermes 适配器方案。

### 分支策略

- `feat/externalize-hermes-adapter` → 核心**不**包含 `hermes-paperclip-adapter` 依赖,**不**含内置 `hermes_local` 注册。通过 Adapter Plugin 管理器(`@henkey/hermes-paperclip-adapter` 或 `file:` 路径)安装 Hermes。
- 较老的 fork 分支可能仍记录内置 Hermes;对 externalize 分支以本文件为准。

### Hermes(仅插件)

- 通过 **Board → Adapter manager** 注册(与 Droid 相同)。包加载后类型仍为 `hermes_local`。
- UI 使用包内的通用 **config-schema** + **ui-parser.js** — `server/` 与 `ui/` 源码中无 Hermes 导入。
- 可选:在 `~/.paperclip/adapter-plugins.json` 添加 `file:` 条目,用于适配器仓库的本地开发。

### 本地开发

- Fork 运行在 3101+ 端口(若 3100 被上游实例占用则自动检测)
- `npx vite build` 在 NTFS 上挂起 — 改用 `node node_modules/vite/bin/vite.js build`
- 从 NTFS 启动服务需 30-60s — 不要立即判定失败
- 启动前杀掉所有 paperclip 进程: `pkill -f "paperclip"; pkill -f "tsx.*index.ts"`
- Vite 缓存在 `rm -rf dist` 后仍存在 — 两个都删: `rm -rf ui/dist ui/node_modules/.vite`

### Fork QoL 补丁(上游无)

这些是 fork UI 中的本地修改。若重新拷贝源码,必须重新应用:

1. **stderr_group** — `RunTranscriptView.tsx` 中 MCP 初始化噪音的琥珀色折叠面板
2. **tool_group** — 连续非终态工具(write、read、search、browser)的折叠面板
3. **Dashboard excerpt** — `LatestRunCard` 剥离 markdown,显示前 3 行/280 字符

### 插件系统

PR #2218(`feat/external-adapter-phase1`)增加外部适配器支持。完整细节见根 `AGENTS.md`。

- 适配器可通过 `~/.paperclip/adapter-plugins.json` 作为外部插件加载
- plugin-loader 应**零**硬编码适配器导入 — 纯动态加载
- `createServerAdapter()` 必须包含所有可选字段(尤其是 `detectModel`)
- 内置 UI 适配器可能遮蔽外部插件解析器 — 完全外化时移除内置
- 参考外部适配器: Hermes(`@henkey/hermes-paperclip-adapter` 或 `file:`)与 Droid(npm)
