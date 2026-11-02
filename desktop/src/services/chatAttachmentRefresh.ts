/**
 * L8 1a A1: chat attachments uploaded while the owner switch is on carry a signed link that stops working after
 * 24 hours. The desktop keeps its chats in a local copy and never re-reads the server history, so nothing else would
 * ever renew those links. This helper renews them by attachment id (POST /chat-attachments/refresh) before a bubble
 * shows them, and once more when the picture or media element fails to load.
 *
 * Old attachments (no `attachmentId`, a plain public link) are never touched. Every failure keeps the old link:
 * nothing here throws or opens a dialog.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, apiFetch, useAuthStore, type ChatAttachment } from "./store";

/** Renew when less than this is left on the signature. */
export const REFRESH_MARGIN_MS = 3_600_000;
/** The server accepts at most this many ids per call. */
export const REFRESH_CHUNK = 20;

/** Expiry (ms) from `?e=<unix seconds>`; null when the link has no signature (legacy public files) or `e` is malformed. */
export function signedUrlExpiryMs(url: string): number | null {
  const m = /[?&]e=(\d{9,11})(?:&|$)/.exec(String(url ?? ""));
  if (!m) return null;
  const seconds = Number(m[1]);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

/**
 * True only for an attachment this feature issued (it has an `attachmentId`) whose signature is expired or has less
 * than `marginMs` left.
 */
export function needsRefresh(a: ChatAttachment, now: number = Date.now(), marginMs: number = REFRESH_MARGIN_MS): boolean {
  if (!a?.attachmentId) return false;
  const expiry = signedUrlExpiryMs(a.publicUrl);
  if (expiry === null) return false;
  return expiry - now < marginMs;
}

interface Fresh {
  url: string; // absolute, ready for src / href
  expiresAt: number; // ms
}

function toPublicUrl(url: string): string {
  const publicBase = API_BASE.replace(/\/api\/?$/, "");
  return url.startsWith("http") ? url : `${publicBase}${url}`;
}

/**
 * POST ${API_BASE}/chat-attachments/refresh { ids } in chunks of at most 20.
 * Never throws: any failure (network, 403, 5xx, an id missing from the answer) leaves that id out of the map.
 */
export async function refreshChatAttachments(ids: string[], token: string): Promise<Map<string, Fresh>> {
  const out = new Map<string, Fresh>();
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id))];
  if (unique.length === 0 || !token) return out;
  for (let i = 0; i < unique.length; i += REFRESH_CHUNK) {
    const chunk = unique.slice(i, i + REFRESH_CHUNK);
    try {
      const response = await apiFetch(`${API_BASE}/chat-attachments/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: chunk }),
      });
      if (!response.ok) {
        console.warn(`[chatAttachmentRefresh] refresh answered ${response.status}`);
        continue;
      }
      const data = await response.json();
      for (const item of Array.isArray(data?.items) ? data.items : []) {
        if (typeof item?.id !== "string" || typeof item?.url !== "string") continue;
        const url = toPublicUrl(item.url);
        out.set(item.id, { url, expiresAt: signedUrlExpiryMs(url) ?? Date.parse(String(item.expiresAt ?? "")) });
      }
    } catch (err) {
      console.warn("[chatAttachmentRefresh] refresh failed:", (err as Error)?.message || err);
    }
  }
  return out;
}

// ── shared state: one cache, and one batched request for every bubble that asks in the same tick ──────────────────
const fresh = new Map<string, Fresh>();
let queue = new Map<string, Array<(value: Fresh | undefined) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  const batch = queue;
  queue = new Map();
  timer = null;
  const token = useAuthStore.getState().token;
  const result = token ? await refreshChatAttachments([...batch.keys()], token) : new Map<string, Fresh>();
  for (const [id, waiters] of batch) {
    const value = result.get(id);
    if (value) fresh.set(id, value);
    for (const resolve of waiters) resolve(value);
  }
}

function scheduleRefresh(id: string): Promise<Fresh | undefined> {
  return new Promise((resolve) => {
    const waiters = queue.get(id) ?? [];
    waiters.push(resolve);
    queue.set(id, waiters);
    if (!timer) timer = setTimeout(() => void flush(), 0);
  });
}

/** For tests: forget everything cached or queued. */
export function resetChatAttachmentRefreshState(): void {
  fresh.clear();
  queue = new Map();
  if (timer) clearTimeout(timer);
  timer = null;
}

function withFresh(a: ChatAttachment): ChatAttachment {
  const known = a.attachmentId ? fresh.get(a.attachmentId) : undefined;
  if (!known) return a;
  const current = signedUrlExpiryMs(a.publicUrl);
  // Only ever move forward: a cached entry older than what the message already has is ignored.
  if (current !== null && known.expiresAt <= current) return a;
  return { ...a, publicUrl: known.url };
}

/**
 * Used by MessageBubble (at the top of the component, before any early return): the attachments with a fresh
 * `publicUrl`, and `retry(a)` for the `onError` of an <img> / <source>. Each attachment id is retried at most once per
 * mount, whatever the local clock says, so a link that is broken for another reason cannot loop.
 */
export function useFreshAttachments(attachments: ChatAttachment[] | undefined): { items: ChatAttachment[]; retry: (a: ChatAttachment) => void } {
  const [version, setVersion] = useState(0);
  const retried = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!attachments?.length) return;
    const wanted = attachments.filter((a) => needsRefresh(withFresh(a))).map((a) => a.attachmentId as string);
    if (wanted.length === 0) return;
    let live = true;
    void Promise.all([...new Set(wanted)].map((id) => scheduleRefresh(id))).then((values) => {
      if (live && mounted.current && values.some(Boolean)) setVersion((v) => v + 1);
    });
    return () => {
      live = false;
    };
  }, [attachments]);

  const items = useMemo(() => (attachments ?? []).map(withFresh), [attachments, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback((a: ChatAttachment) => {
    const id = a?.attachmentId;
    if (!id || retried.current.has(id)) return;
    retried.current.add(id);
    void scheduleRefresh(id).then((value) => {
      if (value && mounted.current) setVersion((v) => v + 1);
    });
  }, []);

  return { items, retry };
}
