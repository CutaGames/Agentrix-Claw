/**
 * Analytics opt-in / opt-out behavior — Sprint G-2 / US-G2-4.
 *
 * Locks in:
 *   - Default state is OFF (no event is queued / sent)
 *   - optInAnalytics flips the gate; subsequent trackEvent calls queue
 *   - optOutAnalytics clears the queue + stops timer
 *   - Legacy opt-out flag still wins
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/store", () => ({
  API_BASE: "http://test.local/api",
  apiFetch: vi.fn(async () => new Response("{}", { status: 202 })),
}));

vi.mock("../services/desktop", () => ({
  getDesktopDeviceId: () => "test-device-id",
}));

import {
  initAnalytics,
  trackEvent,
  optInAnalytics,
  optOutAnalytics,
  isAnalyticsOptedIn,
  destroyAnalytics,
} from "../services/analytics";
import { apiFetch } from "../services/store";

const apiFetchMock = vi.mocked(apiFetch);

describe("analytics opt-in (US-G2-4)", () => {
  beforeEach(() => {
    localStorage.clear();
    apiFetchMock.mockClear();
    destroyAnalytics();
  });

  it("default state is OFF — initAnalytics does not enable telemetry", () => {
    initAnalytics(null);
    expect(isAnalyticsOptedIn()).toBe(false);

    trackEvent("desktop_launch");
    // Force a flush by unloading
    window.dispatchEvent(new Event("beforeunload"));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("optInAnalytics flips state and persists; trackEvent queues afterwards", () => {
    initAnalytics(null);
    expect(isAnalyticsOptedIn()).toBe(false);

    optInAnalytics();
    expect(isAnalyticsOptedIn()).toBe(true);
    expect(localStorage.getItem("agentrix_telemetry_opt_in")).toBe("1");

    trackEvent("desktop_login", { method: "email" });
    // Force flush
    window.dispatchEvent(new Event("beforeunload"));
    expect(apiFetchMock).toHaveBeenCalled();
    const call = apiFetchMock.mock.calls[0];
    expect(call?.[0]).toContain("/desktop/analytics");
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].eventName).toBe("desktop_login");
    expect(body.events[0].deviceId).toBe("test-device-id");
  });

  it("optOutAnalytics clears the queue and stops sending", () => {
    optInAnalytics();
    initAnalytics(null);
    trackEvent("desktop_launch");
    optOutAnalytics();

    expect(isAnalyticsOptedIn()).toBe(false);
    expect(localStorage.getItem("agentrix_telemetry_opt_in")).toBe("0");

    // No flush should have occurred
    apiFetchMock.mockClear();
    window.dispatchEvent(new Event("beforeunload"));
    expect(apiFetchMock).not.toHaveBeenCalled();

    // New trackEvent calls are also dropped
    trackEvent("desktop_login");
    window.dispatchEvent(new Event("beforeunload"));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("legacy opt-out flag (agentrix_analytics_optout=1) still suppresses telemetry", () => {
    localStorage.setItem("agentrix_analytics_optout", "1");
    localStorage.setItem("agentrix_telemetry_opt_in", "1"); // even if the new key says yes

    initAnalytics(null);
    expect(isAnalyticsOptedIn()).toBe(false);
    trackEvent("desktop_launch");
    window.dispatchEvent(new Event("beforeunload"));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
