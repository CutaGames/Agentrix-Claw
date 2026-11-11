/**
 * chatFailureCopy — what the chat says when a turn fails (T7 r1, 10-16).
 *
 * The first simulated-user round on the desktop showed one failure three times: the bubble said
 * "Error: LlmGatewayError", a summary under it told the person to "click Continue" while the
 * button said Retry, and a red "请求失败 / LlmGatewayError" banner sat over the composer. Now
 * the bubble says one plain sentence with the raw error folded under 技术细节, the summary is not
 * repeated for a failed turn, and the banner is a short status line.
 *
 * The stored message content is unchanged ("Error: …"): the anti-loop check in useStreamingTurn
 * reads it. Only what is shown changes.
 */
import type { Locale } from "../../i18n/strings";

export type ChatFailureKind = "busy" | "signed_out" | "timeout" | "network" | "unknown";

const ERROR_PREFIX = "Error: ";

/** The raw error of a failed turn whose bubble has nothing else in it, or null. */
export function chatFailureRaw(content: string | null | undefined): string | null {
  if (typeof content !== "string" || !content.startsWith(ERROR_PREFIX)) return null;
  return content.slice(ERROR_PREFIX.length).trim();
}

export function chatFailureKind(raw: string | null | undefined): ChatFailureKind {
  const text = String(raw ?? "");
  if (/\b401\b|unauthori[sz]ed|token expired|jwt expired|sign[ _-]?in required/i.test(text)) return "signed_out";
  if (/timeout|timed out|ETIMEDOUT|超时/i.test(text)) return "timeout";
  if (/network\s*error|fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|stream (closed|interrupted)|premature close|网络/i.test(text)) return "network";
  if (/\b429\b|\b503\b|rate.?limit|LlmGateway|overloaded|unavailable|quota|capacity/i.test(text)) return "busy";
  return "unknown";
}

const COPY: Record<ChatFailureKind, { zh: string; en: string }> = {
  busy: { zh: "模型服务这会儿没有回应，稍后点「重试」。", en: "The model service is not answering right now. Retry in a moment." },
  signed_out: { zh: "登录已过期，请重新登录后再试。", en: "You are signed out. Sign in again, then retry." },
  timeout: { zh: "等了太久没有回应，可以点「重试」。", en: "No answer for too long. You can retry." },
  network: { zh: "网络断了一下，可以点「重试」。", en: "The connection dropped. You can retry." },
  unknown: { zh: "这次没能回复，可以点「重试」，或者换个说法。", en: "No reply this time. Retry, or put it another way." },
};

/** One plain sentence for a failed turn, in the app language (Chinese for zh, English otherwise). */
export function chatFailureText(raw: string | null | undefined, locale: Locale | string): string {
  const copy = COPY[chatFailureKind(raw)];
  return locale === "zh" ? copy.zh : copy.en;
}
