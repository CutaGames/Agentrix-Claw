/**
 * 创作封面可渲染性判定 —— 跨端单一来源（world-growth-mobile-experience task 1.1）。
 *
 * spec: .kiro/specs/world-growth-mobile-experience/{requirements,design}.md
 *   - R2.1/2.2：Quality_Gate 的 Visual_Dimension 只把「以 https:// 开头的可渲染图片
 *     URL」判为真实封面；`generated://cover/<id>@<version>` 占位句柄、空串、http://
 *     一律不算真封面。
 *
 * 背景（根因）：生产 build 497 种子的 `preview.url` 是占位句柄
 * `generated://cover/<id>@<version>`（Cover_Handle），非真实图片 URL，导致 Feed 卡片黑屏；
 * 而旧口径 `previewIsPlaceholder = (coverUrl.length === 0)` 把非空的 `generated://`
 * 句柄误判为「有真封面」。本函数收敛为**唯一口径**，供以下三处一致引用、避免口径漂移：
 *   1. 后端质量门 `RuleBasedQualityCriterion.evalVisual`（task 1.2）；
 *   2. 后端 `model-generation.provider.ts` 的 `buildPreview`、
 *      `creation-template-baseline.service.ts` 的 `buildSampleInput`（previewIsPlaceholder）
 *      与 Cover_Backfill；
 *   3. 移动端 `services/creationFeed.ts` 的封面三态判定与验收指标 Renderable_Cover_Rate。
 *
 * 设计约束：**纯字符串检查、零依赖**，可同时被后端（NestJS）与移动端（RN）导入。
 */

/**
 * 判定一个封面 URL 是否可被 `<Image>` 直接渲染（Real_Cover_Image）。
 *
 * 规则：当且仅当 `url` 是**非空字符串**且以 `https://` 开头时返回 true。
 * 显式为 false 的情形：`generated://` 占位句柄、空串、`http://`、以及任何非字符串
 * （null / undefined / number / object 等）。
 *
 * 说明：`generated://` 句柄天然不以 `https://` 开头，故 `https://` 前缀检查即可覆盖；
 * 无需额外的 `generated://` 特判（保留在文档口径中以示意图）。
 *
 * @param url 待判定的封面 URL（可能为空 / 占位句柄 / 非字符串）。
 * @returns 可渲染的 Real_Cover_Image URL ⇒ true；否则 false。
 */
export function isRenderableCover(url: string | null | undefined): boolean {
  return typeof url === 'string' && /^https:\/\//.test(url);
}
