# Grid、palette 和 type scale

以下是唯一允许使用的值。不要引入新的颜色、尺寸或 grid units。

## Canvas presets

| Viewport | Width x Height | 用途 |
| -------- | -------------- | ---- |
| Desktop  | 1280 x 800     | Web app screen 默认值 |
| Wide     | 1440 x 900     | Marketing landing page |
| Tablet   | 768 x 1024     | iPad-class screen |
| Mobile   | 375 x 812      | iPhone-class screen |

始终包含与 canvas 匹配的 `viewBox="0 0 W H"`，方便嵌入后缩放。

## Grid

- Base unit：**8px**。所有 `x`、`y`、`width`、`height` 值必须是 8 的倍数。
- Outer page margin：desktop/tablet 为 **24px**，mobile 为 **16px**。
- Column gutter：desktop 为 **24px**，mobile 为 **16px**。
- Vertical rhythm：同级组件间距 **24px**。

### Desktop 12-column grid

- Total width：1280
- Outer margin（每侧）：48
- Inner content width：1184
- Column width：88，gutter 8 -> 12 x (88 + 8) - 8 = 1144 + 40 = 1184

实践中优先吸附到常见宽度：

- Sidebar：240
- Content max：944（扣除 sidebar 后）
- Card grid：3 x 384 + 24 gutters，或 4 x 280 + 24 gutters
- Modal width：480（small）、640（default）、800（wide）

### Mobile single column

- Total width：375
- Outer margin：每侧 16 -> content 343
- Tap targets：最小高度 44（吸附到 48）

## Palette（唯一允许颜色）

| Name             | Hex        | 用途 |
| ---------------- | ---------- | ---- |
| Ink              | `#000`     | Strokes、primary text |
| Paper            | `#fff`     | 默认 fill |
| Mute text        | `#666`     | inputs 内 placeholder text、secondary labels |
| Placeholder grey | `#e6e6e6`  | Image/avatar/empty-state regions |
| Subtle grey      | `#f4f4f4`  | table zebra rows 可选；除此之外不用 |
| Annotation red   | `#d33`     | 仅 annotation layer：dashed borders、callout numbers |

这就是完整 palette。不要 hover states、focus rings 或 brand colours。

## Type scale

单一字体：`font-family="-apple-system, system-ui, sans-serif"`。

| Role     | Size | Weight | 用途 |
| -------- | ---- | ------ | ---- |
| Caption  | 12   | 400    | Help text、metadata、table footnotes |
| Body     | 14   | 400    | 默认 text、button labels、list rows |
| Heading  | 20   | 600    | Section headings、card titles |
| Title    | 28   | 700    | Page title（每个 screen 一个） |

除 size 外，只允许用 font-weight 做 typographic variation。不要 italics，不要 underline（links 除外，见下）。

### Link convention

文本 link 使用 body 14，并加 `text-decoration="underline"`。不要改变颜色。

### Strokes on text

始终在 `<text>` elements 上设置 `stroke="none"`。wireframe SVG 会在 `<svg>` root 给 boxes 设置默认 stroke；text 会继承它并出现不需要的 halo。

## 标准组件尺寸

这些尺寸非常常见，应记住。

| Component         | Size (W x H) |
| ----------------- | ------------ |
| Button (default)  | 120 x 40 |
| Button (small)    | 80 x 32 |
| Button (icon)     | 40 x 40 |
| Text input        | 320 x 40 |
| Text input (full) | 100% x 40 |
| Search input      | 480 x 40 |
| Dropdown          | 200 x 40 |
| Checkbox / radio  | 20 x 20 |
| Avatar (small)    | 32 x 32 circle |
| Avatar (medium)   | 48 x 48 circle |
| Navbar            | 100% x 64 |
| Tab               | (auto) x 48 |
| List row          | 100% x 56 |
| Table row         | 100% x 48 |
| Card padding      | 24 inside |
| Modal             | 480 / 640 / 800 wide，height auto |

## 坐标约定

- 将每个 primitive 放进 `<g transform="translate(x, y)">`，使其内部坐标从 `(0, 0)` 开始。这样 primitives 可跨 screen 复制。
- 每个 primitive 上方写 comment：`<!-- 1: nav -->`、`<!-- 2: search -->`，与 SVG 下方 annotation list 对齐。
- 相关 primitives 放到带 `data-region="..."` attribute 的 parent `<g>` 下，方便搜索。

## Negative space

空白也是设计的一部分。不要填满 canvas。如果 screen 意图就是 viewport 中央一个 card，那么这也是有效 wireframe。
