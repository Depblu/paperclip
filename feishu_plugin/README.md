# paperclip-feishu-bridge

Paperclip 外挂飞书审批 Sidecar。零源码修改，通过现有 REST API 和 Board API Key 实现。

## 架构

```
Paperclip Core ←→ paperclip-feishu-bridge ←→ 飞书
         (REST API + Board Key)        (长连接 + 卡片)
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `PAPERCLIP_BASE_URL` | 是 | - | Paperclip API 地址 |
| `PAPERCLIP_API_KEY` | 是 | - | Board API Key (`pcp_board_...`) |
| `PAPERCLIP_PUBLIC_URL` | 否 | 同 BASE_URL | Paperclip 页面地址（卡片链接） |
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

## 运行

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
