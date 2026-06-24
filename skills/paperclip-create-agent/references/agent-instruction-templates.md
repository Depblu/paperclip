# Agent Instruction Templates

在 hiring workflow 的 step 4 使用此参考。它列出当前 role templates、各自适用时机，以及如何在 exact template、adjacent template 和 generic fallback 之间决策。

这些 templates 故意与主 Paperclip heartbeat skill 以及本目录的 `SKILL.md` 分离：核心 wake procedure 和 hiring workflow 保持短小，role-specific depth 放在这里。

## Decision flow

```
role match?
├── exact template exists       → copy it, replace placeholders, submit
├── adjacent template is close  → copy closest, adapt deliberately (charter, lenses, sections)
└── no template is close        → use references/baseline-role-guide.md to build from scratch
```

在 hire comment 中说明你采用了哪条路径，方便 board 审计 reasoning。

## Index

| Template | Use when hiring | Typical adapter | Lens density |
|---|---|---|---|
| [`Coder`](agents/coder.md) | 实现代码、debug issues、写 tests，并与 QA/CTO 协作的软件工程师 | `codex_local`、`claude_local`、`cursor` 或其他 coding adapter | Low (operational) |
| [`QA`](agents/qa.md) | 复现 bugs、验证 fixes、捕获 screenshots，并报告 actionable findings 的 QA 工程师 | `claude_local` 或其他 browser-capable adapter | Low (operational) |
| [`UX Designer`](agents/uxdesigner.md) | 产出 UX specs、评审 interface quality，并演进 design system 的产品设计师 | `codex_local`、`claude_local` 或其他具备 repo/design context 的 adapter | High (lens-heavy) |
| [`SecurityEngineer`](agents/securityengineer.md) | 做 threat model、评审 auth/crypto/input handling、分诊 supply-chain 和 LLM-agent risk，并推动 remediation 的安全工程师 | `claude_local`、`codex_local` 或其他具备 repo context 的 adapter | High (lens-heavy) |

如果要 hire 的 role 不在 index 中，不要强行套用。确实接近时使用 adjacent-template path；没有接近项时使用 generic fallback。

### 何时使用各 template

- **Coder**：hire 主要按照既有 conventions 写或改 code、运行 focused tests，并交接给 QA。charter 是 “ship code that passes review and CI” 时选择 Coder。不要用于纯 strategy、design 或 security review。
- **QA**：hire 在运行中的 product 里复现 bugs、在 browser 或 test harness 中走 flows，并产出 evidence-grounded pass/fail reports。charter 是 “confirm the user experience matches intent” 时选择 QA。只跑 static linters 或 unit tests 的 agents 应归 Coder。
- **UX Designer**：hire 对 user experience 和 product work 的 visual quality 负责。角色必须做 design calls、反对未 styling 的 implementation、演进 design system 时选择 UXDesigner。只 proofread 或执行 style-guide consistency、或者只运行 automated accessibility scans 的 agents 属于 operational，可使用 baseline guide。Content Design（microcopy、voice、IA）是使用 lenses 的变体，见 adjacent-template path。
- **SecurityEngineer**：hire 对 security posture 负责：threat-modeling、review auth/crypto/input handling、supply-chain 和 LLM-agent risk，并用 evidence 推动 remediations。角色必须阻止 insecure designs、提出具体 fixes、处理 sensitive disclosure 时选择 SecurityEngineer。只运行 automated scanners 且不负责 triage 的 agents 属于 operational，可用 baseline guide 加短 security-lens subset。

### Lens density：何时保留完整 lens list

- **Lens-heavy templates**（UXDesigner、SecurityEngineer）编码专家判断。长 lens list 是 deliverable；hire primary domain owner 时保留完整。只有当 hire scope 明确更窄时，才删除 lens groups（例如永远不碰 infrastructure 或 cryptography 的 “Application Security Reviewer”）。
- **Operational templates**（Coder、QA）刻意保持简短。不要因为 baseline guide 推荐 lenses 就把 lens lists 塞进去。如果 Coder-adjacent role 确实需要 lenses（例如 Performance Engineer），从 baseline-role-guide examples 中抽取 focused 5-10 个 lenses，而不是复制完整 SecurityEngineer 或 UXDesigner lenses。

## 如何应用 exact template

1. 打开 `references/agents/` 中匹配的 reference。
2. 将 template 复制进新 agent 的 instruction bundle（通常是 `AGENTS.md`）。对于使用 local managed-bundle adapters 的 hire requests，将改造后的 template 作为 top-level `instructionsBundle.files["AGENTS.md"]` 发送。不要把新 agent instructions 放进 `adapterConfig.promptTemplate`。
3. 替换 `{{companyName}}`、`{{managerTitle}}`、`{{issuePrefix}}` 和 URLs 等 placeholders。
4. 移除目标 adapter 无法使用的 tools 或 workflows。
5. 保留 Paperclip heartbeat requirement 和 task-comment requirement。
6. 只有当 role-specific skills 或 reference files 实际 installed 或 bundled 时，才添加它们。
7. 打开 hire 前运行 pre-submit checklist：`references/draft-review-checklist.md`。

## 如何应用 adjacent template

当请求的 role 接近现有 template 但不完全相同时使用（例如从 `coder.md` 改成 “Backend Engineer”，从 `uxdesigner.md` 改成 “Content Designer”，从 `qa.md` 改成 “Release Engineer”，或从 `securityengineer.md` 改成 “AppSec Reviewer”）。

1. 从最接近的 template 开始。
2. 为新 role 重写 role title、charter 和 capabilities；不要保留源 role 的 framing。
3. 替换 domain lenses，使其匹配新 discipline。只保留真正适用的 lenses。
4. 移除不合适 sections（例如从 backend engineer template 中删除 UX visual-quality bar，或从 application-only security reviewer 中删除 infrastructure lenses）。
5. 添加 baseline role guide 推荐但源 template 缺失的 role-specific section。
6. 在 hire comment 中说明你改造了哪个 template、改了什么，方便未来同角色 hire 从你的 draft 起步。
7. 运行 pre-submit checklist。

## 如何应用 generic fallback

没有接近 template 时使用。打开 `references/baseline-role-guide.md` 并遵循其 section outline。该 guide 的结构能让 CEO 或 hiring agent 在不向 board 请求 prompt-writing 帮助的情况下，产出可用 `AGENTS.md`。draft 后运行 pre-submit checklist。

## 基于 lenses 的角色起草（worked examples）

Lenses 是 expert role 的最大质量杠杆，也是 operational role 的最大噪音来源。用这些 examples 校准。

### Example 1：lens-heavy adjacent template：“Backend Performance Engineer”

Source：接近 `coder.md`，但 charter 是 performance 和 reliability，不是 general feature work。

1. 从 `coder.md` 开始。
2. 围绕 performance 重写 charter：负责 latency 和 throughput budgets、profile hot paths、用 before/after measurements 提出具体 fixes，并阻止 regression SLO 的 merge。
3. 添加 focused lens section（约 6-10 个 lenses），例如：Amdahl's Law、Tail-at-Scale、Little's Law（throughput = concurrency / latency）、N+1 queries、hot-cold partitioning、cache coherence、GC pause budget、backpressure、SLO vs SLI vs SLA、observability-before-optimization。
4. 添加 “performance review bar”，说明 PR 需要的 evidence：flamegraph 或 trace、baseline vs fixed numbers、会在 regression 时失败的 test。
5. 删除 UX visual-quality 内容。删除 broad security lenses；交给 SecurityEngineer。

这样能产出 lens-heavy 变体，而不是粘贴 SecurityEngineer 或 UXDesigner 的 lens dump，也不会保留 Coder 的 generic framing。

### Example 2：narrow role 的 focused lens subset：“Dependency Auditor”

Source：接近 `securityengineer.md`，但 scope 仅 supply-chain risk。

1. 从 `securityengineer.md` 开始。
2. 围绕 supply-chain audit 重写 charter：关注 lockfile changes、运行 `osv-scanner` / `npm audit` / `pip-audit`、分诊 CVEs，并用 owner 和 severity 创建 remediation tickets。
3. 只保留 Supply chain、Secure SDLC、Logging/monitoring lens groups。删除 AuthN/AuthZ、Cryptography、Web-specific hardening、Infrastructure、Rate limiting、Data protection。这些 lenses 对纯 dependency-audit role 只是噪音。
4. 保留 Review bar 和 Remediation bar sections，因为该 role 仍产出带 severity 和 fix proposals 的具体 findings。
5. 如果该 role 永远不处理 private advisories，删除 disclosure-discipline clause；会处理则保留。

结果是紧凑且 role-appropriate 的 prompt，仍引用 auditor 真正使用的 lenses，而不是继承完整 security lens catalog。

### Example 3：不需要 lenses：“Release Coordinator”

Source：接近 `qa.md`，但 charter 是 release-note curation 和 cut coordination，不是 browser verification。

1. 从 `qa.md` 开始。
2. 围绕 release coordination 重写 charter：从 merged PRs 汇总 release notes、确认 CI green、打 tag、为 known issues 创建 follow-up tickets。
3. 不添加 lens section。该 role 是 operational；baseline role guide 明确允许 judgment 不是 deliverable 的 role 不使用 lenses。
4. 保留 comment-on-every-touch rule、blocked/unblock rule、heartbeat-exit rule。
5. 用 release-coordination workflow 替换 browser workflow（包含哪些 PR、如何格式化 notes、谁 sign off）。

这样 role 保持短而聚焦，避免出现“任何人都适用”的 lens paragraph，防止 agents 学会忽略。

### Example 4：trimmed lenses 的 UX-adjacent template：“Content Designer”

Source：接近 `uxdesigner.md`，但 charter 是 voice、microcopy 和 information architecture，不是 full visual design。

1. 从 `uxdesigner.md` 开始。
2. 围绕 content 重写 charter：负责 product surfaces 的 voice/tone、microcopy 和 information architecture；评审 empty-state copy、error messages、onboarding flows；反对 jargon 和 dark-pattern language。
3. 保留 lens groups：`IA & content`、`Forms & errors`（microcopy）、`Behavioral science`（framing、defaults、anchoring）、`Accessibility`（plain language、reading level）、`Emotional & trust`、`Ethics`（dark-pattern copy）。
4. 删除 lens groups：`Gestalt`、`Motion & perceived performance`、`Platform & context`（thumb zones），以及大部分 `System & interaction`（Fitts's Law、Doherty Threshold）。这些是 content role 不应用的 visual/interaction lenses。
5. 保留 `Reach for what exists first`，但围绕 content patterns（error templates、toast taxonomy、empty-state voice）重写，而不是 components 和 tokens。
6. 删除 `Visual quality bar` pixel checklist；替换成 content bar（voice consistent、scannable、plain-language、no dark-pattern copy）。
7. 保留 `Visual-truth gate`，但将 renderable-surface requirement 缩小为“引用 rendered string in context”（例如 screenshot 或 compiled output 中的 grep），而不是 desktop + mobile viewport shots。

无论哪种情况，都要在 hire comment 中说明采用了哪条路径，并点明你改造了什么。未来同角色 hire 会从你的 draft 起步；reasoning 越清楚，下一次 hire 越便宜。
