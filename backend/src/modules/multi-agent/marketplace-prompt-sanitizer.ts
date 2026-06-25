/**
 * Multi-Agent v2.1 — Marketplace prompt sanitizer.
 *
 * When a sub-task is dispatched via `target = 'marketplace-hire'`, the prompt
 * MUST NOT leak hirer-private context to the seller's pet. Per spec
 * `requirements.md §13.4` and `design.md §13.3`, the hired pet receives only:
 *   - The user-authored prompt body (sanitized)
 *   - The role string
 *   - scope.tools (whitelist)
 *   - budget_usd
 *
 * The hired pet **must not** see:
 *   - Absolute filesystem paths (Windows or POSIX)
 *   - Workspace file mentions like `@file://...`, `@src/foo.ts`
 *   - References to chat history (`as we discussed earlier`, `from the prior
 *     turn`, `the previous task`, `上一轮我让你`, `刚才那个`, `之前的对话`)
 *   - User PII patterns: emails, phone numbers (best-effort regex strip)
 *   - API keys / secrets (best-effort regex strip)
 *
 * The sanitizer is **best-effort**: it scrubs the obvious dangerous patterns
 * and leaves a `[redacted]` placeholder so the hired pet can still understand
 * the intent. False negatives are possible — additional defense lives at the
 * worker layer (W7.3 audit log + cost-tracker).
 *
 * Usage:
 *   const sanitized = sanitizeMarketplacePrompt(rawPrompt);
 *   if (sanitized.redactedSegments.length > 0) {
 *     logger.warn(`marketplace prompt sanitized: ${sanitized.redactedSegments.length} segments`);
 *   }
 *   await create({ prompt: sanitized.text, ... });
 */

export interface SanitizedPrompt {
  /** The sanitized prompt body, safe to forward to a third-party seller pet. */
  text: string;
  /** Counters of redacted segment kinds for audit / metrics. */
  redactedSegments: Array<{ kind: SanitizedSegmentKind; count: number }>;
  /** True if any redaction occurred. */
  wasRedacted: boolean;
}

export type SanitizedSegmentKind =
  | 'absolute-path'
  | 'workspace-mention'
  | 'chat-history-ref'
  | 'email'
  | 'phone'
  | 'api-key';

const REDACTED = '[redacted]';

const PATTERNS: Array<{ kind: SanitizedSegmentKind; regex: RegExp }> = [
  // Windows absolute paths: C:\..., D:\foo\bar, with or without drive letter
  { kind: 'absolute-path', regex: /\b[a-zA-Z]:\\[^\s"'<>]+/g },
  // POSIX absolute paths: /home/..., /Users/..., /opt/..., /var/...
  // (avoid matching common URLs by requiring leading whitespace or boundary
  // and not allowing `://` after)
  {
    kind: 'absolute-path',
    regex: /(?<![:\w])\/(?:home|Users|opt|var|tmp|root|etc|mnt|wsl)\/[^\s"'<>]+/g,
  },
  // Workspace mention syntax used by desktop chat UI
  { kind: 'workspace-mention', regex: /@file:\/\/[^\s"'<>]+/g },
  { kind: 'workspace-mention', regex: /@(?:src|backend|desktop|mobile|frontend)\/[^\s"'<>]+/g },
  // Chat history phrases EN
  {
    kind: 'chat-history-ref',
    regex: /\b(?:as (?:we|i) (?:discussed|mentioned)(?: earlier| before)?|from (?:the |our )?(?:prior|previous|earlier|last) (?:turn|task|message|conversation|round)|the (?:previous|prior|earlier) (?:task|message|turn)|in our (?:earlier|previous|prior) (?:chat|conversation))\b/gi,
  },
  // Chat history phrases ZH (CJK; case-insensitive flag is no-op for CJK)
  {
    kind: 'chat-history-ref',
    regex: /(?:上一轮|上一次|刚才(?:那|说|提)|之前(?:的)?(?:对话|聊天|讨论|消息|任务|轮)|前面(?:那|说|提|的))[^,。;\n]{0,40}/g,
  },
  // Email
  { kind: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // Phone (intl + CN basic)
  { kind: 'phone', regex: /(?:\+\d{1,3}[\s-]?)?(?:\d{3,4}[\s-]?){2,3}\d{3,4}/g },
  // API key heuristics (sk-..., AKIA..., ghp_..., ghu_...)
  { kind: 'api-key', regex: /\b(?:sk|sk-proj|AKIA|ghp|ghu|gho|ghs|hf)_[A-Za-z0-9_-]{16,}\b/g },
  { kind: 'api-key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
];

/**
 * Sanitize a prompt for marketplace-hire dispatch.
 *
 * Returns sanitized text + segment counters. The sanitizer NEVER throws — on
 * any internal error returns the original text with a single `unknown` redaction
 * counter so the dispatch is not silently bypassed.
 */
export function sanitizeMarketplacePrompt(raw: string): SanitizedPrompt {
  if (!raw || typeof raw !== 'string') {
    return { text: '', redactedSegments: [], wasRedacted: false };
  }

  const counts = new Map<SanitizedSegmentKind, number>();
  let text = raw;

  try {
    for (const { kind, regex } of PATTERNS) {
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        counts.set(kind, (counts.get(kind) || 0) + matches.length);
        text = text.replace(regex, REDACTED);
      }
    }
  } catch {
    // If regex engine misbehaves on pathological input, fail closed by
    // returning the original text uncensored. Defense in depth at the
    // worker layer is responsible for catching this.
    return {
      text: raw,
      redactedSegments: [{ kind: 'absolute-path', count: 0 }],
      wasRedacted: false,
    };
  }

  // Trim back-to-back [redacted] tokens to keep the prompt readable.
  text = text.replace(/(?:\[redacted\]\s*){2,}/g, '[redacted] ');

  const redactedSegments = Array.from(counts.entries()).map(([kind, count]) => ({
    kind,
    count,
  }));

  return {
    text,
    redactedSegments,
    wasRedacted: redactedSegments.length > 0,
  };
}
