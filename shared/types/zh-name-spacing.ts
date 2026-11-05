/**
 * Spacing for a person's or business's name inside a Chinese sentence (L9 quality line, Q2/Q3).
 *
 * The product used to write all three of "我是 阿澜 的 AI 分身", "转给Ben" and "转给 Ben" for the same kind of
 * place. One rule now: a name that starts or ends with a Latin letter or a digit gets one space on that side
 * (so it does not stick to the Chinese characters around it); a Chinese name gets none; a side that is
 * followed by punctuation is switched off with `{ trailing: false }` / `{ leading: false }`.
 *
 * Pure function, no dependencies, safe to import from backend, web, mobile and desktop.
 */

const LATIN_OR_DIGIT = /[A-Za-z0-9\u00C0-\u024F]/;

export interface ZhNameSpacingOptionsV1 {
  /** Add the space before the name when it starts with a Latin letter or digit. Default true. */
  leading?: boolean;
  /** Add the space after the name when it ends with a Latin letter or digit. Default true. */
  trailing?: boolean;
}

export function zhNameV1(name: string | null | undefined, options: ZhNameSpacingOptionsV1 = {}): string {
  const cleaned = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : '';
  if (!cleaned) return '';
  const before = options.leading !== false && LATIN_OR_DIGIT.test(cleaned.charAt(0)) ? ' ' : '';
  const after = options.trailing !== false && LATIN_OR_DIGIT.test(cleaned.charAt(cleaned.length - 1)) ? ' ' : '';
  return `${before}${cleaned}${after}`;
}
