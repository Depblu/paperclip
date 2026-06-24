---
name: agent-browser
description: 驱动真实浏览器检查或交互网页/app：导航、截图、读取 console 和 network、填写简单表单；用于验证任务，不用于无人值守自动化。
key: paperclipai/optional/browser/agent-browser
recommendedForRoles:
  - qa
  - engineer
  - researcher
tags:
  - browser
  - puppeteer
  - playwright
  - verification
---

# Agent Browser

使用受控浏览器验证行为、捕获证据，或从静态 fetch 无法访问的网页提取信息（SPA、登录态页面、动态内容）。这个 skill 面向有监督验证，不面向无人值守 scraping。

## 何时使用

- 你需要部署页面或本地 dev server 的截图，以确认 UI 变更。
- 你需要读取 `curl` / HTTP fetch 看不到的 JavaScript 渲染内容。
- 用户报告 UI bug，需要交互式复现并捕获 console errors、network requests 或 layout state。
- 你需要走一个短流程（加载页面、点击、观察）来验证 acceptance criteria。

## 何时不要使用

- 页面可作为静态 HTML 访问。用 `curl` / HTTP fetch；更便宜、更快、更可靠。
- 任务是无人值守的大规模 scraping。这应交给专用 scraper，并包含 rate limits、robots.txt 处理和真实 user agent policy，而不是此 skill。
- 站点在你没有凭据的 authentication 后面，或 terms of service 禁止自动化。
- 站点涉及敏感账户（banking、healthcare、government），自动化可能导致 lockout 或合规问题。

## 启动浏览器前

- 确认 URL，以及导航后应成立的状态。
- 确认需要什么证据：full-page screenshot、viewport screenshot、console log、network trace、HTML snapshot、extracted text。
- 确认关键 viewport size（mobile vs desktop）。除非任务专门要求 mobile，否则默认 desktop。
- 对本地 dev server，确认 server 正在运行，port 与预期一致。

## 驱动浏览器

典型验证 session：

1. **使用看起来真实的 user agent** 访问 public internet；不真实的 UA 会标记 automation traffic。
2. **设置合理 viewport**，例如 1366x768 desktop 或 390x844 iPhone-like。
3. **导航并等待正确信号。** 优先等待 specific selector 或 network-idle，少用任意 sleep。
4. **等待条件成功后立即捕获证据**，避免交互改变状态。
5. **有意地交互。** 一次一个 click，每次 action 后等待；每个有意义状态变化后重新 screenshot。
6. **读取 console 和 network panel**，检查意外 errors、4xx/5xx responses 或 slow requests。
7. **完成后干净关闭浏览器。** 长时间 browser session 会泄漏内存并占用 ports。

## 记录什么证据

验证任务需要交付：

- 每个有意义状态的 full-page 或 viewport screenshot。
- console log，过滤 warnings/errors。
- 任何非 2xx network response：URL、status、短 response body excerpt。
- 简短叙述：“Navigated to X, observed Y, clicked Z, observed W.”

UI bug 复现还要记录：

- 用户可跟随的精确复现步骤。
- viewport size，以及相关时的 device pixel ratio。
- bug 是首次加载就复现，还是交互后复现。

## 登录态页面

- 优先使用程序化 auth（API token、magic link），不要 UI login。
- 若 UI login 是唯一方式，用户必须明确为本次运行提供凭据。不要在 session 外复用凭据。
- 不要把凭据写入 session log、screenshot 或返回输出。

## 性能与礼貌

- 触碰共享 infra 时，每几秒最多一次 navigation。
- 对 public site 做大量检查时，尊重 `robots.txt`。
- 页面超过合理 timeout（例如 30s）就取消 navigation；页面可能已坏或在 rate-limit。
- 不要无限 retry。失败后最多用更长 timeout 重试一次，然后升级。

## 常见失败模式

- **Selector not found。** 页面变了，或等待发生在 render 之前。先截图看实际状态，再调整 selector。
- **Click does nothing。** 元素可能 offscreen、被 modal 覆盖，或在 shadow DOM。滚动到可见位置，或进入 shadow root。
- **Headless detection。** 一些站点检测 headless Chrome 并返回不同页面。仅在授权时使用非 headless 模式或更接近真实浏览器的配置。
- **Cross-origin iframe blocking。** 你无法检查不属于你的 iframe；页面必须在 iframe 外提供数据，否则任务不可行。

## 反模式

- 长时间无人监督 browser session，逐渐偏离原始任务。
- 对你不拥有 authentication 的站点 scraping。
- 截图说明只写 “looks good”，没有说明加载了什么状态以及哪些 selectors 证实它。
- 把一个通过的 screenshot 当作未测试 viewport 的正确性证明。
