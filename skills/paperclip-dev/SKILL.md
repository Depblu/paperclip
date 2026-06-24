---
name: paperclip-dev
required: false
description: >
  开发和维护本地 Paperclip instance：启动/停止 servers、从 master 拉取更新、
  运行 build/test、管理 worktrees、备份 databases、诊断问题。凡是需要修改
  Paperclip codebase 本身，或保持本地 instance 健康时使用。
---

# Paperclip Dev

本 skill 覆盖本地 Paperclip instance 的日常开发和运维流程。它假设你在 Paperclip repo checkout 中工作，且 `origin` 指向 `git@github.com:paperclipai/paperclip.git`。

> **OPEN SOURCE HYGIENE：** 本仓库面向 public。任何 push 到 `origin` 的内容都应可公开发布。不要 commit 或 push secrets、API keys、tokens、private logs、PII、customer data 或任何应留在本机的配置。保持 git history 整洁；避免 push 临时分支、嘈杂 checkpoint commits，或不需要共享到 upstream 的 speculative work。

> **MANDATORY：** 运行任何 CLI command、build、test 或管理 worktrees 前，必须阅读 Paperclip repo 中的 `doc/DEVELOPING.md`。这是所有 `paperclipai` CLI commands、options、build/test workflows、database operations、worktree management 和 diagnostics 的权威参考。不要猜 flags 或 options；先读文档。

## Quick Command Reference

常用命令如下。完整 options 见 `doc/DEVELOPING.md`。

| Task | Command |
|------|---------|
| Start server (first time or normal) | `npx paperclipai run` |
| Dev mode with hot reload | `pnpm dev` |
| Stop dev server | `pnpm dev:stop` |
| Build | `pnpm build` |
| Type-check | `pnpm typecheck` |
| Run tests | `pnpm test` |
| Run migrations | `pnpm db:migrate` |
| Regenerate Drizzle client | `pnpm db:generate` |
| Back up database | `npx paperclipai db:backup` |
| Health check | `npx paperclipai doctor --repair` |
| Print env vars | `npx paperclipai env` |
| Trigger agent heartbeat | `npx paperclipai heartbeat run --agent-id <id>` |
| Install agent skills locally | `npx paperclipai agent local-cli <agent> --company-id <id>` |

## 从 Master 拉取

```bash
git fetch origin && git pull origin master
pnpm install && pnpm build
```

如果 schema changes 已合入，还要运行 `pnpm db:generate && pnpm db:migrate`。

## Worktrees

Paperclip worktrees 将 git worktree 与隔离 Paperclip instance 组合在一起；每个 worktree 都有自己的 database、server port，以及从 primary instance seed 的 environment。

> **MANDATORY：** 创建或管理 worktrees 前，必须阅读 `doc/DEVELOPING.md` 中的 “Worktree-local Instances” 和 “Worktree CLI Reference” sections。它们是所有 worktree commands、options、seed modes 和 environment variables 的权威参考。

### 何时使用 Worktrees

- 开始需要独立 Paperclip environment 的 feature branch。
- 并行 agent work，避免污染 primary instance。
- 在 merge 前隔离测试 Paperclip changes。

### Command Overview

CLI 有两层命令（完整 option tables 见 `doc/DEVELOPING.md`）：

| Command | Purpose |
|---------|---------|
| `worktree:make <name>` | 一步创建 worktree + isolated instance |
| `worktree:list` | 列出 worktrees 及其 Paperclip 状态 |
| `worktree:merge-history` | preview/import worktrees 之间的 issue history |
| `worktree:cleanup <name>` | 移除 worktree、branch 和 instance data |
| `worktree init` | 在既有 worktree 内 bootstrap instance |
| `worktree env` | 输出 worktree instance 的 shell exports |
| `worktree reseed` | 从另一个 instance 刷新 worktree DB |
| `worktree repair` | 修复 broken/missing worktree instance metadata |

### Typical Workflow

```bash
# 1. Create a worktree for a feature
npx paperclipai worktree:make my-feature --start-point origin/main

# 2. Move into the worktree (path printed by worktree:make) and source the environment
cd <worktree-path>
eval "$(npx paperclipai worktree env)"

# 3. Start the isolated Paperclip server
npx paperclipai run

# 4. Do your work

# 5. When done, merge history back if needed
npx paperclipai worktree:merge-history --from paperclip-my-feature --to current --apply

# 6. Clean up
npx paperclipai worktree:cleanup my-feature
```

## Forks：优先 push 到用户 fork

如果用户有一个 personal fork remote 指向 `paperclipai/paperclip` 的 fork，将 feature branches push 到**该 fork**，不要推到 main repo。这能保持 upstream branch list 干净，也符合标准 open-source contribution flow。

### 检测 fork remote

push 或创建 PR 前，列出 remotes，检查是否有指向非 `paperclipai` GitHub fork 的 remote：

```bash
git remote -v
```

任何 URL 指向 `github.com:<user>/paperclip`（或 `github.com/<user>/paperclip.git`）的 remote 都视为用户 fork。常见名称为 `fork`、`<username>` 或 `myfork`。名为 `origin` 或 `upstream` 且指向 `paperclipai/paperclip` 的 remote 是 canonical upstream；若存在 fork，不要把 feature branch push 到它。

### Push 到 fork

```bash
# Push the current branch to the user's fork and set upstream
git push -u <fork-remote> HEAD
```

然后从 fork branch 创建 PR：

```bash
gh pr create --repo paperclipai/paperclip --head <fork-owner>:<branch-name> ...
```

当当前 branch tracking fork 时，`gh pr create` 通常能自动识别 head ref；若失败，显式 `--head <owner>:<branch>` 最可靠。

### 没有 fork 时

如果 `git remote -v` 只显示 `paperclipai/paperclip` remotes（没有用户 fork），才退回 push branches 到 `origin`。不要替用户创建 fork；先询问。

### 保持 fork 更新

指向 `paperclipai/paperclip` 的 canonical remote 可能叫 `origin` 或 `upstream`。按 “Detect a fork remote” 的方式检测，然后从该 remote fetch，并推送到 fork，兼容两种命名：

```bash
UPSTREAM_REMOTE=$(git remote -v | awk '/paperclipai\/paperclip.*\(fetch\)/{print $1; exit}')
git fetch "$UPSTREAM_REMOTE"
git push <fork-remote> "${UPSTREAM_REMOTE}/master:master"
```

## Pull Requests

> **MANDATORY PRE-FLIGHT：** 创建任何 pull request 前，必须阅读下面 canonical source files。在读完并确认 PR body 符合所有必填 sections 前，不要运行 `gh pr create`。

### Step 1：阅读 canonical files

创建 PR 前必须阅读三份文件：

1. **`.github/PULL_REQUEST_TEMPLATE.md`**：必需 PR body structure。
2. **`CONTRIBUTING.md`**：贡献约定、PR requirements、thinking-path examples。
3. **`.github/workflows/pr.yml`**：merge gate 的 CI checks。

### Step 2：按 checklist 校验 PR body

读完模板后，确认 `--body` 包含以下每个 section（名称必须完全匹配）：

- [ ] `## Thinking Path`：blockquote style，5-8 个 reasoning steps。
- [ ] `## What Changed`：具体变更 bullet list。
- [ ] `## Verification`：reviewer 如何确认可用。
- [ ] `## Risks`：可能出错的点。
- [ ] `## Model Used`：provider、model ID、version、capabilities。
- [ ] `## Checklist`：从模板复制并勾选。

任何 section 缺失或为空时，不要提交 PR。回去补齐。

### Step 3：创建 PR

完成 Step 1 和 Step 2 后，运行 `gh pr create`。用模板内容作为 `--body` 结构；不要写自由格式 summary。

## Hard Rules：不要绕过

这些规则来自 agents 乱绕 CLI failure 造成的真实损害。严格遵守。

1. **CLI 是 worktrees 和 databases 的唯一接口。** 所有 worktree 和 database 操作必须通过 `npx paperclipai` / `pnpm paperclipai` commands。禁止：
   - 运行 `pg_dump`、`pg_restore`、`psql`、`createdb`、`dropdb` 或任何 raw postgres commands。
   - 手动设置 `DATABASE_URL`，让一个 worktree server 指向另一个 instance 的 database。
   - 对任何 `.paperclip/`、`.paperclip-worktrees/` 或 `db/` directory 运行 `rm -rf`。
   - 直接操作 embedded postgres data directories。
   - 通过 PID kill postgres processes。

2. **CLI command 失败就停止并报告。** 不要尝试 workaround。若 `worktree:make`、`worktree reseed`、`worktree init`、`worktree:cleanup` 或任何 `paperclipai` command 失败：
   - 在 task comment 中报告 exact error message。
   - 将 task 设为 `blocked`。
   - 建议运行 `npx paperclipai doctor --repair` 或从零重建 worktree。
   - 不要手动复刻 CLI 行为。

3. **永不在 instances 间共享 databases。** 每个 worktree instance 都有隔离 database。不要 override `DATABASE_URL` 指向另一个 instance database。这会破坏隔离并可能损坏 production data。

4. **worktree 中启动 dev server 前必须先 setup。** 正确顺序：

   ```bash
   # If the worktree already exists but has no running instance:
   cd <worktree-path>
   eval "$(npx paperclipai worktree env)"
   pnpm install && pnpm build
   npx paperclipai run          # or pnpm dev

   # If the worktree needs a fresh database:
   npx paperclipai worktree reseed --seed-mode full

   # If the worktree is broken beyond repair:
   npx paperclipai worktree:cleanup <name>
   npx paperclipai worktree:make <name> --seed-mode full
   ```

   任一步失败都按 rule 2 处理：停止并报告。

5. **Seeding 是 CLI operation。** 被要求从 main instance seed worktree database 时，使用 `worktree reseed`，或用 `worktree:make --seed-mode full` 重建。阅读 `doc/DEVELOPING.md` 获取完整 option tables。不要尝试手动复制 database。

## Persistent Dev Servers（用于手工测试）

当 agent 需要启动一个在当前 heartbeat 结束后仍然存在的 dev server 时，例如让 human 或 QA agent 手工测试，server process **必须**在 detached session 中启动。直接从 heartbeat shell 启动的 process 会在 heartbeat 退出时被杀掉。

### 使用 `tmux` 启动 persistent servers

```bash
# 1. cd into the worktree (or main repo) and source the environment
cd <worktree-path>
eval "$(npx paperclipai worktree env)"   # skip if using the primary instance

# 2. Start the dev server in a named, detached tmux session
tmux new-session -d -s <session-name> 'pnpm dev'

# Example with a descriptive name:
tmux new-session -d -s auth-fix-3102 'pnpm dev'
```

### 管理 session

| Task | Command |
|------|---------|
| Check if the session is alive | `tmux has-session -t <session-name> 2>/dev/null && echo running` |
| View server output | `tmux capture-pane -t <session-name> -p` |
| Kill the session | `tmux kill-session -t <session-name>` |
| List all tmux sessions | `tmux list-sessions` |

### 验证 server 可访问

启动后，先确认 port 正在 listen，再报告成功：

```bash
# Wait briefly for startup, then verify
sleep 3
curl -sf http://127.0.0.1:<port>/api/health && echo "Server is up"
lsof -nP -iTCP:<port> -sTCP:LISTEN
```

### 关键规则

1. 当 dev server 需要在 heartbeat 结束后继续运行时，**始终使用 `tmux`（或等价工具）**。直接从 agent shell 启动的 server 会死亡，即使刚才看起来是 healthy。
2. session 名称要有描述性，包含 worktree name 和 port，例如 `auth-fix-3102`。
3. 报告 URL 前，先验证 server 正在 listen。
4. 不要只用 `nohup` 或 `&`；agent shell 的整个 process group 可能被杀，它们不可靠。
5. 完成测试后清理，kill 掉 tmux session。

## 常见错误

| Mistake | Fix |
|---------|-----|
| Server won't start | Run `npx paperclipai doctor --repair` to diagnose and auto-fix |
| Forgetting to source worktree env | Run `eval "$(npx paperclipai worktree env)"` after cd-ing into the worktree |
| Stale dependencies after pull | Run `pnpm install && pnpm build` after pulling |
| Schema out of date after pull | Run `pnpm db:generate && pnpm db:migrate` |
| Reseeding while target DB is running | Stop the target server first, or use `--allow-live-target` |
| Cleaning up with unmerged commits | Merge or push first, or use `--force` if intentionally discarding |
| Running agents against wrong instance | Verify `PAPERCLIP_API_URL` points to the correct port |
| CLI command fails | Do NOT work around it — report the error and block (see Hard Rules above) |
| Agent tries manual postgres operations | NEVER do this — all DB ops go through the CLI (see Hard Rules above) |
| Dev server dies between heartbeats | Launch in a detached `tmux` session — see "Persistent Dev Servers" above |
| Pushed feature branch to `paperclipai/paperclip` when a fork exists | Push to the user's fork remote instead — see "Forks" above |
