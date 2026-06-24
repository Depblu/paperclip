# Schemas 和 Memory Decay

## Atomic Fact Schema（items.yaml）

```yaml
- id: entity-001
  fact: "The actual fact"
  category: relationship | milestone | status | preference
  timestamp: "YYYY-MM-DD"
  source: "YYYY-MM-DD"
  status: active # active | superseded
  superseded_by: null # e.g. entity-002
  related_entities:
    - companies/acme
    - people/jeff
  last_accessed: "YYYY-MM-DD"
  access_count: 0
```

## Memory Decay

Facts 会随时间降低 retrieval priority，避免 stale info 挤掉 recent context。

**Access tracking：** 当某个 fact 在对话中被使用，增加 `access_count`，并把 `last_accessed` 设为今天。heartbeat extraction 期间，扫描 session 中被引用的 entity facts，并更新它们的 access metadata。

**Recency tiers（用于重写 summary.md）：**

- **Hot**（过去 7 天访问）：在 summary.md 中突出包含。
- **Warm**（8-30 天前访问）：以较低优先级包含。
- **Cold**（30 天以上或从未访问）：从 summary.md 省略。仍保留在 items.yaml，可按需检索。
- 高 `access_count` 会抵抗 decay；频繁使用的 facts 会保持 warm 更久。

**Weekly synthesis：** 先按 recency tier 排序，再按 tier 内 access_count 排序。Cold facts 从 summary 中移除，但仍保留在 items.yaml。访问 cold fact 会重新加热它。

不删除。Decay 只通过 summary.md curation 影响 retrieval priority。完整记录始终保存在 items.yaml。
