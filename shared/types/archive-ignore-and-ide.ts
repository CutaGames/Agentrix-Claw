/**
 * Developer-archive ignore rules and IDE manifests (G-12).
 *
 * Used by the browser packer and the backend scanner / parser so a repository
 * ZIP applies the same deny list: skip `node_modules`, `.env`, key material;
 * keep ignore files and IDE manifests as knowledge, never as persona.
 */

export const ARCHIVE_PARSEABLE_ENTRY_MAX_BYTES = 4 * 1024 * 1024;
export const ARCHIVE_ENGINEERING_BODY_MAX_CHARS = 8000;

export const IGNORE_RULE_FILE_NAMES = new Set([
  '.gitignore',
  '.cursorignore',
  '.eslintignore',
  '.prettierignore',
  '.dockerignore',
  '.npmignore',
  '.vercelignore',
  '.easignore',
  '.agentrixignore',
]);

/** Always denied, even when the ZIP has no ignore file. */
export const DEFAULT_ARCHIVE_DENY_PATTERNS = [
  'node_modules/',
  '.git/',
  '.svn/',
  '.hg/',
  'dist/',
  'build/',
  'coverage/',
  '.next/',
  '.turbo/',
  'vendor/',
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  '*.keystore',
  '.DS_Store',
  'Thumbs.db',
] as const;

export type ProfessionalEngineeringKindV1 = 'ignore_rules' | 'ide_manifest';

export interface ArchiveIgnoreRuleV1 {
  pattern: string;
  negated: boolean;
  directoryOnly: boolean;
  /** Pattern starts with `/` — match from the ignore file's directory. */
  anchored: boolean;
  /** Directory that contained the ignore file, no trailing slash. */
  baseDir: string;
}

export function normalizeArchivePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
}

export function archivePathBaseName(path: string): string {
  const parts = normalizeArchivePath(path).split('/').filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? '';
}

export function archivePathDirName(path: string): string {
  const parts = normalizeArchivePath(path).split('/').filter((part) => part.length > 0);
  parts.pop();
  return parts.join('/');
}

export function looksLikeIgnoreRulesPath(path: string): boolean {
  const base = archivePathBaseName(path).toLowerCase();
  if (IGNORE_RULE_FILE_NAMES.has(base)) return true;
  return base.startsWith('.') && base.endsWith('ignore');
}

export function looksLikeIdeManifestPath(path: string): boolean {
  const lower = normalizeArchivePath(path).toLowerCase();
  return (
    /(^|\/)\.vscode\/(extensions|settings)\.json$/.test(lower) ||
    /(^|\/)\.cursor\/extensions\.json$/.test(lower) ||
    /\.code-workspace$/.test(lower)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function globToRegExp(pattern: string): RegExp {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      source += '.*';
      index += 1;
      if (pattern[index + 1] === '/') index += 1;
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    if (/[.+^${}()|[\]\\]/.test(char)) {
      source += `\\${char}`;
      continue;
    }
    source += char;
  }
  return new RegExp(`^${source}$`);
}

function pathUnderBase(path: string, baseDir: string): string | null {
  const normalized = normalizeArchivePath(path).replace(/\/$/, '');
  if (!baseDir) return normalized;
  if (normalized === baseDir) return '';
  if (!normalized.startsWith(`${baseDir}/`)) return null;
  return normalized.slice(baseDir.length + 1);
}

function matchesRule(relativePath: string, isDirectory: boolean, rule: ArchiveIgnoreRuleV1): boolean {
  const target = relativePath.replace(/\/$/, '');
  if (!target) return rule.directoryOnly && isDirectory;
  const pattern = rule.pattern.replace(/\/$/, '');
  const matcher = globToRegExp(pattern);

  if (rule.anchored) {
    if (target === pattern || matcher.test(target)) {
      return !rule.directoryOnly || isDirectory || target.startsWith(`${pattern}/`);
    }
    return rule.directoryOnly && target.startsWith(`${pattern}/`);
  }

  if (!pattern.includes('/')) {
    const segments = target.split('/');
    const index = segments.findIndex((segment) => matcher.test(segment));
    if (index < 0) return false;
    if (!rule.directoryOnly) return true;
    return isDirectory || index < segments.length - 1;
  }

  if (matcher.test(target) || target === pattern) return true;
  return rule.directoryOnly && target.startsWith(`${pattern}/`);
}

export function parseIgnoreRuleText(text: string, baseDir = ''): ArchiveIgnoreRuleV1[] {
  const rules: ArchiveIgnoreRuleV1[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let pattern = line;
    let negated = false;
    if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }
    if (!pattern) continue;
    const directoryOnly = pattern.endsWith('/');
    const anchored = pattern.startsWith('/');
    if (anchored) pattern = pattern.slice(1);
    rules.push({
      pattern,
      negated,
      directoryOnly,
      anchored,
      baseDir: normalizeArchivePath(baseDir).replace(/\/$/, ''),
    });
  }
  return rules;
}

export class ArchiveIgnoreMatcher {
  private readonly rules: ArchiveIgnoreRuleV1[] = [];

  static withDefaults(): ArchiveIgnoreMatcher {
    const matcher = new ArchiveIgnoreMatcher();
    matcher.addRules(parseIgnoreRuleText(DEFAULT_ARCHIVE_DENY_PATTERNS.join('\n')));
    return matcher;
  }

  addRules(rules: readonly ArchiveIgnoreRuleV1[]): void {
    this.rules.push(...rules);
  }

  addFromText(text: string, baseDir = ''): void {
    this.addRules(parseIgnoreRuleText(text, baseDir));
  }

  ignores(path: string, isDirectory = false): boolean {
    const normalized = normalizeArchivePath(path);
    const directory = isDirectory || normalized.endsWith('/');
    let denied = false;
    for (const rule of this.rules) {
      const relative = pathUnderBase(normalized, rule.baseDir);
      if (relative === null) continue;
      if (matchesRule(relative, directory, rule)) {
        denied = !rule.negated;
      }
    }
    return denied;
  }
}

const SECRET_SETTING =
  /(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|password|secret|token|^key$|_key$|_token$|_secret$)/i;

function stringList(value: unknown, max = 40): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, max);
}

/** Redacted, bounded summary. Values that look like secrets become `[redacted]`. */
export function summarizeIdeManifest(value: unknown, title: string): string | null {
  if (!isPlainObject(value)) return null;
  const parts = [`IDE manifest ${title}`.trim()];
  const recommendations = stringList(
    Array.isArray(value.recommendations)
      ? value.recommendations
      : isPlainObject(value.recommendations)
        ? (value.recommendations as { recommendations?: unknown }).recommendations
        : undefined,
  );
  if (recommendations.length > 0) {
    parts.push(`extensions ${recommendations.join(', ')}`);
  }
  const unwanted = stringList(value.unwantedRecommendations);
  if (unwanted.length > 0) parts.push(`unwanted ${unwanted.join(', ')}`);

  const folders = Array.isArray(value.folders)
    ? value.folders
        .map((folder) => (isPlainObject(folder) && typeof folder.path === 'string' ? folder.path : ''))
        .filter(Boolean)
        .slice(0, 16)
    : [];
  if (folders.length > 0) parts.push(`folders ${folders.join(', ')}`);

  const settingKeys: string[] = [];
  const settings = isPlainObject(value.settings) ? value.settings : value;
  if (isPlainObject(settings)) {
    for (const key of Object.keys(settings)) {
      if (
        key === 'recommendations' ||
        key === 'unwantedRecommendations' ||
        key === 'folders' ||
        key === 'extensions'
      ) {
        continue;
      }
      settingKeys.push(SECRET_SETTING.test(key) ? `${key}=[redacted]` : key);
      if (settingKeys.length >= 40) break;
    }
  }
  if (settingKeys.length > 0) parts.push(`settings ${settingKeys.join(', ')}`);

  const body = parts.join('. ').trim();
  if (body.length < 1) return null;
  return body.length <= ARCHIVE_ENGINEERING_BODY_MAX_CHARS
    ? body
    : body.slice(0, ARCHIVE_ENGINEERING_BODY_MAX_CHARS);
}

export function summarizeIgnoreRules(text: string, title: string): string | null {
  const rules = parseIgnoreRuleText(text);
  if (rules.length < 1) return null;
  const listed = rules
    .slice(0, 80)
    .map((rule) => `${rule.negated ? '!' : ''}${rule.pattern}${rule.directoryOnly ? '/' : ''}`);
  const body = [
    `Ignore rules from ${title} (${rules.length} pattern${rules.length === 1 ? '' : 's'}).`,
    listed.join('\n'),
  ].join('\n');
  return body.length <= ARCHIVE_ENGINEERING_BODY_MAX_CHARS
    ? body
    : `${body.slice(0, ARCHIVE_ENGINEERING_BODY_MAX_CHARS - 1)}…`;
}
