/**
 * L8 2nd batch, data lane 0b: the one sentence an owner reads for a memory proposal.
 *
 * A proposal's text used to be `<key>: <JSON of the value>` (`user_decision_1792…: {"decision":…}`), which shows the
 * owner an internal key and raw JSON. The server now builds the sentence from the value alone; `memoryProposalReadableText`
 * also cleans up rows that were stored in the old shape, so the three surfaces show the same readable line for both.
 * No React, no platform import, no I/O.
 */

/** Value fields that hold the sentence, best first. */
const SENTENCE_FIELDS = ['text', 'content', 'decision', 'summary', 'statement', 'preference', 'fact', 'note', 'description', 'title', 'value'] as const;
const JOIN = '；';
const MAX_PARTS = 6;

function plain(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** A readable line for a stored memory value: a known sentence field first, else the plain values without their keys. Empty when there is nothing readable. */
export function memoryValueToText(value: unknown, depth = 0): string {
  const direct = plain(value);
  if (direct) return direct;
  if (depth > 2 || value === null || typeof value !== 'object') return '';
  if (Array.isArray(value)) {
    return value.slice(0, MAX_PARTS).map((item) => memoryValueToText(item, depth + 1)).filter(Boolean).join(JOIN);
  }
  const record = value as Record<string, unknown>;
  for (const field of SENTENCE_FIELDS) {
    const text = plain(record[field]);
    if (text) return text;
  }
  const parts: string[] = [];
  for (const entry of Object.values(record)) {
    const text = plain(entry);
    if (text) parts.push(text);
    if (parts.length >= MAX_PARTS) break;
  }
  return parts.join(JOIN);
}

const KEYED_TEXT = /^([A-Za-z0-9][A-Za-z0-9._:-]{0,199}): ([\s\S]+)$/;

/**
 * Text stored in the old `<key>: <value>` shape becomes the value alone. Ordinary sentences are left as they are:
 * the key has to look like an identifier (underscore, dot or digit) or the rest has to be JSON.
 */
export function memoryProposalReadableText(text: string): string {
  const match = KEYED_TEXT.exec(text.trim());
  if (!match) return text;
  const [, key, rest] = match;
  const jsonLike = rest.startsWith('{') || rest.startsWith('[');
  if (!jsonLike && !/[_.0-9]/.test(key)) return text;
  if (jsonLike) {
    try {
      const readable = memoryValueToText(JSON.parse(rest));
      if (readable) return readable;
    } catch {
      // clipped JSON (the old text was cut at a length limit): keep the rest as it is, without the key
    }
  }
  return rest;
}
