# LLM Wiki Maintainer Skills

此目录是 LLM Wiki managed company skills 的插件级 source。Paperclip 会把这些 skill 安装进 company skill library，并同步到 Wiki Maintainer agent。Wiki Maintainer 的身份和运行循环位于 `agents/wiki-maintainer/AGENTS.md`；wiki-root `AGENTS.md` 仍然是页面布局、citation style 和 log format 的 wiki schema。

每个 skill 都是独立的 SKILL.md，描述一个 job：何时调用、开始前必须满足的输入、步骤，以及 operation 必须留下的持久输出。

## Skill registry

| Skill | 何时调用 |
|---|---|
| [`wiki-maintainer`](./wiki-maintainer/SKILL.md) | LLM Wiki 通用维护，以及 operation skill 共享的 tool-use 指引。 |
| [`wiki-ingest`](./wiki-ingest/SKILL.md) | `raw/` 中出现新文件且 operation issue 写明 “ingest” 时，将 source 转成持久 wiki page。 |
| [`wiki-query`](./wiki-query/SKILL.md) | 用户向 wiki 提问时，带引用回答，并提出把持久 synthesis 写回 `wiki/`。 |
| [`wiki-lint`](./wiki-lint/SKILL.md) | lint 或 health-check operation：审计矛盾、孤儿页面、弱 provenance、broken link、缺失 concept page。 |
| [`paperclip-distill`](./paperclip-distill/SKILL.md) | 针对 Paperclip activity 的 cursor-window、distill 或 backfill operation：写出有 wiki 洞察力的 project page、decision log 和 history note。 |
| [`index-refresh`](./index-refresh/SKILL.md) | 刷新 `wiki/index.md`，让每条 entry 有紧凑、可扫描的摘要，并标记 index 与近期 log 活动之间的 drift。 |

## Layering

```
AGENTS.md (wiki root)                              ← wiki 本身的 schema：page convention、frontmatter、voice
  agents/wiki-maintainer/AGENTS.md                 ← agent identity 和 operating loop
  skills/<skill>/SKILL.md                          ← 安装到 maintainer 上的 plugin-managed company skills
```

当 skill 与 wiki-root `AGENTS.md` 冲突时，页面格式/voice 以 wiki schema 为准，operation flow 以 skill 为准。当 skill 与 agent 的 `AGENTS.md` 冲突时，identity 以 agent 文件为准，operation procedure 以 skill 为准。

## Skill conventions

- Front matter 包含 `name`（kebab-case）和 `description`（一到两句触发条件）。
- 每个 skill 都命名其预期输入（例如 `originKind` 以 `:ingest` 结尾的 operation issue、捕获到的 `raw/` path、Paperclip source bundle）。
- 每个 skill 都以 verification checklist 结尾，说明 operation issue 关闭为 `done` 前必须满足什么。
- Skill 会列出依赖的 wiki-plugin 工具（`wiki_search`、`wiki_read_page`、`wiki_write_page`、`wiki_read_source`、`wiki_list_sources`）。
- Skill 不重复 wiki root `AGENTS.md` 中的页面约定，而是引用它。
