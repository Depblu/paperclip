# Paperclip + Clawith Bridge Quick Start

本文档用于在本机同时启动 Paperclip 和 Clawith，并让 Paperclip 通过
`clawith_bridge` adapter 唤醒 Clawith 数字员工。

## 1. 端口与角色

| 服务 | 默认地址 | 作用 |
|---|---|---|
| Paperclip | `http://localhost:3100` | AI 公司控制平面，负责 issue、agent、run |
| Clawith | `http://localhost:3008` | Clawith 前端 |
| Clawith API | `http://localhost:8008` | Bridge API 所在后端 |
| LLM API | `http://127.0.0.1:8080/v1` | OpenAI-compatible 模型服务 |

Paperclip adapter 的 `baseUrl` 填 `http://localhost:8008`，不要填
`/api/bridge`。Adapter 会自动调用 `/api/bridge/...`。

## 2. 服务管理脚本

根目录提供一键脚本：

```sh
./paperclip-clawith-services.sh install
./paperclip-clawith-services.sh start
./paperclip-clawith-services.sh status
./paperclip-clawith-services.sh restart
./paperclip-clawith-services.sh stop
```

只操作单个服务：

```sh
./paperclip-clawith-services.sh install clawith
./paperclip-clawith-services.sh start paperclip
```

如果本机没有可用 PostgreSQL 5432，脚本会创建或复用 Docker 容器
`paperclip-clawith-postgres` 和卷 `paperclip-clawith-pgdata`。`stop clawith`
会停止容器，不删除卷。

## 3. 启动模型服务

先确认 OpenAI-compatible 模型服务可用：

```sh
curl http://127.0.0.1:8080/v1/models
```

本 PoC 使用：

```text
model_name: gpt-5.4-mini
base_url: http://127.0.0.1:8080/v1
```

API key 只放在 shell 或 `.env` 中，不写入仓库文件。

## 4. 启动 Clawith

进入 Clawith 源码目录：

```sh
cd todo/Clawith
```

首次安装：

```sh
bash setup.sh --dev
```

在 `todo/Clawith/.env` 中加入 Bridge 配置：

```env
BRIDGE_ENABLED=true
BRIDGE_JWT_ISSUER=paperclip
BRIDGE_JWT_AUDIENCE=clawith-bridge
BRIDGE_SHARED_SECRET=dev-secret
BRIDGE_LLM_PROVIDER=openai
BRIDGE_LLM_MODEL_NAME=gpt-5.4-mini
BRIDGE_LLM_API_KEY=<set in local env>
BRIDGE_LLM_BASE_URL=http://127.0.0.1:8080/v1
BRIDGE_RUNTIME_TIMEOUT_SEC=120
```

启动 Clawith：

```sh
bash restart.sh
```

健康检查：

```sh
curl http://localhost:8008/api/health
curl http://localhost:8008/api/bridge/health
```

预期 Bridge health 返回可访问状态；如果 Bridge 未启用，检查
`BRIDGE_ENABLED=true` 和 `BRIDGE_SHARED_SECRET`。

## 5. 启动 Paperclip

回到 Paperclip 根目录：

```sh
cd /home/lius/sda1/tmp/github/paperclip
```

安装依赖并启动：

```sh
pnpm install
pnpm dev
```

健康检查：

```sh
curl http://localhost:3100/api/health
```

打开 UI：

```text
http://localhost:3100
```

## 6. 创建 Clawith Bridge agent

在 Paperclip UI 中创建 agent，adapter type 选择：

```text
clawith_bridge
```

Adapter config 使用：

```json
{
  "enabled": true,
  "baseUrl": "http://localhost:8008",
  "bridgeSecret": "dev-secret",
  "timeoutSec": 120,
  "mode": "sync",
  "writeBack": "issue_comment"
}
```

关键点：

- `bridgeSecret` 必须等于 Clawith 的 `BRIDGE_SHARED_SECRET`。
- `baseUrl` 是 Clawith 后端根地址，不包含 `/api/bridge`。
- `writeBack=issue_comment` 会把 Clawith 结果写回 Paperclip issue comment。
- `writeBack=run_log` 只保留在 run log 中。

## 7. 跑一次端到端验证

先跑离线 PoC 合约验证：

```sh
bash todo/clawith-bridge-poc/verify.sh
```

再确认真实模型 smoke：

```sh
CLAWITH_REAL_MODEL_API_KEY='<set in shell>' \
python3 todo/clawith-bridge-poc/smoke_real_model.py
```

预期输出：

```json
{"status": "ok", "model": "gpt-5.4-mini", "content": "paperclip-clawith-ok"}
```

最后在 Paperclip 中给 `clawith_bridge` agent 分配一个简单 issue，例如：

```text
请回复一行：paperclip-clawith-ok
```

触发 agent heartbeat 后，Paperclip 应创建 run，Clawith Bridge 应调用 Clawith
runtime，并把结果写回 Paperclip。

## 8. 常见问题

### Paperclip 报 Bridge URL 错误

确认 adapter config：

```json
{"baseUrl": "http://localhost:8008"}
```

不要写成：

```text
http://localhost:8008/api/bridge
```

### Clawith 返回 401

检查三项是否一致：

- Paperclip `bridgeSecret`
- Clawith `BRIDGE_SHARED_SECRET`
- Clawith `BRIDGE_ENABLED=true`

Bridge 请求还要求 `Authorization: Bearer ...`、`X-Request-Id`、
`X-Idempotency-Key`、`X-Paperclip-Run-Id`，这些由 Paperclip adapter 自动生成。

### 模型 smoke 连不上 8080

如果在 Codex 沙箱里执行，可能需要允许本地网络访问。宿主机终端可直接跑：

```sh
CLAWITH_REAL_MODEL_API_KEY='<set in shell>' \
CLAWITH_REAL_MODEL_BASE_URL='http://127.0.0.1:8080/v1' \
CLAWITH_REAL_MODEL_NAME='gpt-5.4-mini' \
python3 todo/clawith-bridge-poc/smoke_real_model.py
```

### Clawith 数字员工没有模型

确认 Clawith `.env` 中同时设置：

```env
BRIDGE_LLM_MODEL_NAME=gpt-5.4-mini
BRIDGE_LLM_API_KEY=<set in local env>
BRIDGE_LLM_BASE_URL=http://127.0.0.1:8080/v1
```

Bridge 首次同步 Paperclip agent 时会在 Clawith 中创建对应 tenant、user、
model、agent 和 session 映射。
