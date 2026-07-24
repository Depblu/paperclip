# paperclip-feishu-bridge

Paperclip 外挂飞书审批 Sidecar。零源码修改，通过现有 REST API 和 Board API Key 实现。

## 架构

```
Paperclip Core ←→ paperclip-feishu-bridge ←→ 飞书
         (REST API + Board Key)        (长连接 + 卡片)
```

## 审批卡片

真实审批卡片包含同意/拒绝按钮（可飞书决策的类型）和“查看详情”按钮。“查看详情”通过飞书卡片回调返回 `card.type = raw` 的详情卡，在**当前卡片内**展开类型、ID、状态、创建/更新时间、payload、关联 Issue 和评论（内容按长度截断），不跳转外部页面，手机端无需访问 Paperclip。查看详情的回调复用审批 token 的 recipient/company/approver 授权，不消费或失效 token、不触发 approve/reject、不更新其他卡片。不可飞书决策的类型仅保留只读详情。

## 确认请求（request_confirmation Interaction）

Bridge 支持 Paperclip Issue Thread Interaction 中的 `request_confirmation` 类型。发现方式为分页扫描 Company Issues 再逐 Issue 请求 interactions，过滤 `kind=request_confirmation && status=pending`。卡片展示 Issue、prompt、details/target 和状态，使用 payload 中的自定义 accept/reject label。飞书接受/拒绝分别调用 Core 既有 accept/reject endpoint，拒绝写入可审计 reason。路由配置键为 `request_confirmation`，未配置时沿用 `defaultApprovers`。扫描成本与 Issue 数量成正比，对账为最终一致（默认 60s 周期）。

## 临时文档 Tunnel

`request_confirmation` 交互若指向 Issue 文档（`target.type = issue_document`），Bridge 可在飞书确认卡片中附带一个只读文档预览链接，通过 cloudflared 的随机 trycloudflare URL 对外暴露。

- **前置条件**：本机需安装 `cloudflared` 可执行文件，否则启动 Tunnel 会失败。
- **随机 URL，每次变化**：每次启动都申请一个新的随机 `https://<random>.trycloudflare.com` 地址，停止后失效，不存在固定公网入口。
- **仅开发测试，无 SLA**：依赖 Cloudflare 公共 quick tunnel，不保证可用性与带宽，仅用于开发与测试，不要用于生产。
- **最小暴露面**：Tunnel 只发布 Bridge 内部绑定在 `127.0.0.1` 随机端口上的只读 preview server，绝不发布 Paperclip Core（3100）或 Bridge 管理界面。
- **签名链接**：预览 URL 携带 HMAC 签名 token，绑定 `company / issue / key / revision` 与过期时间（`exp`）。持有链接者在到期前可读取该指定 revision，无法越权访问其他公司、Issue 或文档。
- **卡片刷新**：启动/停止 Tunnel 时，Bridge 会刷新仍在 pending 的 `request_confirmation` 卡片，使预览链接反映当前 URL（启动时写入链接，停止时移除链接）。
- **自动启动**：`DOCUMENT_TUNNEL_AUTO_START`（默认 `false`）控制 Bridge 启动时是否自动开启 Tunnel；也可在配置 UI「全局设置 → 临时文档 Tunnel」中手动启动/停止并复制当前 URL。

## 配置方式

支持两种配置模式：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **配置 UI（推荐）** | 通过 Web 管理界面配置，无需手动编辑文件 | 本地开发、多 Company 管理 |
| 环境变量 | 通过 `.env.local` + JSON 文件配置 | Docker / CI / 生产部署 |

## 配置 UI（推荐）

### 启动

```sh
npm ci
npm run dev    # 开发模式
# 或
npm run build && npm start   # 构建后模式
```

启动后管理界面地址：`http://127.0.0.1:9090`（默认仅监听本地回环，端口可通过全局设置修改）。

> **安全提示**：管理界面包含高权限凭据操作，默认仅绑定 `127.0.0.1`。除非配套网络防护措施，不应将 `adminHost` 配置为其他地址暴露到公网。

### 连接并授权 Paperclip（推荐）

Board API Key 是 Feishu Bridge 调用 Paperclip REST API 的机器身份凭据，但无需手工创建和粘贴。配置页面集成了 Paperclip CLI 授权挑战流程：

1. 打开 `http://127.0.0.1:9090`
2. 在 **Paperclip 连接** 页填入 Paperclip 地址（如 `http://127.0.0.1:3100`）
3. 点击 **"连接并授权 Paperclip"**
4. 浏览器自动打开 Paperclip 授权页面，使用已登录的 Board 会话确认授权
5. 授权完成后页面自动显示连接状态（授权用户、可访问 Company 数、Key 有效期）
6. 点击"查询 Company"获取 Paperclip 中的 Company 列表
7. 切换到 **Company 管理** 页，点击"添加"将 Company 加入配置
8. 为每个 Company 配置飞书 App ID / App Secret（或使用全局默认）
9. 配置审批人和路由规则

### 路由连通性测试

路由页每种审批类型旁的“测试”会发送一张独立测试卡片，并等待飞书中的同意或拒绝结果，最长 600 秒。结果和操作人显示在对应路由类型下；等待期间可点击“取消等待”立即结束。发送前 Bridge 会确认对应飞书 App 的 callback 长连接在线；连接失败时不会发送不可操作的卡片。测试卡片还包含“查看详情”按钮，点击后 Bridge 同样通过 callback response 将当前卡片更新为只读测试详情（类型、会话、创建/到期时间、用途），不跳转任何外部页面，手机端无需访问 Paperclip。测试回调只在 Feishu Bridge 内处理，不读取或修改 Paperclip 审批。

### 授权管理

- **重新授权**：点击"重新授权"创建新挑战，不影响当前有效凭据直到新授权完成
- **断开/撤销**：调用 Paperclip 远程撤销当前 Key，成功后清除本地凭据
- **重新验证**：手动触发状态检查，确认 Key 是否仍然有效
- **Key 到期**：状态页显示到期时间；到期后需重新授权

### 状态含义

| 状态 | 说明 |
|------|------|
| 已连接 | Key 有效，可正常使用 |
| 未授权 | 尚未完成授权，请连接 Paperclip |
| Key 已过期 | Key 超过有效期，需重新授权 |
| Key 已失效/被撤销 | Key 被远程撤销，需重新授权 |
| Paperclip 暂时不可达 | 网络问题，本地凭据不会被删除 |

### 保存后重启生效

所有配置保存后需要**重启 Feishu Bridge 进程**才能使审批轮询、长连接等 runtime 组件使用新身份。保存时页面会显示持久提示横幅。授权成功后无需重启即可查询 Company 和完成其余配置。

## 环境变量模式（兼容）

环境变量模式下，授权由外部配置管理（`PAPERCLIP_API_KEY`），配置 UI 中的自动授权功能不可用。适用于 Docker / CI / 生产部署。

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `PAPERCLIP_BASE_URL` | 是 | - | Paperclip API 地址 |
| `PAPERCLIP_API_KEY` | 是 | - | Board API Key (`pcp_board_...`) |
| `PAPERCLIP_PUBLIC_URL` | 否 | 同 BASE_URL | 保留配置项，当前版本无运行时引用；审批/确认卡片详情经飞书卡片回调在卡片内展开，文档预览链接由临时文档 Tunnel 提供，均不依赖此项 |
| `FEISHU_APP_ID` | 是 | - | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | 是 | - | 飞书应用 App Secret |
| `BRIDGE_COMPANIES_CONFIG` | 是 | - | Company 路由配置 JSON 文件路径 |
| `POLL_INTERVAL_MS` | 否 | 5000 | 轮询周期 |
| `RECONCILIATION_INTERVAL_MS` | 否 | 60000 | 对账周期 |
| `SCAN_CONCURRENCY` | 否 | 4 | 扫描并发 |
| `REQUEST_TIMEOUT_MS` | 否 | 10000 | 请求超时 |
| `SQLITE_PATH` | 否 | ./data/bridge.db | SQLite 数据路径 |
| `ACTION_TOKEN_TTL_MS` | 否 | 86400000 | 动作凭证有效期 |
| `LOG_LEVEL` | 否 | info | 日志级别 |
| `DOCUMENT_TUNNEL_AUTO_START` | 否 | false | 启动时是否自动开启临时文档 Tunnel（true/false/1/0） |

## Company 配置示例

```json
{
  "companies": [
    {
      "companyId": "uuid-of-company",
      "defaultApprovers": [
        { "openId": "ou_xxx", "name": "默认审批人" }
      ],
      "routing": {
        "hire_agent": {
          "approvers": [
            { "openId": "ou_yyy", "name": "HR 负责人" }
          ]
        }
      }
    }
  ]
}
```

## 首次本地配置

### 1. 安装依赖

```sh
npm ci
```

### 2. 生成本地配置文件

```sh
cp .env.example .env.local
cp config/companies.example.json config/companies.local.json
```

两个文件已被 `.gitignore` 忽略，不会进入 Git。

### 3. 填入真实值

编辑 `.env.local` 和 `config/companies.local.json`，替换所有 `REPLACE_WITH_...` 占位符：

| 需填入 | 来源 |
|--------|------|
| `FEISHU_APP_ID` | 飞书开放平台 → 应用凭证 |
| `FEISHU_APP_SECRET` | 飞书开放平台 → 应用凭证 |
| `PAPERCLIP_API_KEY` | Paperclip 看板 → API Keys（`pcp_board_...`） |
| `companyId` | Paperclip 看板 → Company 详情 |
| 审批人 `openId` | 飞书管理后台或 API 获取的用户 Open ID |

**`PAPERCLIP_BASE_URL` vs `PAPERCLIP_PUBLIC_URL`：**
- `BASE_URL`：Sidecar 进程调用 Paperclip API 的地址（本机可用 localhost）。
- `PUBLIC_URL`：保留配置项，当前版本源码中无运行时引用。审批与测试卡片的“查看详情”已通过飞书卡片回调在卡片内展开，文档预览链接由临时文档 Tunnel 提供，均不依赖此项。

### 4. 校验配置

```sh
npm run config:check:examples   # 校验示例文件结构（无需真实密钥）
npm run config:check            # 校验 .env.local 实际配置
npm run config:probe            # 校验 + 探测 Paperclip 连通性
```

### 5. 构建

```sh
npm run typecheck
npm run build
```

### 6. 启动

```sh
npm run dev:local    # 开发模式（tsx，启动前自动校验）
npm run start:local  # 构建后模式（需先 npm run build）
```

启动成功时日志输出：

```
paperclip-feishu-bridge started {"companies":1,"pollIntervalMs":5000,...}
```

### 7. 安全提示

- `.env.local` 和 `config/companies.local.json` 含敏感凭据，已被 Git 忽略。
- 不得提交、截图或以任何方式泄露这些文件。
- `config/secrets.json` 以 `0600` 权限写入，仅当前用户可读写。
- 建议为 Feishu Bridge 创建专用 Paperclip 用户，仅授予最少 Company Membership。
- 管理界面默认仅监听 `127.0.0.1`，不要在无网络防护时暴露到公网。

### 8. 常见问题排查

| 现象 | 排查方向 |
|------|----------|
| 401/403 | `PAPERCLIP_API_KEY` 无效或不属于目标 Company |
| 飞书长连接失败 | `FEISHU_APP_ID`/`FEISHU_APP_SECRET` 错误，或应用未开启长连接权限 |
| Open ID 无效 | 审批人 Open ID 不属于当前飞书应用可见范围 |
| `config:check` 报占位符 | `.env.local` 中仍有 `REPLACE_WITH_...` 未替换 |

## 多 Company 隔离

Store 模式下，每个 Company 必须显式绑定飞书应用。未绑定飞书应用的 Company 不会发送或更新审批卡片，也不会回退到全局默认飞书应用。环境变量模式下，全局默认飞书应用会在启动时显式注册到每个已配置的 Company。

## 测试

```sh
npm test
```

## 运行（Docker / 生产）

```sh
npm install
npm run build
npm start
```

开发模式：

```sh
npm run dev
```

## Docker

```sh
docker build -t paperclip-feishu-bridge .
docker run -e PAPERCLIP_BASE_URL=... -e PAPERCLIP_API_KEY=... \
  -e FEISHU_APP_ID=... -e FEISHU_APP_SECRET=... \
  -e BRIDGE_COMPANIES_CONFIG=/etc/bridge/companies.json \
  -v ./companies.json:/etc/bridge/companies.json:ro \
  -v bridge-data:/app/data \
  paperclip-feishu-bridge
```

## 设计文档

详见 `docs/feishu-approval-sidecar-design.md`。
