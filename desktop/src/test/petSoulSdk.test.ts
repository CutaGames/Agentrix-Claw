/**
 * DT-T1.1 / DT-T1.2 — petSoulSdk unit tests.
 * Maps to PRD_PET_PHASED_TEST_PLAN.zh-CN.md §4.1 desktop unit row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the store before SUT import — petSoulSdk reads API_BASE + token from it.
vi.mock("../services/store", () => ({
  API_BASE: "http://test.local/api",
  useAuthStore: { getState: () => ({ token: "test-token" }) },
}));

import {
  listSouls,
  switchSoul,
  getSoul,
  activateSkin,
  getActiveSkinId,
} from "../services/petSoulSdk";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("DT-T1.1 / DT-T1.2 petSoulSdk", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it("listSouls() requests /v1/pet/souls?clan=A_office and returns items", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          { id: "claw", clan: "A_office", display_name: "爪爪", tier: "free" },
          { id: "owl", clan: "A_office", display_name: "夜枭", tier: "high_arpu" },
        ],
      }),
    );
    const list = await listSouls({ clan: "A_office" });
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("claw");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v1/pet/souls");
    expect(url).toContain("clan=A_office");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("getSoul(id) requests by encoded id", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "owl", clan: "A_office", display_name: "夜枭", tier: "high_arpu" }),
    );
    const soul = await getSoul("owl");
    expect(soul.id).toBe("owl");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/pet/souls/owl");
  });

  it("switchSoul(id) POSTs to /v1/pet/soul/switch with body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await switchSoul("tinker");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1/pet/soul/switch");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ templateId: "tinker" });
  });

  it("switchSoul throws when backend returns error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "forbidden" }, 403));
    await expect(switchSoul("dragon")).rejects.toThrow(/switchSoul failed \(403\)/);
  });

  it("activateSkin POSTs to /v1/pet/skin/activate", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await activateSkin("skin-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1/pet/skin/activate");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ skinId: "skin-1" });
  });

  it("getActiveSkinId returns null when none active", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ active_skin_id: null }));
    const id = await getActiveSkinId();
    expect(id).toBeNull();
  });
});
