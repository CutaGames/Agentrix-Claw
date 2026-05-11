/**
 * Marketing sections  barrel module.
 *
 * Historical layout: a single 1000+ line `sections.tsx` mega-file.
 * Refactored (audit P3.1) into one file per section under `./sections/`.
 *
 * This stub preserves the legacy import path
 *   `'../components/marketing/sections'`
 * for existing consumers (`pages/index.tsx`, `pages/pricing.tsx`,
 * `pages/manifesto.tsx`, `pages/features.tsx`). New code should import
 * directly from `'./sections'` (resolves to `./sections/index.ts`).
 */
export * from './sections/index';
