---
name: release-announcement
description: 撰写 release announcement、changelog、blog post、in-app note 或 social post；以用户影响开头，明确受众，并包含 upgrade/migration 步骤，避免 filler。
key: paperclipai/optional/content/release-announcement
recommendedForRoles:
  - devrel
  - product
  - writer
tags:
  - release
  - changelog
  - announcement
  - communication
---

# 发布公告

为 release 写适合渠道的公告，避免无效包装。不同 surface 需要不同形状：changelog entry 不是 blog post，也不是 social card。标准是：读者能在 30 秒内判断这次 release 是否影响自己，以及如果影响该做什么。

## 何时使用

- 某个版本、功能或修复正在发布，需要至少一个 surface 的 writeup。
- 之前内部可见的功能进入 GA。
- 破坏性变更需要在用户踩坑前广播。

## 何时不要使用

- 内部变更没有用户影响。更新内部文档，不要公告。
- release 还没完成，仍在 active development。等它真正发布，即使 marketing 想提前发。

## 先确定受众和渠道

| 受众 | 最佳渠道 | 语气 |
|---|---|---|
| 既有 power users | Changelog、in-app note | 简短、事实、链接 |
| 接入 API 的工程团队 | Release notes、dev blog | 示例、迁移步骤、版本 pin |
| 潜在客户 | Landing page、marketing blog | 故事线、问题到方案、social proof |
| 广泛受众 | Social post、email newsletter | 一句话 pitch、链接到详情 |
| 内部团队 | Slack/Discord post | 变化内容、出问题找谁 |

为本次 writeup 选择一个受众。一次 release 往往需要多篇 writeup；不要混在一起。

## 通用结构

无论渠道如何，都先写：

1. **改了什么。** 用用户语言写一句话。
2. **影响谁。** 哪类用户角色 / use case。
3. **需要做什么。** 现在迁移 / opt-in / 无需操作。

其他内容都是支撑这三点的细节。

## 渠道模板

### Changelog entry（简短）

```md
## v1.42.0 — 2026-05-26

### Added
- <feature> — <one-line user benefit>. ([#1234](link))

### Changed
- <change> — <one-line impact>. ([#1235](link))

### Fixed
- <bug> — <one-line user-visible symptom>. ([#1236](link))

### Deprecated
- <thing>. Replaced by <thing>. Removal planned for v<x>.

### Breaking
- <change>. **Migration:** <one-line> or <link to guide>.
```

### Release notes（面向 adopters）

与 changelog 相同，另加：

- migration guide section，包含 before/after code。
- compatibility table（versions、runtimes、OS）。
- known issues 和 workarounds。
- acknowledgements（contributors、fixed bugs 的 reporters）。

### Dev blog post（300-800 字）

- **Hook（1 段）：** release 解决的问题，放进真实场景。
- **What's new（3-5 bullets + 子段落）：** 功能，每项配一个 code 或 screenshot 示例。
- **Upgrade（1 段）：** 如何升级，要检查什么。
- **What's next：** 一句话说明下一方向。避免承诺。

### In-app note

- 1 句话。
- 1 个链接。
- 用户看过后 dismiss。

### Social post

- 1 句 pitch。
- 1 个链接。
- 1 张图或短 clip。
- 不要 threadbait。若需要 thread，就写 blog post。

## 写作规则

- 以用户开头，而不是团队。`You can now export to CSV` 优于 `We've added CSV export`。
- 数字优于形容词。`冷启动快 60%` 优于 `much faster`。说明测量方法。
- 展示胜过空说。一个 code snippet、一张 screenshot；更多就是噪音。
- 给文章标日期。无日期 release 内容最快腐烂。
- 明确链接迁移路径。不要埋起来。
- 破坏性变更用 `**Breaking:**` 前缀标记。email/social 渠道也要重复。

## 避免

- “We are excited to announce” 这类 filler。
- 把用户可见变更和内部变更混在一个列表。
- 没有验证路径的 marketing claim。
- 承诺未发布工作日期。
- 预告团队尚未承诺发布的内容。

## 发布后 checklist

- changelog 已随 release 进入 source control。
- blog post 日期与实际发布日期一致。
- 所有链接可用（release tag、PR、docs sections）。
- breaking changes 同时进入 upgrade guide，而不是只写在公告里。
- 内部团队在公开发布前已收到通知，而不是发布后才知道。
