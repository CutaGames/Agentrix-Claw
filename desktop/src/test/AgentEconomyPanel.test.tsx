/**
 * AgentEconomyPanel — empty-state CTA ordering test (US-G1-3).
 *
 * Bug: Clicking [✨ 创建/选择主宠] on the empty Economy panel was dispatching
 * `agentrix:open-pet-creator` BEFORE `onClose()` finished unmounting the
 * panel, causing both panels to render on top of each other for one frame.
 *
 * Fix: dispatch is deferred via setTimeout(..., 0).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../services/store", () => ({
  API_BASE: "http://test.local/api",
  apiFetch: vi.fn(async () => new Response(null, { status: 401 })),
  useAuthStore: () => ({ token: null, activeInstanceId: null }),
}));

vi.mock("./AxpEconomyTab", () => ({
  default: () => <div data-testid="axp-tab" />,
}));

vi.mock("./SkinGmvCard", () => ({
  default: () => <div data-testid="skin-gmv" />,
}));

import AgentEconomyPanel from "../components/AgentEconomyPanel";

describe("AgentEconomyPanel — empty-state CTA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("when no account exists, calls onClose THEN dispatches open-pet-creator on next tick", async () => {
    const onClose = vi.fn();
    const events: string[] = [];

    function captureDispatch(e: Event) { events.push(e.type); }
    window.addEventListener("agentrix:open-pet-creator", captureDispatch);

    try {
      render(<AgentEconomyPanel open={true} onClose={onClose} />);

      // token is null in mock → fetchAccountInfo short-circuits, loading stays
      // false, account stays null → empty-state renders.
      const cta = await screen.findByRole("button", { name: /创建.*主宠/ });
      expect(cta).toBeInTheDocument();

      // Click — onClose should fire IMMEDIATELY, dispatch should NOT yet fire.
      fireEvent.click(cta);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(0);

      // Wait for the deferred dispatch on the next macrotask.
      await new Promise((r) => setTimeout(r, 5));
      expect(events).toEqual(["agentrix:open-pet-creator"]);
    } finally {
      window.removeEventListener("agentrix:open-pet-creator", captureDispatch);
    }
  });
});
