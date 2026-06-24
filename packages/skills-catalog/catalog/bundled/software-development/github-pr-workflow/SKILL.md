---
name: github-pr-workflow
description: 从 feature branch 准备 GitHub pull request：分支卫生、commit 形状、标题/正文、验证说明、UI 截图，以及 review comment 回复。
key: paperclipai/bundled/software-development/github-pr-workflow
recommendedForRoles:
  - engineer
tags:
  - github
  - pull-requests
  - code-review
  - release
---

# GitHub PR 工作流

交付 reviewer 能直接合入的 PR，不留下追问空间。重点是标题和正文高信号、验证证据充分，以及收到反馈后清晰回复。

## 何时使用

- 你准备为已经功能完成的变更打开 PR。
- reviewer 留了 comments，你需要回复并 push fixes。
- PR 已打开超过一天，需要恢复到可评审状态：冲突过期、描述缺失、验证缺失。

## 何时不要使用

- 变更尚未功能完成。先完成工作；会在 review 中反复退回的 draft PR 是噪音。
- 仓库使用非 GitHub forge。按该 forge 的约定调整，不要强套 GitHub 习惯。

## 开 PR 前的分支卫生

- 从目标 base rebase 或 merge，确保 diff 当前有效。
- 将 WIP commits squash 成可评审单元。优先一个逻辑变更一个 commit；若工作确实多步骤，不必强行一个 PR 一个 commit。
- 本地确认 tests、typecheck、lint 通过。任何有意跳过都写进 PR body。
- 删除 debug prints、注释掉的代码，以及未被 issue 跟踪的 `TODO`。

## PR 标题

- 使用祈使语气，少于 70 个字符。
- 以用户可见变化开头，不以被修改文件开头。`Allow CSV export from reports table` 优于 `Update reports.tsx`。
- 如果 repo 有 issue prefix 约定（`PAP-1234:`、`[security]`），遵循它。
- 不要句号结尾。

## PR 正文

使用以下结构：

```md
## Summary
- 1-3 bullets，说明改了什么以及原因。

## Implementation notes
- diff 中不明显的内容：trade-off、放弃的方案、注意事项。
- migration 或 config 影响。

## Verification
- 你运行的精确命令或步骤。
- UI 变更需要 screenshots 或短 clip（像素变化时必填）。
- 手动覆盖的 edge cases。

## Risk and rollback
- 如果 revert 会影响什么，以及如何干净回滚。
```

只有非常 trivial 的 PR（typo、docs）才可以省略 `Risk and rollback`。

## 验证证据

- CI 通过是必要条件，但不足以证明端到端行为正确。
- UI 工作包含 golden path 和一个 edge case 的截图。若项目支持 dark / light mode，标明模式。
- migration 包含 dry-run plan 和回退步骤。
- 性能变更包含前后测量结果，不用形容词代替数据。

## 回复 review comments

- 每条 comment 都要回复，即使只是 “fixed in <commit-sha>”。静默修复会让 reviewer 猜。
- review 进行中，把修复作为新 commits push；除非 reviewer 同意，否则不要 amend。
- 不同意反馈时，用一句理由说明，然后让 reviewer 决定。不要围绕 comment 升级争论。
- push changes 后明确 re-request review。

## Merge checklist

- 所有 required checks green。
- 所有 review comments resolved。
- PR title/body 仍准确；若 scope 中途变化，更新它们。
- linked issue 根据项目约定进入 `in_review` 或 `done`。
- merge 后删除分支，除非它是长期 integration branch。

## 反模式

- PR 描述只写 “see commits”。reviewer 不应需要读 log 才知道发生了什么。
- 同一 PR 混合 refactor 和行为变更，且 body 不区分。
- “Address feedback” commits 夹带无关编辑。一轮反馈一个 commit 可以；把所有进行中的东西混成一个 commit 不行。
- active review 中 force-push 却不告知 reviewer。
