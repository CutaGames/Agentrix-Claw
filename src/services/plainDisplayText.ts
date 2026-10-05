/**
 * Text written by other people (payee names, chat names, messages from Telegram / WhatsApp) shown on the phone.
 * React Native `Text` renders no markup, but control, zero-width and bidirectional characters can still make a
 * name read like something else ("refund to you" reversed). Both helpers remove them; nothing becomes a link.
 */

// C0 / C1 controls, zero-width marks, LRM / RLM, line and paragraph separators, LRE…RLO, word joiner…isolates, BOM.
const UNSAFE_LINE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
// The same, but a message keeps its line breaks.
const UNSAFE_TEXT = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

/** One line: unsafe characters removed, whitespace collapsed, cut to `max`; empty → `fallback`. */
export function plainDisplayLine(value: unknown, max: number, fallback: string): string {
  const cleaned = String(value ?? '').replace(UNSAFE_LINE, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return cleaned || fallback;
}

/** A message body: unsafe characters removed, at most two blank lines in a row, cut to `max`. */
export function plainDisplayText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(UNSAFE_TEXT, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}
