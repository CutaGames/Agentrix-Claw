import { useI18n } from "../lib/i18n/I18nProvider";
import { LOCALES, LOCALE_LABELS, type Locale } from "../lib/i18n/strings";

export function I18nLanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <select
      aria-label="Language"
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className={
        className ||
        "rounded-md border border-agentrix-inkLine bg-transparent px-2 py-1 text-xs text-agentrix-inkSoft hover:text-agentrix-ink focus:outline-none"
      }
    >
      {LOCALES.map((code) => (
        <option key={code} value={code}>
          {LOCALE_LABELS[code]}
        </option>
      ))}
    </select>
  );
}
