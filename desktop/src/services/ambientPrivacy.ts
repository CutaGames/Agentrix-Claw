/**
 * ambientPrivacy — 桌面 E64（I-030）：剪贴板同步和前台应用感知，默认都关。
 *
 * 以前登录后每 2 秒读一次剪贴板，变了（2 个字以上，最多 2000 字）就经 socket 的
 * `clipboard:sync` 发到生产后端，用户从没选过，复制的密码、密钥也一起发出去；前台窗口
 * 每 8 秒查一次。现在：
 * - 两个开关都存在本机，默认关，只能由本人在设置里打开；
 * - 剪贴板：打开后才读；像密钥、密码、token 的内容永远不发（也不做本机快捷操作）；
 *   单次最多发 500 字；
 * - 前台应用：打开后才读，而且只读应用名，不读窗口标题。
 */
import { digitalTwinTextLooksSecretV1 } from "../../../shared/types/digital-twin-interview";

export const CLIPBOARD_SYNC_KEY = "agentrix_desktop_clipboard_sync_enabled";
export const ACTIVE_APP_AWARENESS_KEY = "agentrix_desktop_active_app_awareness_enabled";
export const AMBIENT_PRIVACY_CHANGED_EVENT = "agentrix:ambient-privacy-changed";
/** 单次同步最多这么多字。 */
export const CLIPBOARD_SYNC_MAX_CHARS = 500;

function readFlag(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, enabled: boolean): void {
  try {
    if (enabled) globalThis.localStorage?.setItem(key, "1");
    else globalThis.localStorage?.removeItem(key);
  } catch {
    /* storage unavailable: stays off */
  }
  try {
    window.dispatchEvent(new CustomEvent(AMBIENT_PRIVACY_CHANGED_EVENT, { detail: { key, enabled } }));
  } catch {
    /* non-DOM host */
  }
}

export const isClipboardSyncEnabled = () => readFlag(CLIPBOARD_SYNC_KEY);
export const setClipboardSyncEnabled = (enabled: boolean) => writeFlag(CLIPBOARD_SYNC_KEY, enabled);
export const isActiveAppAwarenessEnabled = () => readFlag(ACTIVE_APP_AWARENESS_KEY);
export const setActiveAppAwarenessEnabled = (enabled: boolean) => writeFlag(ACTIVE_APP_AWARENESS_KEY, enabled);

export function onAmbientPrivacyChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener();
  window.addEventListener(AMBIENT_PRIVACY_CHANGED_EVENT, handler);
  // Another window (settings in the chat panel, watcher in main) changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key === CLIPBOARD_SYNC_KEY || event.key === ACTIVE_APP_AWARENESS_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AMBIENT_PRIVACY_CHANGED_EVENT, handler);
    window.removeEventListener("storage", onStorage);
  };
}

/** 明显的凭据格式（shared 的规则没覆盖到、或者要在一段文字中间也认出来的）。 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, // JWT
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i,
  /\b(?:sk|rk|pk)[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9]{16,}/, // OpenAI / Stripe / Anthropic style
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, // AWS access key id
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bglpat-[A-Za-z0-9_-]{16,}\b/,
  /\bnpm_[A-Za-z0-9]{30,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  // KEY=value / key: value where the key names a secret (.env lines, JSON, YAML).
  /\b[A-Za-z0-9_.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credential|auth)[A-Za-z0-9_.-]*["']?\s*[:=]\s*["']?[^\s"']{4,}/i,
  // user:password@host in a URL
  /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i,
];

const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;
const PATH_LIKE = /^(?:[/~]|[A-Za-z]:\\|\.{1,2}\/)/;

/**
 * 一整段不带空格、像随机生成的字符串（密码管理器复制出来的密码、token、私钥片段）。
 * 宁可多拦：拦错只是这一次不同步。
 */
function looksLikeGeneratedSecret(text: string): boolean {
  const value = text.trim();
  if (value.length < 8 || value.length > 256 || /\s/.test(value)) return false;
  if (URL_LIKE.test(value) || PATH_LIKE.test(value)) return false;
  const classes =
    Number(/[a-z]/.test(value)) + Number(/[A-Z]/.test(value)) + Number(/[0-9]/.test(value)) + Number(/[^A-Za-z0-9]/.test(value));
  if (classes >= 3) return true;
  // Long hex / base64 / base64url runs with letters and digits.
  return value.length >= 20 && /^[A-Za-z0-9+/=_-]+$/.test(value) && /[A-Za-z]/.test(value) && /[0-9]/.test(value);
}

/** 看起来像密钥、密码或 token：永远不同步。 */
export function clipboardTextLooksSecret(text: string): boolean {
  if (!text) return false;
  if (digitalTwinTextLooksSecretV1(text)) return true;
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return looksLikeGeneratedSecret(text);
}

/**
 * 要发出去的剪贴板内容：开关关着、像密钥、太短都返回 null；否则最多 500 字。
 * 所有发往服务端的路径（clipboard.ts 的轮询、sessionSync 的发送）都要过这一道。
 */
export function clipboardTextForSync(text: unknown): string | null {
  if (!isClipboardSyncEnabled()) return null;
  if (typeof text !== "string") return null;
  if (text.trim().length < 2) return null;
  if (clipboardTextLooksSecret(text)) return null;
  return Array.from(text).slice(0, CLIPBOARD_SYNC_MAX_CHARS).join("");
}
