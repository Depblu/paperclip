---
name: para-memory-files
description: >
  基于文件的 memory system，使用 Tiago Forte 的 PARA 方法。任何需要跨 session
  存储、检索、更新或组织知识时使用。覆盖三层 memory：（1）PARA folders 中的
  knowledge graph 和 atomic YAML facts，（2）作为 raw timeline 的 daily notes，
  （3）关于用户模式的 tacit knowledge。也处理 planning files、memory decay、
  weekly synthesis，以及通过 qmd recall。任何 memory operation 都触发：saving facts、
  writing daily notes、creating entities、running weekly synthesis、recalling past context
  或 managing plans。
---

# PARA Memory Files

基于文件的持久 memory，按 Tiago Forte 的 PARA 方法组织。三层：knowledge graph、daily notes、tacit knowledge。所有路径都相对 `$AGENT_HOME`。

## 三层 Memory

### Layer 1：Knowledge Graph（`$AGENT_HOME/life/`，PARA）

基于 entity 的存储。每个 entity 一个 folder，包含两层：

1. `summary.md`：快速上下文，先加载。
2. `items.yaml`：atomic facts，按需加载。

```text
$AGENT_HOME/life/
  projects/          # 有明确 goals/deadlines 的 active work
    <name>/
      summary.md
      items.yaml
  areas/             # 持续责任，无结束日期
    people/<name>/
    companies/<name>/
  resources/         # reference material、关注主题
    <topic>/
  archives/          # 其他三类中 inactive 的 items
  index.md
```

**PARA rules：**

- **Projects**：有 goal 或 deadline 的 active work。完成后移入 archives。
- **Areas**：持续事项（people、companies、responsibilities）。无结束日期。
- **Resources**：reference material、关注主题。
- **Archives**：任意类别的 inactive items。

**Fact rules：**

- durable facts 立即保存到 `items.yaml`。
- 每周：从 active facts 重写 `summary.md`。
- 永不删除 facts。用 supersede 替代（`status: superseded`，添加 `superseded_by`）。
- entity inactive 后，将其 folder 移到 `$AGENT_HOME/life/archives/`。

**何时创建 entity：**

- 被提及 3 次以上，或
- 与用户有直接关系（family、coworker、partner、client），或
- 用户生活中的重要 project 或 company。
- 否则记录到 daily notes。

atomic fact YAML schema 和 memory decay rules 见 [references/schemas.md](references/schemas.md)。

### Layer 2：Daily Notes（`$AGENT_HOME/memory/YYYY-MM-DD.md`）

事件 raw timeline，也就是 “when” layer。

- 对话期间持续写入。
- heartbeat 期间将 durable facts 提取到 Layer 1。

### Layer 3：Tacit Knowledge（`$AGENT_HOME/MEMORY.md`）

用户如何运作：patterns、preferences、lessons learned。

- 不是关于世界的 facts；是关于用户的 facts。
- 每当学到新的 operating patterns，就更新。

## 写下来，不要只记在脑子里

Memory 不会跨 session restart 存活。文件会。

- 想记住某事 -> 写入文件。
- “Remember this” -> 更新 `$AGENT_HOME/memory/YYYY-MM-DD.md` 或相关 entity file。
- 学到 lesson -> 更新 AGENTS.md、TOOLS.md 或相关 skill file。
- 犯错 -> 写下来，避免未来的你重复。
- 磁盘上的 text files 永远优于临时 context。

## Memory Recall：使用 qmd

使用 `qmd`，不要直接 grep 文件：

```bash
qmd query "what happened at Christmas"   # semantic search with reranking
qmd search "specific phrase"              # BM25 keyword search
qmd vsearch "conceptual question"         # pure vector similarity
```

索引个人 folder：`qmd index $AGENT_HOME`

Vectors + BM25 + reranking 能在措辞不同的情况下找到内容。

## Planning

将 plans 放在 project root 的 `plans/` 下，使用 timestamped files（放在 personal memory 外，其他 agents 才能访问）。用 `qmd` 搜索 plans。Plans 会过期；如果存在更新计划，不要被旧版本干扰。发现 stale 时，更新文件并注明它被什么 supersededBy。
