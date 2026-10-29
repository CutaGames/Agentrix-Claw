/** Hook for components: `const p = useInline(); p("中文", "English")`. The Chinese is the source wording. */
import { useI18n } from "./I18nProvider";
import { pickFor, type Pick } from "./pick";

export type { Pick } from "./pick";

export function useInline(): Pick {
  const { locale } = useI18n();
  return pickFor(locale);
}
