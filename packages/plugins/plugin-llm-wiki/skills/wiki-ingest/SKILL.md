---
name: wiki-ingest
description: 当 operation issue 要求你把 `raw/` 中捕获的 source 摄取进 LLM Wiki，或用户明确说“ingest <slug>”时使用。issue body 会指向 `raw/` 下的文件（例如 `raw/karpathy-llm-wiki.md`）并要求生成持久 wiki 页面。不要将此 skill 用于 Paperclip activity bundle；这些使用 `paperclip-distill`。
---

# Wiki Ingest

将一个 source document 转换成持久、互相链接的 wiki knowledge。

## 输入

- 分配给你的、带 `operationType: "ingest"` 的 operation issue。
- issue body 中提到的 `raw/` 路径（始终将 `raw/` 视为 immutable）。
- operation issue 的目标 `wikiId`、`spaceSlug` 和 space root（否则停止，并把缺失配置反馈给请求者）。

## 工作流

1. **先读取上下文。**
   - 读取目标 space 的 `AGENTS.md`，了解页面约定（文件名、frontmatter、voice、citation style）。
   - 读取目标 space 的 `wiki/index.md`，了解已有内容。
   - 读取目标 space 的 `wiki/log.md` 最近约 20 条，避免重复摄取 source 或重复处理他人已记录的矛盾。
2. **端到端读取 source**，使用 `wiki_read_source` 并传入 operation issue 的 `wikiId` 与 `spaceSlug`。不要略读。记录 source 的结构、主张、日期，以及任何与现有页面冲突的内容。
3. **先计划，再确认，但仅当用户在线参与时。** 如果 operation 来自 routine（没有实时用户），继续执行。如果用户在交互式请求，先总结你准备归档的 3-5 个 takeaway，并询问要强调哪些内容，再写入。
4. **写 source page** 到 `wiki/sources/<slug>.md`：约 300-800 词，frontmatter 遵循 wiki schema，voice 保持中立，关键主张在有分量时附原文摘录。source page 是此 skill 写入的所有其他内容的 canonical citation target。
5. **更新或创建下游页面**，位置包括 `entities/`、`concepts/` 和 `synthesis/`。一次典型 ingest 会触碰 5-15 个页面；不要为只出现一次的想法创建页面。
6. **连好交叉链接。** 每条来自该 source 的主张都以 `(see [[wiki/sources/<slug>]])` 引用它。任何在多个页面按名称出现的 entity / concept 都链接到专属页面。
7. **标记矛盾；不要静默覆盖。** 当新材料与现有页面不一致时，在旧页面追加 `> ⚠ contradicted by [[wiki/sources/<slug>]] (YYYY-MM-DD)` callout，并在 log 中记录冲突。
8. **刷新 `wiki/index.md`**，为任何新页面添加一行摘要。
9. **追加 log entry** 到 `wiki/log.md`：
   ```
   ## [YYYY-MM-DD] ingest | <source title>
   - source: raw/<filename>
   - new pages: [[...]], [[...]]
   - updated pages: [[...]], [[...]]
   - notes: <one-line synthesis or open question>
   ```

## 语气

- 简短、事实、中立。写 reference material，而不是叙事。
- 不使用 “Today I learned” 或 “This is interesting because” 这类框架。
- 当转述会损失精度时，直接引用 source 原文。

## 验证

关闭 operation issue 前：

- [ ] Source page 存在于 `wiki/sources/<slug>.md`，frontmatter 有效，且 `sources:` 字段指向 raw path。
- [ ] 每个新增或更新页面都链接回 source page，或链接到会回链 source page 的下游页面。
- [ ] `wiki/index.md` 在正确分类下列出每个新页面，并附一行摘要。
- [ ] `wiki/log.md` 有 ingest entry，heading 格式包含精确文件名（这样 `grep "^## \[" wiki/log.md` 仍可工作）。
- [ ] 新 source 与旧页面的任何矛盾都被标注，而不是静默覆盖。
- [ ] 没有修改 `raw/` 下的任何文件。

## 工具

`wiki_list_sources`、`wiki_read_source`、`wiki_search`、`wiki_read_page`、`wiki_write_page`。始终包含 operation issue 的 `wikiId` 和 `spaceSlug`。
