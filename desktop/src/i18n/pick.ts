/**
 * Inline zh/en wording for text that has two sentences side by side and no catalog key yet (polish P4).
 * Same rule as `desktopZoneLabel`: Chinese for `zh`, English for every other language. No React here, so
 * service helpers can use it; components use `useInline()` from `./inline`.
 */
export type Pick = (zh: string, en: string) => string;

export function pickFor(locale: string): Pick {
  return (zh, en) => (locale === "zh" ? zh : en);
}
