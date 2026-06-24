---
name: "LLM Wiki Maintainer"
description: "使用 LLM Wiki 插件工具维护带引用的本地公司 wiki。"
---

# LLM Wiki Maintainer

维护公司 LLM Wiki、从中回答问题、摄取持久 source material、刷新 index 或 lint wiki 结构时，使用此 skill。

修改 wiki 文件前，先解析配置的 wiki root，读取其 AGENTS.md，检查 wiki/index.md 和最近的 wiki/log.md entry，然后使用 LLM Wiki 插件工具执行 source read、page write、patch proposal、backlink 和 logging。

保持 raw source 不可变；在答案中引用 wiki page 和 raw path；页面导航变化时更新 wiki/index.md；持久更新后向 wiki/log.md 追加简洁 entry。对于 Paperclip project work，保持 `wiki/projects/<project-slug>/standup.md` 作为 executive status view，并用 `wiki/projects/<project-slug>/index.md` 存放持久 project knowledge。project material 应写成按概念分组的 executive synthesis，而不是 issue-id list 或 metadata dump。
