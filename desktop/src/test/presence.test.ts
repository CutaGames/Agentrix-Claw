/**
 * presence.test.ts — desktop cross-device presence client (soul-companion task 4.3).
 *
 * Covers the desktop-side heartbeat reporter behaviour required by R8.2/R8.3/R8.6:
 *   - resolves the active instance (activeInstanceId → primary → first).
 *   - posts POST /v1/presence/heartbeat { instanceId, device:'desktop' } with Bearer auth.
 *   - skips the beat (no throw, interval continues) when no instance is resolvable yet.
 *   - swallows heartbeat failures so the interval keeps running (reconnect auto-recovers).
 *   - start is idempotent for the same token; stop cleans the interval.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

// ── Mock the desktop HTTP client + auth store (./store) ──────────────────────
const apiFetch = vi.fn();
const authState: { activeInstanceId: string | null; instances: Array<{ id: string; isPrimary?: boolean }> } = {
  activeInstanceId: null,
  instances: [],
};

vi.mock("../services/store", () => ({
  API_BASE: "https://api.test.local/api",
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  useAuthStore: { getState: () => authState },
}));

import {
  resolveActivePresenceInstanceId,
  sendDesktopHeartbeat,
  startDesktopPresence,
  stopDesktopPresence,
  isDesktopPresenceRunning,
} from "../services/presence";

function okSnapshot(instanceId: string) {
  return new Response(
    JSON.stringify({ instanceId, presences: [{ device: "desktop", online: true, lastSeen: Date.now() }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  authState.activeInstanceId = null;
  authState.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  stopDesktopPresence();
  vi.useRealTimers();
});

describe("resolveActivePresenceInstanceId", () => {
  it("prefers activeInstanceId", () => {
    authState.activeInstanceId = "active-1";
    authState.instances = [{ id: "p", isPrimary: true }, { id: "x" }];
    expect(resolveActivePresenceInstanceId()).toBe("active-1");
  });

  it("falls back to the primary instance, then the first", () => {
    authState.instances = [{ id: "first" }, { id: "primary", isPrimary: true }];
    expect(resolveActivePresenceInstanceId()).toBe("primary");

    authState.instances = [{ id: "first" }, { id: "second" }];
    expect(resolveActivePresenceInstanceId()).toBe("first");
  });

  it("returns null when no instance is available", () => {
    expect(resolveActivePresenceInstanceId()).toBeNull();
  });
});

describe("sendDesktopHeartbeat", () => {
  it("POSTs to /v1/presence/heartbeat with device='desktop' + Bearer auth", async () => {
    apiFetch.mockResolvedValueOnce(okSnapshot("i1"));
    const snap = await sendDesktopHeartbeat({ instanceId: "i1", token: "tok" });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test.local/api/v1/presence/heartbeat");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toMatchObject({ instanceId: "i1", device: "desktop" });
    expect(snap?.instanceId).toBe("i1");
  });

  it("throws on a non-2xx response", async () => {
    apiFetch.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await expect(sendDesktopHeartbeat({ instanceId: "i1", token: "tok" })).rejects.toThrow(/500/);
  });
});

describe("startDesktopPresence", () => {
  it("beats immediately and then on the interval, reporting the active instance", async () => {
    authState.activeInstanceId = "i1";
    apiFetch.mockResolvedValue(okSnapshot("i1"));

    startDesktopPresence("tok", { intervalMs: 1_000 });
    expect(isDesktopPresenceRunning()).toBe(true);

    // immediate beat
    await vi.advanceTimersByTimeAsync(0);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    // one interval tick
    await vi.advanceTimersByTimeAsync(1_000);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("skips the beat (no request, no throw) until an instance is resolvable", async () => {
    // no instance yet
    apiFetch.mockResolvedValue(okSnapshot("i1"));
    startDesktopPresence("tok", { intervalMs: 1_000 });

    await vi.advanceTimersByTimeAsync(0);
    expect(apiFetch).not.toHaveBeenCalled();

    // instance appears later (e.g. /auth/me populated) → next tick reports it
    authState.activeInstanceId = "i1";
    await vi.advanceTimersByTimeAsync(1_000);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("swallows heartbeat failures so the interval keeps running (reconnect recovers)", async () => {
    authState.activeInstanceId = "i1";
    const onError = vi.fn();
    // first beat rejects (offline), second resolves (reconnected)
    apiFetch.mockRejectedValueOnce(new Error("network down"));
    apiFetch.mockResolvedValue(okSnapshot("i1"));

    startDesktopPresence("tok", { intervalMs: 1_000, onError });

    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(isDesktopPresenceRunning()).toBe(true);

    // interval did not break — next beat fires and succeeds
    await vi.advanceTimersByTimeAsync(1_000);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("is idempotent for the same token", async () => {
    authState.activeInstanceId = "i1";
    apiFetch.mockResolvedValue(okSnapshot("i1"));

    startDesktopPresence("tok", { intervalMs: 1_000 });
    await vi.advanceTimersByTimeAsync(0);
    startDesktopPresence("tok", { intervalMs: 1_000 }); // reused, no extra immediate beat
    await vi.advanceTimersByTimeAsync(0);

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("stop halts further beats", async () => {
    authState.activeInstanceId = "i1";
    apiFetch.mockResolvedValue(okSnapshot("i1"));

    startDesktopPresence("tok", { intervalMs: 1_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    stopDesktopPresence();
    expect(isDesktopPresenceRunning()).toBe(false);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
