---
name: wiki-lint
description: 当 operation issue 是 lint 或 health-check（`operationType: "lint"`）时使用，通常来自 nightly lint routine 或 UI 中手动 “Run lint”。审计 wiki 中的矛盾、孤儿页面、弱 provenance、broken link 和缺失 concept page，并返回 triage list；不要自动修复。
---

# Wiki Lint

审计，不编辑。返回 maintainer（人类或 agent）可分流的 findings。

## 输入

- 带 `operationType: "lint"` 的 operation issue。
- operation issue 的目标 `wikiId`、`spaceSlug` 和 space root。除非 issue 明确说明这是 multi-space sweep，否则只 lint 该 space。

## 工作流

1. **遍历目标 space 的 `wiki/index.md` 和 wiki tree**，使用 `wiki_search` 与 `wiki_read_page`，始终传入 operation issue 的 `wikiId` 和 `spaceSlug`。建立心智地图：哪些页面存在、哪些页面从 `index.md` 引用、哪些页面从其他 wiki 页面引用，以及有哪些 raw source。
2. **按顺序检查七类常见问题**：
   1. **Contradictions** — 两个页面对同一个 entity、decision 或 status 作出不兼容主张。标记两个页面，说明冲突主张，并引用证据。
   2. **Stale claims** — 页面断言 X，但 `raw/` 下较新的 source 已 supersede 它。标记旧页面；永远不要覆盖。
   3. **Orphan pages** — 某个 `wiki/` 页面既未从 `index.md` 链接，也未从任何其他 wiki 页面引用。它应被链接、删除或合并。
   4. **Concept gaps** — 某术语出现在三个或更多页面，但没有专属 `wiki/concepts/<slug>.md`。建议创建。
   5. **Broken `[[wiki-links]]`** — link target 文件不存在。
   6. **Weak provenance** — 非平凡主张没有引用，或只循环引用 wiki 自身。应能找到原始 source ref。
   7. **Index / log drift** — 页面存在但不在 `index.md`，或 `index.md` 列出已不存在页面。近期 `wiki/log.md` operation 没有对应页面变更。
3. **返回 triage list**，按 severity 分组：
   - **critical**：矛盾、指向 active page 的 broken link、伪造引用。
   - **medium**：陈旧主张、弱 provenance、大 concept gap。
   - **low**：孤儿页面、log drift、小 index gap。
   每项包含：file path、evidence（1-2 行 quote）、suggested fix，以及后续应执行的 operation（`ingest`、`paperclip-distill`、`index-refresh`、manual review）。
4. **不要写入 `wiki/`。** Lint 设计上是只读；由 maintainer 或后续 routine 决定处理哪些 finding。
5. **追加描述此次 run 的 log entry**：
   ```
   ## [YYYY-MM-DD] lint | <N findings, M critical>
   - operation issue: <issue identifier>
   - critical: <count>
   - medium: <count>
   - low: <count>
   ```

## 语气

- 先给出按 severity 统计的数量。
- 每个 finding 一条 bullet。避免额外评论。
- severity 不确定时，说明不确定，并以带 “verify” note 的 medium 暴露。

## 验证

关闭 operation issue 前：

- [ ] Findings 按 severity 分组，每项都有 file path、evidence 和 suggested fix。
- [ ] 没有修改 `raw/` 下文件。除 `wiki/log.md` 外，没有修改 `wiki/` 下文件。
- [ ] 如果未发现问题，issue 以 “no findings” 关闭，且 log entry 仍存在，方便未来审计看到此次 run 已发生。

## 工具

`wiki_search`、`wiki_read_page`、`wiki_list_sources`、`wiki_read_source`、`wiki_write_page`（仅用于 `wiki/log.md`）。始终包含 operation issue 的 `wikiId` 和 `spaceSlug`。
