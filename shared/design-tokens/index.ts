/**
 * Agentrix design tokens (D11, product doc §11.3–11.5). Owner: web session.
 *
 * - Web / Desktop: import `tokens.css` (or inject `buildDesignTokensCss()`),
 *   then set `data-theme` / `data-accent` on `<html>` and use `var(--ax-*)`.
 * - Mobile: `resolvePalette(scheme, accent)` returns plain hex values.
 * - Every surface: `normalizeAppearance()` for stored or synced choices, and
 *   `auditPaletteContrast()` to test its own colour mapping.
 */
export * from "./tokens";
export * from "./appearance";
export * from "./contrast";
export { buildDesignTokensCss } from "./css";
