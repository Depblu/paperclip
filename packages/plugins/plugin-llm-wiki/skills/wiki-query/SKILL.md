---
name: wiki-query
description: 当 operation issue 要求你基于 LLM Wiki 回答问题时使用：`operationType: "query"`，且 issue body 中包含问题。回答时引用 wiki page 和 raw source，并主动提出将持久 synthesis 写回 `wiki/synthesis/`，让工作沉淀而不是消失在聊天线程中。
---

# Wiki Query

基于 wiki 实际包含的内容回答问题，并提供引用。

## 输入

- 带 `operationType: "query"` 的 operation issue，问题在 body 中。
- operation issue 的目标 `wikiId`、`spaceSlug` 和 space root。

## 工作流

1. **先打开目标 space 的 `wiki/index.md`**；它是导航辅助。识别候选页面。
2. **端到端读取候选页面**，使用 `wiki_read_page`，始终传入 operation issue 的 `wikiId` 和 `spaceSlug`。当问题跨 entity 或 concept 时，跟随 `[[wiki-links]]` 到邻近页面。
3. **当 wiki page 的主张显得薄弱时检查 raw source。** wiki 指向 `raw/` 正是为了让你回答前能验证。使用 `wiki_read_source`。
4. **在 operation issue thread 中回答问题。** 结构：
   - 先直接回答，1-4 句。
   - 再列支持事实，每条 bullet 带内联引用：`(see [[wiki/concepts/managed-resources]])` 或 `(see raw/<filename>)`。
   - 如果你需要读取 wiki 未总结的 raw source，把它命名为 gap。
5. **判断答案是否值得持久化。** 如果问题迫使你做了真正 synthesis（比较、权衡、定义某个尚无页面的概念），提出归档到 `wiki/synthesis/<slug>.md`。不要静默写 synthesis page；这是 opt-in。用户接受后，写页面，链接到 `wiki/index.md`，并追加 `query | filed synthesis` log entry。
6. **当 wiki 无法回答时，直接说明。** 建议用户 ingest 某个 source、distill 某个 Paperclip project，或做 web lookup。永远不要 bluff。

## 语气

- 先给答案。
- 边写边引用，不要把引用集中到结尾脚注块。
- 使用 wiki 的简短、事实 voice。query response 本身也应可成为 `wiki/synthesis/` 的候选内容。

## 验证

关闭 operation issue 前：

- [ ] 答案中的每个主张都引用 wiki page 或 raw source。
- [ ] 如果 wiki 不足，已直接说明，并给出具体下一步（ingest source X、distill project Y、web search Z）。
- [ ] 如果写了 synthesis page，`wiki/index.md` 已列出它，且 `wiki/log.md` 有 `query | filed synthesis` entry。
- [ ] 没有修改 `raw/` 下任何文件。

## 工具

`wiki_search`、`wiki_read_page`、`wiki_list_sources`、`wiki_read_source`、`wiki_write_page`（仅在归档 synthesis 时）。始终包含 operation issue 的 `wikiId` 和 `spaceSlug`。
