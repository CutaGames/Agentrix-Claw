# Lighthouse Audit · mobile · 2026-05-16

> Base URL: `https://agentrix.top`
> Form factor: **mobile** (simulated 4G + 4× CPU slowdown)
> Tool: `lighthouse@12` headless Chrome

## GA targets

- Performance ≥ **80**
- LCP < **2.5s**
- TBT < **200ms**
- CLS < **0.1**

## Results

| Path | Perf | A11y | BP | SEO | LCP | FCP | TBT | CLS | TTI | Bytes |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `/` | 🔴 67 | 94 | 100 | 100 | 🟡 2.4s | 2.4s | 🔴 982ms | ✅ 0 | 5.8s | 1105 KB |
| `/pricing` | 🔴 61 | 98 | 100 | 100 | 🔴 4.3s | 2.4s | 🔴 719ms | ✅ 0 | 5.3s | 1101 KB |
| `/download` | 🔴 66 | 94 | 100 | 100 | ✅ 2.2s | 2.2s | 🔴 1421ms | ✅ 0 | 4.4s | 1098 KB |
| `/market` | 🔴 67 | 96 | 96 | 100 | ✅ 2.2s | 2.1s | 🔴 1083ms | ✅ 0 | 5.2s | 374 KB |
| `/market/leaderboard` | 🔴 36 | 98 | 100 | 100 | 🔴 11.1s | 3.0s | 🔴 2106ms | ✅ 0.068 | 11.1s | 1121 KB |
| `/help/desktop` | 🔴 66 | 96 | 100 | 100 | 🟡 3.1s | 2.4s | 🔴 772ms | ✅ 0 | 3.7s | 314 KB |
| `/privacy` | 🔴 64 | 100 | 100 | 100 | 🟡 3.8s | 1.8s | 🔴 678ms | ✅ 0 | 4.2s | 305 KB |
| `/terms` | ✅ 85 | 96 | 100 | 100 | 🔴 3.0s | 1.2s | 🔴 346ms | ✅ 0 | 3.0s | 294 KB |

## Summary

| Metric | Avg | Best | Worst | GA target |
|--------|:---:|:----:|:-----:|:---------:|
| Performance | **63** | 85 (`/terms`) | 36 (`/market/leaderboard`) | ≥ 80 🔴 |
| LCP | **3.9s** | 2.2s (`/download`, `/market`) | 11.1s (`/market/leaderboard`) | < 2.5s 🔴 |
| TBT | **888ms** | 346ms (`/terms`) | 2106ms (`/market/leaderboard`) | < 200ms 🔴 |
| CLS | **0.009** | 0 (most) | 0.068 (`/market/leaderboard`) | < 0.1 ✅ |
| Accessibility | **97** | 100 (`/privacy`) | 94 | – ✅ |
| SEO | **100** | – | – | – ✅ |
| Best Practices | **99** | – | 96 (`/market`) | – ✅ |

## Diagnosis (top issues across all URLs)

1. **Render-blocking JS bundles**: shared `_app` chunk ~190 KB; pages with marketing layout (`/`, `/pricing`, `/download`, `/market/leaderboard`) all push 1.1 MB total. Causes high TBT and TTI.
2. **`/market/leaderboard` 严重**：LCP 11.1s — 怀疑 client-side fetch 后才 render 顶部 hero（11s = network waterfall + JS hydrate）。需 SSR 首屏数据 or skeleton shimmer。
3. **Image delivery**: lighthouse 提示 `modern-image-formats` 可省 ~775 KB（多张 hero PNG 没切 webp/avif）。
4. **Unused JS**: 44 KB unused JS（`legacy-javascript` ~12 KB legacy polyfills 可去）。
5. **Total byte weight**: 主要营销页 1.1 MB > 推荐 1.6 MB 阈值 OK 但移动 4G 仍偏重。
6. **Long cache TTL**: `_next/static/*` 已配（CDN 默认）；非 static 资源 TTL 较短。

## Suggested fixes (estimated impact)

| Fix | Effort | Est. perf gain |
|-----|:------:|:--------------:|
| `/market/leaderboard` 改 SSR 首屏数据 | 0.5d | +30 perf |
| Hero 图全部转 webp/avif | 1d | +5-8 perf each page |
| Legacy JS 关闭（已用 babel-preset-env，砍 polyfills） | 0.5d | +5 perf |
| Hero font 用 `font-display: swap`（已用 next/font） | 已做 | – |
| Code split marketing layout | 1d | +10 TBT |

## Notes

- `/terms` is the only page hitting GA target (perf 85). Differentiator: minimal JS (just `MarketingLayout` + Tailwind prose), no charts / 3D / API fetches. Use as reference baseline.
- `/market/leaderboard` `36` 是异常值，应当作 P0 性能修复项。
- TBT 普遍超标说明 main thread JS 太重；与桌面端 `chunks/framework-ca706bf673.js` 45 KB + `chunks/main-acee8f1ecc.js` 38 KB + 各页面 chunks 综合占用相关。

## Next runs

- 应在 GA 前重跑（每次大改后），目标全部页面 perf ≥ 80
- 桌面端 form factor 一并跑：`scripts/check/run-lighthouse-batch.ps1 -FormFactor desktop`
