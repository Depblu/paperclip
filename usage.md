# 用法

## 重置本地 Paperclip 数据库

先停止本地服务：

```sh
pnpm dev:stop
```

预览将删除的路径，不会真正删除：

```sh
pnpm db:reset:local --dry-run
```

删除默认 embedded PostgreSQL 数据库：

```sh
pnpm db:reset:local --yes
```

重新启动后，Paperclip 会重新创建 embedded database 并自动跑 migrations：

```sh
pnpm dev
```

默认只删除：

```text
~/.paperclip/instances/default/db
```

如果要连本地 storage、backups、secrets、logs、agent workspaces、project workspaces 和 per-company adapter homes 一起清掉：

```sh
pnpm db:reset:local --all-local-data --yes
```

可用环境变量或参数指定其他实例：

```sh
PAPERCLIP_HOME=/custom/home PAPERCLIP_INSTANCE_ID=dev pnpm db:reset:local --dry-run
pnpm db:reset:local --home /custom/home --instance dev --dry-run
```

保护规则：

- `DATABASE_URL` 存在时拒绝执行，避免误删外部 PostgreSQL。
- embedded DB 中存在 `postmaster.pid` 时拒绝执行；先运行 `pnpm dev:stop`。
- 不传 `--yes` 时需要手动输入 `RESET` 确认。
- `--dry-run` 只打印目标路径，不删除文件。
