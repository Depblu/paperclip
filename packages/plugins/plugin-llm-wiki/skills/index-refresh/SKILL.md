---
name: index-refresh
description: 当 operation issue 是 index refresh 时使用，通常来自 hourly index-refresh routine。重建 `wiki/index.md`，让每条 entry 都有紧凑、可扫描的一行摘要，并让 catalog 反映 `wiki/` 的实际内容。解决 index 与近期 log 活动之间的漂移，但不要编辑页面正文。
---

# Index Refresh

保持 `wiki/index.md` 准确且可扫描。index 是 maintainer 导航的第一入口；它的质量决定后续每个 operation 的成本。

## 输入

- 带 `operationType: "index"` 的 operation issue（或 `index-refresh` routine title）。
- operation issue 的目标 `wikiId`、`spaceSlug` 和 space root。除非 issue 明确说明这是 multi-space sweep，否则只刷新该 space。

## 工作流

1. **读取目标 space 当前的 `wiki/index.md`。**
2. **遍历目标 space 的 `wiki/`。** `wiki/projects/<slug>/standup.md` entry 是持久 `wiki/projects/<slug>/index.md` 页面旁的当前状态 companion；只把它们作为匹配 project entry 的附加链接来索引。按分类遍历 `wiki/`（`sources/`、`projects/`、`entities/`、`concepts/`、`synthesis/`，以及 wiki schema 新增的任何自定义子目录）。
3. **读取目标 space 的 `wiki/log.md` 最近约 50 条**，找出已创建或大量修改但未进入 index 的页面。
4. **按分类产出排序后的 entry**，格式如下：
   ```
   - [[<path>]] — <one-line summary>
   ```
   摘要是从页面首段或标题提取的一句事实。**index 中不要状态，不要日期戳**；这些属于页面本身或 log。
5. **删除页面已不存在的 entry。** 在 log 中记录删除：
   ```
   ## [YYYY-MM-DD] index-refresh | reconciled
   - removed: [[wiki/old-page]] (page deleted)
   - added: [[wiki/new-page]] — <summary>
   ```
6. **为磁盘存在但 index 缺失的页面添加 entry。** 跳过 `wiki/log.md` 和 `wiki/index.md` 自身。对于没有匹配持久 project page 的独立 `wiki/projects/<slug>/standup.md`，加到 Projects 下，并标记为后续需要 durable-page distillation。
7. **以编辑视角书写 project entry。** Projects section 应按 project 的概念和目的组织，而不是按 issue id、日期、状态、UUID 或 source metadata。task identifier 只作为支持证据链接。
8. **保留自定义分类。** 如果 wiki 增加了如 `wiki/papers/` 或 `wiki/runbooks/`，保留对应 index section。不要折叠到默认五类。
9. **追加带计数的 log entry**：
   ```
   ## [YYYY-MM-DD] index-refresh | added=N removed=M
   - operation issue: <issue identifier>
   ```
   如果 index 已准确，log entry 写 `added=0 removed=0`；仍然写入，方便未来审计看到此 run 已发生。

## 此 skill 不做什么

- 不修改页面正文。
- 不解决矛盾、不修 broken link、不补 concept gap。这些交给下一次 `wiki-lint`。
- 不写页面本身不支持的摘要。如果页面缺少可总结的清晰首段，标记给 `wiki-lint`。

## 语气

- Index entry 每个页面一条事实行，使用现在时。
- `wiki/index.md` 中不要 emoji、状态或日期。日期属于 log。

## 验证

关闭 operation issue 前：

- [ ] `wiki/index.md` 与 `wiki/` 实际内容一致：没有缺失页面，也没有悬空 entry。
- [ ] 当 standup 存在时，project entry 包含当前 `wiki/projects/<slug>/standup.md` 链接。
- [ ] 每行 index 都符合 `- [[path]] — <summary>` 格式。
- [ ] 自定义 category section 已保留。
- [ ] `wiki/log.md` 有包含计数的 index-refresh entry（即使计数为零）。
- [ ] 没有修改页面正文。没有修改 `raw/` 下任何文件。

## 工具

`wiki_search`、`wiki_read_page`、`wiki_write_page`（仅用于 `wiki/index.md` 和 `wiki/log.md`）。始终包含 operation issue 的 `wikiId` 和 `spaceSlug`。
