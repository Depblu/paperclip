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



---



只清数据库记录，保留配置/文件/密钥：

pnpm dev:stop
pnpm db:reset:local --dry-run
pnpm db:reset:local --yes
pnpm dev

这会删除：

~/.paperclip/instances/default/db

你的 WAL 损坏启动异常，通常用这个就够。

如果要彻底重新开始，连本地上传文件、workspaces、secrets、logs 也清掉：

pnpm dev:stop
pnpm db:reset:local --all-local-data --dry-run
pnpm db:reset:local --all-local-data --yes
pnpm dev

注意：--all-local-data 会删 secrets、storage、backups、agent/project workspaces。除非你确实想完全重来，否则用第一组命令。

如果你设置过自定义实例：

PAPERCLIP_INSTANCE_ID=xxx pnpm db:reset:local --yes

如果设置了 DATABASE_URL，这个脚本会拒绝执行；那说明你用的是外部 Postgres，需要按外部数据库自己的方式清库。



