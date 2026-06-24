---
name: design-critique
description: 进行结构化产品设计评审：用户任务清晰度、层级、affordance、错误状态、可访问性和一致性；重点说明改什么、按什么顺序改、为什么。
key: paperclipai/optional/product/design-critique
recommendedForRoles:
  - designer
  - product
  - engineer
tags:
  - design
  - product
  - ux
  - review
---

# 产品设计评审

针对 screen、flow 或 component 做结构化 critique。输出应是 designer 或 engineer 可执行的优先级变更清单，而不是形容词。Critique 不是 redesign；提出建议，不要重建。

## 何时使用

- designer 或 engineer 请求你反馈某个 screen、mock 或 live UI。
- 功能即将发布，有人需要最终 UX read。
- 某个 flow 疑似导致 user drop-off，需要在 instrumentation 前做预研判断。

## 何时不要使用

- 用户想要 redesign。这是设计项目，不是 critique。
- 工作早到没有具体 artifact。和对方一起 sketch，而不是 critique 空气。
- 你不了解 user job。先询问；没有用户上下文的设计评审会退化成审美偏好。

## Critique 前上下文

打开 screen 前，获取：

- **用户是谁。** 具体角色和能力水平，不要写泛泛的“users”。
- **他们在这个 screen 上要完成什么 job。** 一句话。
- **成功是什么样。** 这个 screen 后用户能做什么以前做不到的事。
- **这个 screen 在更大 flow 中的位置。** 前一步和后一步是什么。

缺任何一项就先问。没有这些信息的 critique 只是观点。

## 评审顺序

1. **用户 job 清晰度。**
   - 打开后 3 秒内，是否能明显看出这个 screen 用来做什么？
   - primary action 是否匹配用户真实 job，而不是 designer 偏好的路径？

2. **视觉层级。**
   - screen 上最重要的内容应最突出（size、weight、position、color）。
   - secondary action 看起来应次要。tertiary action 应可找到但不喧宾夺主。
   - headings 应按任务把内容切成正确分组。

3. **Affordance 与 signifier。**
   - 可点击对象看起来可点击。
   - disabled 对象看起来 disabled，并在 hover/focus 时解释原因。
   - drag、scroll、swipe 等交互应可发现，不要隐藏。

4. **状态。**
   - Empty state 有设计，而不是空白矩形。
   - Loading state 表达进度，而不是只转圈。
   - Error state 用用户语言说明发生了什么，以及下一步怎么做。
   - Success state 做确认，不要为普通操作庆祝。

5. **输入和表单。**
   - label 可见，不只依赖 placeholder。
   - validation 时机正确（on blur，而非每次 keystroke，除非字段格式明确）。
   - 必填字段有标记。
   - 字段顺序符合用户思维顺序，而不是数据库顺序。

6. **可访问性。**
   - 颜色对比至少满足 WCAG AA；合理时追求 AAA。
   - keyboard navigation 的 focus order 合理。
   - 交互元素无需鼠标也能到达。
   - 关键信息不只靠颜色传达；icon、text、position 要支撑它。
   - mobile touch target 至少 44x44 px。

7. **一致性。**
   - tokens、components、patterns 与产品其余部分一致。
   - 借鉴其他产品的 pattern 必须是有意选择，不是意外漂移。

8. **文案。**
   - button 使用动词并说明结果（“Save changes” 优于 “Submit”）。
   - microcopy 解释问题，不做装饰。
   - 语气匹配产品 voice。

9. **边界情况。**
   - 长内容（长名称、大量 items、RTL 语言）。
   - 极少内容（一个 item、零 items）。
   - 慢网络和离线行为。
   - 权限拒绝。

## 输出格式

按严重程度分组，再按类别写。每条 finding 都是一个问题和一个建议修复。

```md
## Design critique: <screen name>

### Must-fix (blocks ship)
- **<category>:** <one-line issue>. **Try:** <one-line suggestion>.

### Should-fix (before broader rollout)
- **<category>:** <one-line issue>. **Try:** <one-line suggestion>.

### Nice-to-fix (when there's room)
- **<category>:** <one-line issue>. **Try:** <one-line suggestion>.

### Strengths to keep
- <one-line thing the design got right>
```

始终包含 “strengths to keep” section。这不是奉承，而是告诉 designer 下一轮不要改掉什么。

## 反模式

- 只说 “I would do it differently”，不说明改什么和为什么。这是偏好，不是 critique。
- 长篇 critique 把 must-fix 淹没在 nice-to-have 里。
- 借 critique 之名建议全新功能。
- 忽略用户上下文，按个人 taste 打分。
- 把 critique 当 approval。若用户要求 approval，明确说；否则 critique 只是反馈，不是签核。
