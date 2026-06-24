---
name: paperclip-distill
description: 当 operation issue 是 Paperclip cursor-window、distill 或 backfill 时使用：`operationType: "distill"` 或 `"backfill"`，且 body 引用了某个 project 或 root issue 的 Paperclip source bundle。将原始 Paperclip activity 转换成有 wiki 洞察力的 project page、decision log 和 history note。此 skill 专门用于替代 deterministic distiller 生成的僵硬、日期戳过重的模板化输出。
---

# Paperclip Distill

将 Paperclip project、issue、comment 和 document activity 提炼为持久 wiki 页面。成功标准是 **有 wiki 洞察力，而不是流程化**：从未见过 Paperclip 的读者应能理解项目是什么、做过哪些决定、哪里有风险、当前状态如何，而不需要扫一串 `## [YYYY-MM-DD]` heading。

## 何时需要此 skill

- Cursor-window distillation：routine 给你一个有边界的 source bundle，包含某个 project 或 root issue 的近期 Paperclip activity。
- Backfill：用户要求用某个 project 或 root issue 的历史 activity 初始化 wiki。source window 可能很宽。
- UI 中的手动 `distill-paperclip-now` 请求。

如果 operation issue 是 `operationType: "ingest"`（raw file）或 `operationType: "query"`，这不是正确 skill；使用 `wiki-ingest` 或 `wiki-query`。

## 目标 space

Phase 1 中，每个 Paperclip distill、backfill 和 cursor-window operation 都写入 default wiki space。operation issue 应始终携带 `spaceSlug: "default"`。如果 operation issue 传入其他 slug，停止并在评论中说明不匹配；不要把 Paperclip 派生页面写入非 default space。

此规则只约束 destination。Paperclip source scope（读取哪些 project、root issue、comment、document）由 operation issue 其他字段设置，与 destination 独立。

## 输入

- Paperclip source bundle（issue list、comment ref、document ref、source hash、cursor window）。
- 现有或计划中的 `wiki/projects/<slug>/standup.md` 页面路径。
- 现有或计划中的 `wiki/projects/<slug>/index.md` 页面路径。
- operation issue 的目标 `wikiId`、`spaceSlug`、space root，以及目标 space 的 `AGENTS.md` 页面约定。
- 当前 `wiki/projects/<slug>/standup.md`、`wiki/projects/<slug>/index.md`、`decisions.md` 和 `history.md`（如果已存在），这样你写的是 *patch*，不是重写。

## Paperclip Asset Gate

不要将 Paperclip asset/attachment 或 issue work product 当成此 skill 的 source text。

- 允许的 Paperclip body text：issue description、comment body、document body。
- 在单独批准的 extraction policy 存在前，asset/attachment 只作为 metadata。
- 在单独批准的 extraction policy 存在前，work product 只作为 metadata。
- 永远不要 fetch `/api/assets/:id/content`。
- 永远不要从此 skill 中 dereference work-product `url`、preview URL、artifact URL 或其他 linked destination。
- 如果 operator 要求 distill attachment/work-product content，停止，并让他们查看 Phase 5 asset/work-product security gate policy，而不是临场发挥。

## 避免的反模式

此 skill 替代的 deterministic templating 曾产生以下失败模式；不要重现：

1. **把日期戳当 section header。** `## [2026-04-15] paperclip-distill | proposed` 这类行属于 `wiki/log.md`，不属于 project page。project page 是持久知识；log 是审计轨迹。
2. **流程化状态列表。** `Issue mix: 3 todo, 5 in_progress, 2 done` 对读者没有 Paperclip 直接列表以外的信息。说明 *发生了什么以及为什么重要*，再引用构成证据的 issue。
3. **一 issue 一行的 dump。** 页面如果主要是 `- PAP-1234: title (in_progress, updated 2026-...)`，它是 issue list，不是 wiki page。按它们 *关于什么* 来分组（decision、risk、workstream），当多个 issue 讲同一件事时每条 bullet 引用多个 issue。
4. **机械的到处写 "Current as of"。** frontmatter 中一个 `current_as_of` 就够。
5. **没有解释。** “Active issues: PAP-A, PAP-B, PAP-C” 是记账。“The team is concentrating on the schema migration ([PAP-A], [PAP-B]) and has parked the index work pending capacity ([PAP-C]).” 才是 wiki-insightful。
6. **正文中出现不透明 identifier。** UUID、cursor id、source hash、run id 和 raw metadata 需要时放 log 或 frontmatter，不要放进面向 executive 的 project narrative。

## 工作流

1. **完整读取 bundle。** 不要抽样。读取 bundle 中的每个 issue title、每条 comment、每个 document key。记录：哪些 issue 是 decision，哪些是 risk/blocker，哪些最近完成，哪些正在进行。
2. **读取现有 project page**（如有），以便写 patch 而不是重写。特别是 “Decisions” section 会随时间累积；永远不要擦掉已接受 decision。当后续内容覆盖它们时，用 `> ⚠ reversed by ...` callout 标记 supersede。
3. **读取目标 space 的 `AGENTS.md`**，了解页面约定：filename style、YAML frontmatter shape、link style、voice。调用 LLM Wiki 工具时始终传入 operation issue 的 `wikiId` 和 `spaceSlug`。
4. **先写 `wiki/projects/<slug>/standup.md`。** wiki 中出现的每个 Paperclip project 都必须有此文件。它是 executive standup：项目今天处于什么状态、最近有什么变化、什么被阻塞或有风险、下一步是什么。使用稳定 section，顺序如下：
   - Frontmatter（`type: project-standup`、`project: <slug>`、`current_as_of: YYYY-MM-DD`、`sources`）。
   - **Executive Readout** — 一个短段落，用 plain language 说明当前 project posture。
   - **What Changed** — 上个 window 以来完成或推进的有意义工作。按概念分组；issue/comment/document 只作为证据引用。
   - **Decisions** — 改变项目方向的 accepted/rejected/reversed decision。没有时省略。
   - **Blockers / Risks** — 当前 blocker 和 risk；source 提供时写明 owner 或 next action。
   - **Next Actions** — 从 Paperclip issue 推断出的具体 next action 和 owner，不写空泛愿望。
   - **Links** — 持久 wiki project page 和相关 Paperclip project/issue/document。
   将 standup 重写为今天的状态。不要追加无限 dated section；审计轨迹属于 `wiki/log.md` 和 Paperclip comment。
5. **写 `wiki/projects/<slug>/index.md`**，使用以下稳定 section，顺序如下：
   - Frontmatter（`type: project`、`current_as_of: YYYY-MM-DD`、`tags`、`sources`）。
   - **Overview** — 2-4 句说明项目是什么、为什么存在。如有 project description 则使用；否则从 root issue 综合。
   - **Current Direction** — 叙述性段落，点名 active workstream、最近的具体下一交付物，以及风险 stance。引用 2-4 个 issue，不要列 20 个。
   - **Workstreams** — 简短分组列表。每行是 workstream 或 idea，不是 issue。
   - **Decisions** — accepted 和 reversed decision，每个一段。每个 decision 引用 ratify 它的 issue / approval / comment。格式：`### Decision — short title` 后接段落；不要裸 bullet list。
   - **Open Risks / Blockers** — 可能 derail 项目的事项，以及暴露它的 issue ref。bundle 没有风险信号时跳过此 section，不要填 `_(none)_`。
   - **References** — 指向当前 standup 和支持性 Paperclip task/document 的可读链接。hash 和 cursor id 不要进 narrative。
6. **必要时写 `wiki/projects/<slug>/decisions.md`**：当 project 累积的 decision 多到会让 project page 变成文本墙时使用。每个 decision 是一个 `## ` section，包含短标题、accepted/reversed/superseded 状态、一段 rationale，并引用 source。*不要* 复制 project page 上已有的 decision；改为链接。
7. **必要时写 `wiki/projects/<slug>/history.md`**：用于有意义项目变化的紧凑叙事时间线。**不是** issue dump；按 phase 分组（“Discovery”、“Architecture”、“Build”、“Stabilisation”），不要按日期分组。每个 phase 是一段话，引用定义该阶段的 2-4 个 issue。
8. **刷新 `wiki/index.md`** 的 `## Projects` section：每个持久 project page 一行，附一句说明 project purpose；存在当前 `wiki/projects/<slug>/standup.md` 时附链接。
9. **追加 `wiki/log.md` entry**，日期戳属于这里：
   ```
   ## [YYYY-MM-DD] paperclip-distill | <project name>
   - standup: wiki/projects/<slug>/standup.md
   - page: wiki/projects/<slug>/index.md
   - source hash: `<hash>`
   - cursor window: <start> → <end>
   - notes: <one line on what changed in this distill, e.g. "decisions section grew with PAP-X reversal", "low-signal window, no page changes">
   ```
10. **暴露 bundle warning**（clipped source、low signal、stale hash）。bundle warning -> patch 上设置 `human_review_required: true`。不要粉饰。

## 语气

- 已完成工作用过去时，当前状态用现在时，未来时只在有引用时使用（“the team plans to … per [[…]]”）。
- 内联引用 Paperclip source ref 时使用 issue identifier（例如 `PAP-3179`），不要使用不透明 UUID。
- 使用 issue link 作为证据，而不是让它决定页面结构。heading 和段落应按 concept、workstream、decision、blocker 组织。
- Wiki voice：简短、事实、中立。不要写 “the team is excited to” 或 “this initiative aims to”。
- Heading 描述 *内容*，不是 metadata。写 `## Schema migration`，不要写 `## Active Issues`。

## 当 bundle 没有信号时

如果 bundle 没有持久信号：没有 decision、没有 risk、没有 completed work，只有 routine status churn，则 **不要** 写 project page。改为：

- 追加 `paperclip-distill | low-signal skip` log entry，并写明 cursor window。
- 用一行 “no durable change in this window” 评论关闭 operation issue。
- 不要在没有 proposed page 的 binding 上 bump source hash。

## 验证

关闭 operation issue 前：

- [ ] Project page 读起来像 wiki content，而不是 Paperclip status report。新读者应能理解项目是什么。
- [ ] 所代表 project 存在 `wiki/projects/<slug>/standup.md`，且读起来是 executive current-state update，而不是 raw issue dump。
- [ ] Decisions section 命名 decision，而不是 issue；每个 decision 都有一段 rationale 和引用。
- [ ] 页面正好包含一个 `current_as_of`（在 frontmatter 中），没有任何 `## [YYYY-MM-DD]` heading（这些属于 log）。
- [ ] Bundle warning（clipped、low signal、stale hash）已暴露；当 deployment 是 authenticated/public 时，patch 携带 `human_review_required: true`。
- [ ] `wiki/index.md` 和 `wiki/log.md` 已更新。
- [ ] 没有修改 `raw/` 下任何文件。

## 工具

`wiki_search`、`wiki_read_page`、`wiki_write_page`、`wiki_list_sources`、`wiki_read_source`。始终包含 operation issue 的 `wikiId` 和 `spaceSlug`。Paperclip source bundle 会作为 operation context 到达；不需要你组装。
