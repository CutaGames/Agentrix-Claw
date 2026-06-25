/**
 * Static_Code_Scan — Tier_C 逻辑模块静态代码扫描 + 字节码 hash 锁定
 * (design §10.2 / §3.3, R10.2/R10.3, task 21.1).
 *
 * Tier_C 体验可携带 Turing-complete 的 JS/WASM 逻辑模块 (`logicModuleRef`)，
 * 因此在 v5 5 阶段审核之外，发布前必须额外对每个逻辑模块的源码运行静态扫描，
 * 拦截四类高危模式 (design §10.2 检查项)：
 *
 *   ① **能力滥用 (capability_abuse)**：源码调用了未在模块 `capabilities` 中声明的
 *      World_API 能力 (deny-by-default 的静态对偶；运行时由 dispatchCapability 兜底)。
 *   ② **混淆 / 动态求值 (dynamic_eval)**：`eval(...)`、`new Function(...)`、
 *      `.constructor.constructor(...)`、字符串化定时器等可在审核后注入任意代码的构造。
 *   ③ **资源炸弹 (resource_bomb)**：`while(true)` / `for(;;)` 死循环、超大循环边界、
 *      超大内存分配 (`new Array(1e9)`、`.repeat(huge)`、`Buffer.alloc(huge)` 等)。
 *   ④ **出网白名单外 (egress_violation)**：源码内出现非 https 或 host 不在出网白名单的
 *      URL 字面量 (与 NetFetchProxy 的 host 白名单语义一致：精确 host 或 `*.example.com`)。
 *
 * 扫描产出结构化结果 (违规类型 + 行/列 + 原因)，供 {@link PlotModerationService}
 * 在 `static_code_scan` 阶段阻断发布并报具体阶段与原因 (R10.3)。
 *
 * **hash 锁定 (design §3.3 "hash 锁定审核过的字节码，运行时校验防止发布后替换")**：
 *   - {@link computeModuleHash} 对审核过的源码算 `sha256:<hex>` 作为锁定 hash。
 *   - {@link verifyHash} 在运行时 / 发布前重算并与锁定 hash 比对，源码被替换即失败。
 *
 * 全部为**纯函数** (无 IO / 无副作用 / 无单例状态)，便于 task 21.2 单元测试直接驱动。
 * 全部标识符使用 camelCase。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §10 审核 / §3.3 Tier_C 逻辑模块
 */

import { createHash } from 'crypto';
import {
  WorldApiCapability,
  type WorldCreationError,
} from '../../../../shared/types/world-creation';

// ============================================================
// §1 Result model
// ============================================================

/** The four high-risk categories a Tier_C logic module is scanned for (§10.2). */
export type ScanViolationCategory =
  /** ① Calling a World_API capability not declared in the module's `capabilities`. */
  | 'capability_abuse'
  /** ② Obfuscation / dynamic code evaluation (eval / Function constructor / ...). */
  | 'dynamic_eval'
  /** ③ Resource bomb: infinite/oversized loops or oversized memory allocation. */
  | 'resource_bomb'
  /** ④ Egress to a non-https target or a host outside the egress allowlist. */
  | 'egress_violation';

/** A single static-scan finding with its location and a human-readable reason. */
export interface ScanViolation {
  /** The violation category (§10.2 ①–④). */
  category: ScanViolationCategory;
  /** Human-readable explanation of the violating construct. */
  reason: string;
  /** 1-based line number the violation was found on. */
  line: number;
  /** 1-based column number (best-effort) the match started at. */
  column: number;
  /** The trimmed source snippet that triggered the finding (capped). */
  snippet: string;
}

/** Structured result of {@link scanLogicModule}. */
export interface ScanResult {
  /** True iff no violations were found. */
  passed: boolean;
  /** All findings, in source order. Empty when `passed` is true. */
  violations: ScanViolation[];
}

/** Options controlling a single module scan. */
export interface ScanOptions {
  /**
   * Egress host allowlist for the ④ egress check. Entries may be an exact host
   * (`api.example.com`) or a single subdomain wildcard (`*.example.com`, which
   * also matches the bare apex). Empty ⇒ any egress URL literal is a violation.
   */
  egressAllowedHosts?: ReadonlyArray<string>;
  /**
   * Loop-bound / allocation-size threshold for the ③ resource-bomb check. A
   * numeric literal at or above this value used in a loop bound or allocation is
   * flagged. Defaults to {@link DEFAULT_RESOURCE_BOMB_THRESHOLD}.
   */
  resourceBombThreshold?: number;
}

/** Default numeric threshold above which loop bounds / allocations are flagged. */
export const DEFAULT_RESOURCE_BOMB_THRESHOLD = 1_000_000;

/** Max characters of a source snippet retained on a {@link ScanViolation}. */
const MAX_SNIPPET_LENGTH = 120;

// ============================================================
// §2 Capability whitelist tokens (single source of truth = the enum)
// ============================================================

/** All World_API capability tokens (mirrors the shared enum). */
const ALL_CAPABILITY_TOKENS: ReadonlyArray<string> = Object.values(WorldApiCapability);

/**
 * Whether a granted/whitelist `token` matches a concrete `requested` capability.
 * Wildcard-aware (`ui.*` authorizes `ui.toast`), mirroring the runtime registry.
 */
function capabilityMatches(token: string, requested: string): boolean {
  if (token === requested) {
    return true;
  }
  if (token.endsWith('.*')) {
    const prefix = token.slice(0, -2); // "ui.*" -> "ui"
    return requested === prefix || requested.startsWith(`${prefix}.`);
  }
  return false;
}

/**
 * Build the set of concrete capability detector regexes from the enum. For a
 * wildcard token (`ui.*`) we detect any `ui.<ident>` member/string reference; for
 * a concrete token (`scene.spawn`) we detect that exact dotted path.
 */
interface CapabilityDetector {
  /** The capability token as declared in the whitelist (may be a wildcard). */
  token: string;
  /** Regex (global) matching uses of this capability in source. */
  pattern: RegExp;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCapabilityDetectors(): CapabilityDetector[] {
  return ALL_CAPABILITY_TOKENS.map((token) => {
    if (token.endsWith('.*')) {
      const prefix = escapeRegExp(token.slice(0, -2)); // "ui.*" -> "ui"
      // Match `ui.toast`, "ui.toast", 'ui.panel' — any dotted sub-capability.
      return { token, pattern: new RegExp(`\\b${prefix}\\.[A-Za-z_$][\\w$]*`, 'g') };
    }
    // Concrete dotted path, e.g. scene.spawn / economy.requestCharge / net.fetch.
    return { token, pattern: new RegExp(`\\b${escapeRegExp(token)}\\b`, 'g') };
  });
}

const CAPABILITY_DETECTORS = buildCapabilityDetectors();

// ============================================================
// §3 Pattern detectors (②③④)
// ============================================================

/** ② Dynamic-eval / obfuscation constructs. */
const DYNAMIC_EVAL_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\beval\s*\(/g, reason: 'direct eval() call' },
  { pattern: /\bnew\s+Function\s*\(/g, reason: 'Function constructor (new Function(...))' },
  { pattern: /(?<![.\w])Function\s*\(\s*["'`]/g, reason: 'Function constructor invoked with a code string' },
  { pattern: /\.constructor\s*\.\s*constructor\b/g, reason: 'constructor.constructor sandbox-escape trick' },
  { pattern: /\b(setTimeout|setInterval)\s*\(\s*["'`]/g, reason: 'string-argument timer (implicit eval)' },
  { pattern: /\bimport\s*\(/g, reason: 'dynamic import()' },
  { pattern: /\b(globalThis|window|self)\s*\[\s*["'`]eval["'`]\s*\]/g, reason: 'obfuscated indirect eval access' },
];

/** ③ Resource-bomb constructs (infinite loops). */
const INFINITE_LOOP_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bwhile\s*\(\s*(true|1)\s*\)/g, reason: 'infinite while loop (while(true))' },
  { pattern: /\bfor\s*\(\s*;\s*;\s*\)/g, reason: 'infinite for loop (for(;;))' },
  { pattern: /\bdo\s*\{[\s\S]*?\}\s*while\s*\(\s*(true|1)\s*\)/g, reason: 'infinite do/while loop' },
];

/**
 * ③ Oversized allocation constructs — the capturing group holds the size
 * expression evaluated against the resource-bomb threshold.
 */
const ALLOCATION_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bnew\s+Array\s*\(\s*([\d_.eE+]+)\s*\)/g, reason: 'oversized Array allocation' },
  { pattern: /(?<!\.)\bArray\s*\(\s*([\d_.eE+]+)\s*\)/g, reason: 'oversized Array allocation' },
  { pattern: /\bnew\s+(?:Uint8|Uint16|Uint32|Int8|Int16|Int32|Float32|Float64)Array\s*\(\s*([\d_.eE+]+)\s*\)/g, reason: 'oversized TypedArray allocation' },
  { pattern: /\bnew\s+ArrayBuffer\s*\(\s*([\d_.eE+]+)\s*\)/g, reason: 'oversized ArrayBuffer allocation' },
  { pattern: /\bBuffer\s*\.\s*alloc(?:Unsafe)?\s*\(\s*([\d_.eE+]+)\s*\)/g, reason: 'oversized Buffer allocation' },
  { pattern: /\.repeat\s*\(\s*([\d_.eE+]+)\s*\)/g, reason: 'oversized String.repeat()' },
];

/** ③ Oversized numeric loop bound, e.g. `for (let i = 0; i < 1e12; i++)`. */
const LOOP_BOUND_PATTERN = /\bfor\s*\([^;]*;[^;<>]*[<>]=?\s*([\d_.eE+]+)\s*;/g;

/** ④ URL literals — http(s):// followed by a host. */
const URL_PATTERN = /\bhttps?:\/\/([^\s/"'`\\)]+)/gi;

// ============================================================
// §4 Numeric parsing
// ============================================================

/** Parse a numeric literal that may use `_` separators or `e` notation. */
function parseNumericLiteral(raw: string): number {
  const cleaned = raw.replace(/_/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
}

// ============================================================
// §5 Host allowlist matching (mirrors NetFetchProxy.isHostAllowed)
// ============================================================

/** Whether `host` matches an exact or `*.`-wildcard allowlist entry. */
function isHostAllowed(host: string, allowedHosts: ReadonlyArray<string>): boolean {
  const lower = host.toLowerCase();
  return allowedHosts.some((entry) => {
    const e = entry.toLowerCase();
    if (e === lower) {
      return true;
    }
    if (e.startsWith('*.')) {
      const baseDomain = e.slice(2);
      return lower === baseDomain || lower.endsWith(`.${baseDomain}`);
    }
    return false;
  });
}

// ============================================================
// §6 Line-offset helper for location reporting
// ============================================================

/** Precomputed line start offsets used to map a char index → {line, column}. */
function buildLineIndex(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) {
      starts.push(i + 1);
    }
  }
  return starts;
}

/** Map a 0-based character index to a 1-based {line, column} using line starts. */
function locate(starts: number[], index: number): { line: number; column: number } {
  // Binary search for the greatest line start <= index.
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return { line: lo + 1, column: index - starts[lo] + 1 };
}

/** Extract a trimmed, length-capped snippet around a char index. */
function snippetAt(source: string, starts: number[], index: number): string {
  const lineNo = locate(starts, index).line;
  const start = starts[lineNo - 1];
  const end = lineNo < starts.length ? starts[lineNo] : source.length;
  return source.slice(start, end).trim().slice(0, MAX_SNIPPET_LENGTH);
}

// ============================================================
// §7 Comment/string stripping (reduce false positives)
// ============================================================

/**
 * Replace line/block comment bodies with spaces (preserving newlines + length)
 * so detectors don't fire on commented-out or documentation text. String
 * literals are intentionally preserved — capability tokens and URLs frequently
 * appear as string arguments and must still be scanned.
 */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  let inString: string | null = null;

  while (i < n) {
    const ch = source[i];
    const next = i + 1 < n ? source[i + 1] : '';

    if (inString) {
      out += ch;
      if (ch === '\\') {
        // Preserve the escaped char verbatim.
        if (i + 1 < n) {
          out += source[i + 1];
          i += 2;
          continue;
        }
      } else if (ch === inString) {
        inString = null;
      }
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      // Line comment → blank out until newline.
      while (i < n && source[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      // Block comment → blank out (keep newlines) until */.
      out += '  ';
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < n) {
        out += '  ';
        i += 2;
      }
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

// ============================================================
// §8 scanLogicModule — the four-category static scan (R10.2)
// ============================================================

/**
 * Statically scan a Tier_C logic module's source for the four high-risk
 * categories (§10.2). Pure: same `(source, declaredCaps, options)` always
 * yields the same {@link ScanResult}.
 *
 * @param source       the logic module source (JS/TS text)
 * @param declaredCaps the capability subset declared by the module
 *                     ({@link WorldApiCapability}[] from `logicModuleRef.capabilities`)
 * @param options      egress allowlist + resource-bomb threshold
 * @returns a structured {@link ScanResult} listing every violation (in source order)
 */
export function scanLogicModule(
  source: string,
  declaredCaps: ReadonlyArray<WorldApiCapability | string>,
  options: ScanOptions = {},
): ScanResult {
  const violations: ScanViolation[] = [];
  if (typeof source !== 'string' || source.length === 0) {
    return { passed: true, violations };
  }

  const scanned = stripComments(source);
  const starts = buildLineIndex(scanned);
  const granted = declaredCaps.map((c) => String(c));
  const allowedHosts = options.egressAllowedHosts ?? [];
  const threshold = options.resourceBombThreshold ?? DEFAULT_RESOURCE_BOMB_THRESHOLD;

  const push = (
    category: ScanViolationCategory,
    reason: string,
    index: number,
  ): void => {
    const { line, column } = locate(starts, index);
    violations.push({
      category,
      reason,
      line,
      column,
      snippet: snippetAt(scanned, starts, index),
    });
  };

  // ── ① capability_abuse: a recognized capability used but not granted. ──
  // De-duplicate per (capability, index) so wildcard + concrete detectors don't
  // double-report the same site.
  const seenCapSites = new Set<string>();
  for (const detector of CAPABILITY_DETECTORS) {
    detector.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = detector.pattern.exec(scanned)) !== null) {
      const used = m[0].replace(/^['"`]/, '');
      const isGranted = granted.some((g) => capabilityMatches(g, used));
      if (!isGranted) {
        const key = `${used}@${m.index}`;
        if (!seenCapSites.has(key)) {
          seenCapSites.add(key);
          push(
            'capability_abuse',
            `uses undeclared World_API capability "${used}" (not in module capabilities)`,
            m.index,
          );
        }
      }
    }
  }

  // ── ② dynamic_eval: eval / Function constructor / obfuscation. ──
  for (const { pattern, reason } of DYNAMIC_EVAL_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(scanned)) !== null) {
      push('dynamic_eval', reason, m.index);
    }
  }

  // ── ③ resource_bomb: infinite loops + oversized loop bounds/allocations. ──
  for (const { pattern, reason } of INFINITE_LOOP_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(scanned)) !== null) {
      push('resource_bomb', reason, m.index);
    }
  }
  for (const { pattern, reason } of ALLOCATION_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(scanned)) !== null) {
      const size = parseNumericLiteral(m[1]);
      if (Number.isFinite(size) && size >= threshold) {
        push(
          'resource_bomb',
          `${reason} (size ${m[1]} ≥ threshold ${threshold})`,
          m.index,
        );
      }
    }
  }
  LOOP_BOUND_PATTERN.lastIndex = 0;
  {
    let m: RegExpExecArray | null;
    while ((m = LOOP_BOUND_PATTERN.exec(scanned)) !== null) {
      const bound = parseNumericLiteral(m[1]);
      if (Number.isFinite(bound) && bound >= threshold) {
        push(
          'resource_bomb',
          `oversized loop bound (${m[1]} ≥ threshold ${threshold})`,
          m.index,
        );
      }
    }
  }

  // ── ④ egress_violation: non-https or host outside the allowlist. ──
  URL_PATTERN.lastIndex = 0;
  {
    let m: RegExpExecArray | null;
    while ((m = URL_PATTERN.exec(scanned)) !== null) {
      const full = m[0];
      const host = (m[1] ?? '').split(/[:/?#]/)[0].toLowerCase();
      const isHttps = /^https:/i.test(full);
      if (!isHttps) {
        push(
          'egress_violation',
          `non-https egress target "${full}" (only https is permitted)`,
          m.index,
        );
      } else if (!isHostAllowed(host, allowedHosts)) {
        push(
          'egress_violation',
          `egress target host "${host}" is not in the egress allowlist`,
          m.index,
        );
      }
    }
  }

  // Stable ordering by source position for deterministic, readable output.
  violations.sort((a, b) =>
    a.line !== b.line ? a.line - b.line : a.column - b.column,
  );

  return { passed: violations.length === 0, violations };
}

// ============================================================
// §9 Bytecode hash locking (design §3.3)
// ============================================================

/** Prefix for the content hash used to lock reviewed module bytecode. */
export const MODULE_HASH_PREFIX = 'sha256:';

/**
 * Compute the locking hash for a reviewed logic module source: `sha256:<hex>`.
 * Stored on `logicModuleRef.hash` once a module passes static scan, then
 * re-verified at publish / runtime to prevent post-publish replacement.
 */
export function computeModuleHash(source: string): string {
  const hex = createHash('sha256').update(source ?? '', 'utf8').digest('hex');
  return `${MODULE_HASH_PREFIX}${hex}`;
}

/**
 * Verify `source` matches the `lockedHash` recorded at review time (design §3.3).
 * Accepts a locked hash with or without the `sha256:` prefix. Returns false on
 * any mismatch or malformed input — the caller blocks the publish/run.
 */
export function verifyHash(source: string, lockedHash: string): boolean {
  if (typeof lockedHash !== 'string' || lockedHash.length === 0) {
    return false;
  }
  const actual = computeModuleHash(source);
  const expected = lockedHash.startsWith(MODULE_HASH_PREFIX)
    ? lockedHash
    : `${MODULE_HASH_PREFIX}${lockedHash}`;
  // Length-equal constant-time-ish comparison.
  if (actual.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================
// §10 Convenience: structured rejection error
// ============================================================

/**
 * Build a structured MODERATION_REJECTED error from a failed scan, embedding the
 * `static_code_scan` stage + the first violation's category/reason/location
 * (R10.3 "report the specific stage and reason").
 */
export function toModerationError(
  moduleId: string,
  result: ScanResult,
): WorldCreationError {
  const v = result.violations[0];
  const detail = v
    ? `[static_code_scan] logic module "${moduleId}": [${v.category}] ${v.reason} (line ${v.line}:${v.column})`
    : `[static_code_scan] logic module "${moduleId}": scan failed`;
  return { error: 'MODERATION_REJECTED', detail };
}
