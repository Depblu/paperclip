---
name: wireframe
description: 生成低保真黑白 UI wireframe，输出为独立 SVG 文件；可选打包成单页 HTML viewer，并通过 here-now skill 发布。用户要求 “wireframe X”、“sketch a screen for”、“draft a layout”、“low-fi mockup”、“rough mock”、“make a page to view the wireframes”、“build a viewer for these screens” 或 “deploy / publish / host the wireframes” 时使用。若用户要生产 UI code、品牌化设计、hi-fi mockup 或动画/交互 prototype，不要使用本 skill；改用 frontend-design 或类似 skill。
key: paperclipai/bundled/product/wireframe
recommendedForRoles:
  - designer
  - product
  - engineer
tags:
  - design
  - wireframe
  - ux
  - prototyping
  - svg
---

# Wireframe

生成低保真、黑白 UI wireframe，格式为**独立 SVG 文件**。目标是表达**结构**：什么放在哪里、顺序如何、大致尺寸如何，而不是承诺颜色、品牌或视觉 polish。

## 何时使用

以下表达应触发：

- "wireframe a [screen / page / flow] for X"
- "low-fi / lo-fi mockup of X"
- "draft a layout for X"
- "rough sketch of the [dashboard / settings / login / ...] page"
- "show me how X would lay out before I build it"

如果请求提到 brand、polish、真实 components、"production-ready"、colour palettes、hi-fi、Figma export，或实际 code/HTML/React deliverables，则跳过并转交给 `frontend-design` 或类似 skill。

## House style：不可妥协

Wireframe 是诊断工具，不是装饰图。每个输出都锁定这些 token：

| Token            | Value                                             | Notes                                  |
| ---------------- | ------------------------------------------------- | -------------------------------------- |
| Stroke           | `#000` width `1.5`                                | 所有 borders、dividers、outlines       |
| Fill (boxes)     | `#fff`                                            | cards/containers 默认填充              |
| Placeholder fill | `#e6e6e6`                                         | image/avatar/empty-state 区域          |
| Text colour      | `#000` for labels, `#666` for placeholder text    | 不使用其他颜色                         |
| Accent           | `#d33` (dashed) — annotation layer ONLY           | 永远不要放进真实 UI elements           |
| Font             | `font-family="-apple-system, system-ui, sans-serif"` | 全文件单一字体                         |
| Type scale       | `12` caption · `14` body · `20` heading · `28` title | 不使用其他字号                         |
| Grid             | 8px snap, 24px gutter                             | 所有 x/y/w/h 必须是 8 的倍数           |
| Default canvas   | `1280×800` desktop, `375×812` mobile, `768×1024` tablet | 选择一个，并在 comment 中说明          |

如需突出 callout 区域，只能使用 **annotation layer**（红色 dashed）。不要给 wireframe 本体上色。

## Workflow

1. **确认范围。** 哪些 screen？哪个 viewport（desktop / tablet / mobile）？单屏还是多屏 flow？不清楚时问一个问题，然后按最可能默认值继续。
2. **选择 canvas。** 从上表选择，并在回复中说明 viewport。
3. **用 primitives 组合。** 读取 `references/components.md`，用 primitive snippets 组装 screen。所有坐标吸附到 8px。
4. **写入 SVG 文件。** 默认路径：工作目录下的 `wireframes/<slug>.svg`。filename slug 描述 screen，例如 `login.svg`、`dashboard.svg`、`settings-account.svg`。
5. **在回复中给出文字 annotation list。** 将 SVG 中每个编号区域映射到一句描述，例如 “1 — primary nav, 2 — search input, 3 — list of recent items”。这让 wireframe 可访问、可查询、可评审。
6. **多屏 flow**：每个 screen 一个 SVG，并生成一个 `flow.svg` summary，横向排列 thumbnails，用箭头连接。

## Quick start：最小 SVG

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"
     font-family="-apple-system, system-ui, sans-serif" fill="#fff" stroke="#000" stroke-width="1.5">
  <!-- canvas border -->
  <rect x="0" y="0" width="1280" height="800" />

  <!-- example: a button -->
  <g transform="translate(48, 48)">
    <rect width="120" height="40" rx="4" />
    <text x="60" y="25" font-size="14" text-anchor="middle" stroke="none" fill="#000">Continue</text>
  </g>
</svg>
```

两个必须记住的 house-style 细节：

- `<text>` elements 始终设置 `stroke="none"`；否则 text 会继承 parent stroke，出现 halo。
- text fill 始终显式写 `fill="#000"`，因为 parent group 的 fill 是 box 用的 `#fff`。

## Primitive library

完整 reusable primitives 位于 `references/components.md`。当你需要不在工作记忆中的精确 markup 时，加载该文件。不要从零重推 primitive；复制 snippet 并调整坐标。

提供的 primitives：

- **Inputs:** button（filled、outlined、icon）、text input、textarea、dropdown、checkbox、radio、toggle、search input
- **Layout:** card、section divider、sidebar、two-column、three-column
- **Navigation:** navbar、tab bar、breadcrumb、pagination、sidebar nav
- **Content:** heading、paragraph block、list row、table、key-value pair、metric tile
- **Media:** image placeholder、avatar（circle/square）、video placeholder
- **Overlay:** modal、drawer、toast、tooltip、dropdown menu（open state）
- **Annotation:** numbered callout、dashed region highlight、arrow connector

## Grid、palette 和 type scale

精确 pixel values、palette tokens 和 type sizes 见 `references/grid-system.md`。

## Worked examples

`references/examples.md` 包含四个完整 wireframe，可复制并改造：

1. Login screen（mobile, 375×812）
2. Admin dashboard（desktop, 1280×800）
3. Settings page with form（desktop, 1280×800）
4. Modal confirmation overlay（desktop, 1280×800）

当用户请求接近其中一个示例时，从示例开始修改，不要空白起步。

## 输出约定

每个 wireframe response 应包含：

1. 写入磁盘的 SVG 文件（明确写出 path）。
2. 在回复中 inline SVG，方便 markdown preview 渲染。
3. 简短编号 annotation list，说明每个区域的意图。
4. 任何显式假设（viewport、signed-in state、empty/populated；dark/light 不适用，因为 wireframe 是 monochrome）。

## 如果用户要求 website / viewer page

触发表达包括 “make a page that shows the screens”、“single page I can scroll”、“build a viewer”、“let me click through the wireframes”、“show them all on one page”，或任何把多个 wireframe 打包成可浏览 artifact 的请求（不是生产站点）。

构建**一个静态 `index.html`**，直接加载 SVG wireframes。不要把它变成 React app 或 component library；它是 review surface，不是产品 UI。

**默认文件布局**：

```
design/<task-slug>/
  index.html
  wireframes/    # 本 skill 产出的 SVG
  screenshots/   # 任何参考截图
```

**页面结构**（从 `assets/site-template.html` 开始调整，不要重推 CSS）：

- **Sticky sidebar TOC**：desktop 上 240px，列出每个 screen 的 anchor links。按 Flow / Screens / Open questions 分组。
- **Hero header**：顶部放 crumb（issue id）、title、一段 summary、meta tag pills（`12 screens`、`Lo-fi · monochrome`、`Click any wireframe to zoom`）。
- **每个 screen 一个 section**，使用 2-column grid：左侧 wireframe，右侧 reference image + numbered annotations + “Why this changes” callout。wireframe `<img>` 直接指向 SVG 文件；不要 inline。
- **Click-to-zoom lightbox**：任何标记 `[data-zoom]` 的元素可打开。Esc 和 backdrop click 都关闭。
- **Flow diagram** section 放在靠前位置，全宽加载 `wireframes/flow.svg`。
- **Open questions** section 放在底部，记录未决问题。

**Viewer house style**（匹配 wireframe）：

- Palette: `--bg: #fafaf8`, `--panel: #fff`, `--ink: #111`, `--muted: #666`, `--line: #e5e5e0`, `--accent: #d33`（red dashed callouts only）。
- System font stack only: `-apple-system, system-ui, "Segoe UI", sans-serif`。不用 web fonts。
- 8px spacing，card `border-radius: 8px`，1px `--line` border，除 `.wire` hover lift 外不用 shadows。
- viewer chrome 可以比 wireframe 本身稍微 polished（subtle hover、rounded cards），但不能 colorful。wireframes 本身严格 monochrome。

**Responsive**（交付前验证）：

- ≥980px：two-column grid，sidebar TOC 可见。
- 900-980px：grid 变为单列，TOC 仍是 sidebar。
- <900px（tablet/phone）：TOC 折叠为页面顶部 sticky `<details>` disclosure，默认关闭；点击 link 后自动关闭。sections 使用 `scroll-margin-top: 80px`，避免 anchor jump 被 sticky bar 遮挡。
- <560px（phone）：更紧凑 type/spacing scale，hero 缩小，lightbox 从 flex-centered 切为全 viewport width 的 block layout，并加 `touch-action: pinch-zoom`，方便继续捏合放大。

**Verification**：交付前在浏览器打开文件，并在 1440×900、768×1024、390×844 逐一检查。确认 anchor jumps 落点正确、lightbox 能打开/关闭、SVG 按正确 aspect 渲染。

## 如果用户要求 deploy / publish / host wireframes

转交给 **`here-now` skill**。它负责 publishing、anonymous vs. permanent site、claim tokens 和 credentials。不要自己实现 hosting。

加载 `here-now` skill 并遵循其 `publish.sh` recipe。基本形式：

```bash
cd design/<task-slug>
{path-to-here-now}/scripts/publish.sh .
# → https://{adjective-noun-suffix}.here.now/
```

如果当前 agent 没有安装 `here-now`，安装它（`npx skills add heredotnow/skill --skill here-now -g`），或升级给负责 agent skill set 的人。不要自己实现 hosting。

调用时记住：

- 发布**根目录含 `index.html` 的目录**，不是 parent。`index.html` 必须位于发布树根部。
- 没有已保存 credentials 时，site 是**anonymous，24 小时过期**。有已保存 API key 时才是永久。如果用户要永久 URL，遵循 `here-now` skill 的 sign-in-code flow；不要伪造绕过。
- 更新时传 `--slug {existing-slug}`，让 URL 在多轮 review 中稳定（script 会从 `.herenow/state.json` 自动加载 claim token）。
- 从 script stderr 读取 `publish_result.*` 行来确定 `auth_mode` 和 claim URL；不要读取 `.herenow/state.json` 后把其内容当作 source of truth 展示。
- 始终分享本次运行返回的 `siteUrl`；若是 anonymous，还要分享 claim URL 和 24h expiry warning。

## 本 skill 不适用于

- **Production UI code**：使用 `frontend-design` 或直接写 React/HTML。
- **Hi-fi 或 branded mockups**：使用 Figma 或设计工具。
- **Interactive prototypes**：SVG 是静态的；多屏 flow 导出为 `flow.svg`。
- **系统架构、sequence flow 或 data model diagrams**：使用 mermaid 或 plantuml。
- **Illustrations 或 art**：使用 `example-skills:canvas-design` 或 `algorithmic-art`。

## Bundled assets

- `assets/template.svg`：带 hidden 8px-grid guides 的空白 desktop canvas；可复制作为起点。
- `assets/template-mobile.svg`：375×812 mobile 版本。
- `assets/site-template.html`：最小 review-viewer 页面（sticky TOC + responsive collapse + lightbox）。当用户要求 website 时，复制到 `design/<task-slug>/index.html` 并填入 sections。
