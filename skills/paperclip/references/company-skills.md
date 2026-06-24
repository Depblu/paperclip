# Company Skills Workflow

当 board user、CEO 或 manager 要求你查找 skill、安装到 company library，或分配给 agent 时使用本参考。

## What Exists

- App-shipped catalog：`@paperclipai/skills-catalog` 中内置的一组 curated company skills，可在 Paperclip 内浏览和安装。
- Company skill library：对整家公司安装、检查、更新、审计、reset、读取 company skills。
- Agent skill assignment：给现有 agent 添加或移除 company skills。
- Hire/create composition：创建或招聘 agent 时传 `desiredSkills`，让同一 assignment model 立即生效。

Canonical model：

1. 把 skill 添加到 company library：来自 app catalog（`skills install`）、external source（`skills import`），或 managed local skill（`skills create`/`skills scan-projects`）
2. 把 company skill attach 到 agent（`skills agent sync`）
3. 可选：hire/create 时通过 `desiredSkills` 执行第 2 步

Catalog install 不等于 agent attach。安装 catalog skill 只是在 `company_skills` 中增加记录。只有 sync agent 的 desired set 后，agent 才会使用它。

## Permission Model

- Company skill reads：同公司任意 actor
- Company skill mutations：board、CEO，或具备 effective `agents:create` capability 的 agent
- Agent skill assignment：与更新该 agent 相同的权限模型

## Core Endpoints

App-shipped catalog（只读浏览 + company install）：

- `GET /api/skills/catalog`
- `GET /api/skills/catalog/:catalogId`
- `GET /api/skills/catalog/ref?ref=<id|key|slug>`
- `GET /api/skills/catalog/:catalogId/files?path=SKILL.md`
- `POST /api/companies/:companyId/skills/install-catalog`

Company library：

- `GET /api/companies/:companyId/skills`
- `GET /api/companies/:companyId/skills/:skillId`
- `GET /api/companies/:companyId/skills/:skillId/files?path=SKILL.md`
- `POST /api/companies/:companyId/skills`（managed local create）
- `POST /api/companies/:companyId/skills/import`
- `POST /api/companies/:companyId/skills/scan-projects`
- `GET /api/companies/:companyId/skills/:skillId/update-status`
- `POST /api/companies/:companyId/skills/:skillId/install-update`
- `POST /api/companies/:companyId/skills/:skillId/audit`
- `POST /api/companies/:companyId/skills/:skillId/reset`
- `DELETE /api/companies/:companyId/skills/:skillId`

Agent attach 与 hire/create composition：

- `GET /api/agents/:agentId/skills`
- `POST /api/agents/:agentId/skills/sync`
- `POST /api/companies/:companyId/agent-hires`
- `POST /api/companies/:companyId/agents`

如果 board user、CEO 或 manager 在本地操作，优先使用 `doc/CLI.md` 中记录的 `paperclipai skills` CLI。它封装上述 endpoints，接受 company skill 或 catalog refs（`id`/`key`/`slug`），并在 `--json` 下打印与 endpoint 相同的 JSON。

## Install A Skill Into The Company

常见场景有两条路径：

1. **App-shipped catalog**（catalog 中有合适 skill 时优先）——先浏览，再用 catalog install endpoint 安装。不会进行外部网络 fetch。
2. **External source**（skills.sh、GitHub、local path 或 URL）——使用下面的 import endpoint。

### App-shipped catalog

先浏览、检查并安装 catalog skills，再考虑 external source。Bundled skills 是任何公司的 curated defaults；optional skills 是角色或领域专用。

```sh
curl -sS "$PAPERCLIP_API_URL/api/skills/catalog?kind=bundled" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

curl -sS "$PAPERCLIP_API_URL/api/skills/catalog/ref?ref=github-pr-workflow" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills/install-catalog" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "catalogSkillId": "paperclipai:bundled:software-development:github-pr-workflow"
  }'
```

install response 会在 company skill 上记录 provenance（`catalogId`、`catalogKey`、`packageVersion`、`originHash`），供 update/audit/reset flows 使用 pinned origin。`force: true` 可替换 same-key catalog-managed skill，但永远不能绕过 hard-stop audit findings。

### External source import

可用 **skills.sh URL**、key-style source string、GitHub URL 或 local path 导入。

### Source types（按优先级）

| Source format | Example | When to use |
|---|---|---|
| **skills.sh URL** | `https://skills.sh/google-labs-code/stitch-skills/design-md` | 用户给出 `skills.sh` link 时使用。这是 managed skill registry，可用时始终优先。 |
| **Key-style string** | `google-labs-code/stitch-skills/design-md` | 同一 skill 的 shorthand，格式为 `org/repo/skill-name`，等价于 skills.sh URL。 |
| **GitHub URL** | `https://github.com/vercel-labs/agent-browser` | skill 位于 GitHub repo，但不在 skills.sh 上时使用。 |
| **Local path** | `/abs/path/to/skill-dir` | skill 在磁盘上时使用（仅 dev/testing）。 |

**Critical:** 如果用户给出 `https://skills.sh/...` URL，直接用该 URL 或它的 key-style 等价形式（`org/repo/skill-name`）作为 `source`。不要转换成 GitHub URL；skills.sh 是 versioning、discovery、updates 的 managed registry 和 source of truth。

### Example: skills.sh import（优先）

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills/import" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "https://skills.sh/google-labs-code/stitch-skills/design-md"
  }'
```

或使用等价 key-style string：

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills/import" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "google-labs-code/stitch-skills/design-md"
  }'
```

### Example: GitHub import

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills/import" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "https://github.com/vercel-labs/agent-browser"
  }'
```

也可使用 source strings：

- `google-labs-code/stitch-skills/design-md`
- `vercel-labs/agent-browser/agent-browser`
- `npx skills add https://github.com/vercel-labs/agent-browser --skill agent-browser`

如果任务是先从 company project workspaces 发现 skills：

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills/scan-projects" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Inspect What Was Installed

```sh
curl -sS "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

读取 skill entry 和它的 `SKILL.md`：

```sh
curl -sS "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills/<skill-id>" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

curl -sS "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills/<skill-id>/files?path=SKILL.md" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

## Assign Skills To An Existing Agent

`desiredSkills` 接受：

- exact company skill key
- exact company skill id
- 公司内唯一的 exact slug

服务器会持久化 canonical company skill keys。

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/agents/<agent-id>/skills/sync" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "desiredSkills": [
      "vercel-labs/agent-browser/agent-browser"
    ]
  }'
```

需要先看当前状态：

```sh
curl -sS "$PAPERCLIP_API_URL/api/agents/<agent-id>/skills" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

## Include Skills During Hire Or Create

招聘或创建 agent 时，在 `desiredSkills` 中使用同样的 company skill keys 或 refs：

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/agent-hires" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "QA Browser Agent",
    "role": "qa",
    "adapterType": "codex_local",
    "adapterConfig": {
      "cwd": "/abs/path/to/repo"
    },
    "desiredSkills": [
      "agent-browser"
    ]
  }'
```

不经 approval 的 direct create：

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/agents" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "QA Browser Agent",
    "role": "qa",
    "adapterType": "codex_local",
    "adapterConfig": {
      "cwd": "/abs/path/to/repo"
    },
    "desiredSkills": [
      "agent-browser"
    ]
  }'
```

## Notes

- Adapter 需要时，内置 Paperclip runtime skills 仍会自动添加。
- ref 缺失或歧义时，API 返回 `422`。
- 评论 skill changes 时，优先链接相关 issue、approval 和 agent。
- 需要整包 import/export 时使用 company portability routes，而不是只导入 skill：
  - `POST /api/companies/:companyId/imports/preview`
  - `POST /api/companies/:companyId/imports/apply`
  - `POST /api/companies/:companyId/exports/preview`
  - `POST /api/companies/:companyId/exports`
- 任务只是把 skill 加入 company library、并不导入周边 company/team/package 结构时，使用 skill-only import。
