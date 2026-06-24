---
name: doc-maintenance
description: 让项目文档与近期代码和功能变更保持一致；发现漂移、更新受影响页面，并补充发布相关说明，避免重写未变更内容。
key: paperclipai/bundled/docs/doc-maintenance
recommendedForRoles:
  - engineer
  - product
  - devrel
tags:
  - docs
  - documentation
  - release-notes
---

# 文档维护

用最小改动保持文档真实。目标是让文档和实际行为一致，而不是风格重写或目录整理。评审者应该能从 diff 中看出：“这些修改让文档匹配了最近的行为变化”。

## 何时使用

- PR 或近期合并改变了用户可见行为：CLI flag、API shape、默认值、配置 key、endpoint、环境变量、支持版本。
- 用户报告的问题最终追溯到过期文档。
- 正在准备 release，需要对照已合并 commit 检查文档。
- 新功能已经发布，但只有工程师的 PR 描述说明了如何使用。

## 何时不要使用

- 改动只影响内部实现，比如私有 helper 改名或 refactor，没有用户可见影响。
- 只是想“优化文档”，但没有行为锚点。这是独立项目，不是维护任务；先写计划。

## 维护流程

1. **确认基线。** 明确要对照的 commit 范围：上一个 release tag、上一次文档更新 commit，或某个 PR 之后。
2. **枚举用户可见变化。** 阅读 commits 和 PR 描述。逐项写清用户现在能做什么不同的事。
3. **映射到文档。** 对每项变化，找到所有提到相关概念的页面。常见目标：README、CLI reference、API reference、配置参考、迁移指南、FAQ、示例。
4. **精确更新。** 只改必须变化的行。不要重新换行未修改段落；这会污染 diff。
5. **必要时新增条目。** 新 CLI flag 要进 CLI reference。新环境变量要进配置参考。新 endpoint 要进 API reference。不要只写 changelog。
6. **更新示例和 snippet。** 代码块比 prose 更容易过期。重新运行任何涉及新行为的示例。
7. **撰写 release note。** 每个用户可见变化一句话。按 Added / Changed / Fixed / Deprecated / Removed 分组。链接相关 PR 和文档章节。
8. **交叉检查。** 搜索旧行为文案，移除或更新漏网处。

## 风格基线

- 语气：面向用户，用“你可以传 `--json` 给 ...”。除叙事页外避免“我们”。
- 时态：使用现在时，不写未来时。代码发布后行为就是当前事实。
- 标题：用祈使句（“配置缓存”）或名词短语（“缓存配置”），跟随周围页面风格。
- 代码块：带语言标记，保证语法高亮。
- 交叉链接：每页首次提到概念时链接即可，不要每次出现都链接。
- 不承诺未来行为。未发布内容标记为 `experimental`，或直接省略。

## 漂移识别

出现以下任一情况，文档就在漂移：

- 记录了已经不存在的 flag、key 或 endpoint。
- 示例无法按文档运行。
- 文档默认值与代码不一致。
- 支持版本列表漏掉实际支持版本，或包含已不支持版本。
- “Coming soon” 部分提到的功能已经发布或取消。

发现漂移后，在同一轮维护里修复，并在 release note 的 `Fixed` 组里说明。

## Release note 规则

- 每项一句话。需要两句话时，通常说明它应该拆成两项。
- 先写用户影响，再写内部原因。`冷启动快 60%（首次运行避免完整 bundle 下载）` 优于 `重构 bootstrap loader`。
- 为工程读者链接 PR，为用户链接文档页。
- 破坏性变更必须用 `**Breaking:**` 前缀。迁移步骤写在同项内或链接迁移指南。

## 反模式

- 把风格重写和真实更新混进一个巨型文档 PR。评审者无法判断哪些行反映了行为变化。
- commit message 只写 “Updated docs”，没有细节。commit 应说明改了什么以及原因。
- 只更新 changelog，不更新 changelog 指向的 reference docs。
- 代码未落地前把功能写成可用。文档应跟随行为，而不是承诺行为。
