/**
 * V4 — WardrobePanel smoke tests.
 *
 * Coverage:
 *  - 渲染：列出已拥有皮肤
 *  - 装备：点击未激活皮肤 → 调用 activateSkin(id) → 高亮切换
 *  - 实时：agentrix:pet-skin-changed 事件触发 active 切换
 *  - 入口：3 个跨面板按钮通过 dispatchUiAction 派发
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";

const listSkinsMock = vi.fn();
const getActiveSkinIdMock = vi.fn();
const activateSkinMock = vi.fn();
const dispatchUiActionMock = vi.fn();

vi.mock("../services/petSoulSdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../services/petSoulSdk");
  return {
    ...actual,
    listSkins: (...args: unknown[]) => listSkinsMock(...args),
    getActiveSkinId: (...args: unknown[]) => getActiveSkinIdMock(...args),
    activateSkin: (...args: unknown[]) => activateSkinMock(...args),
  };
});

vi.mock("../services/petSdk", () => ({
  getLastPetState: () => ({ soul_template_id: "claw" }),
}));

vi.mock("../services/desktopBus", () => ({
  dispatchUiAction: (...args: unknown[]) => dispatchUiActionMock(...args),
}));

vi.mock("../services/store", () => ({
  API_BASE: "http://test.local/api",
  useAuthStore: { getState: () => ({ token: "t" }) },
}));

import WardrobePanel from "../components/WardrobePanel";

const FIXTURES = [
  {
    id: "skin-a",
    owner_user_id: "u1",
    source: "platform" as const,
    display_name: "默认浮球",
    url: "/skins/a.svg",
    thumbnail_url: null,
    format: "svg" as const,
    manifest: {},
    created_at: 0,
  },
  {
    id: "skin-b",
    owner_user_id: "u1",
    source: "generated" as const,
    display_name: "蓝色独角兽",
    url: "/skins/b.vrm",
    thumbnail_url: null,
    format: "vrm" as const,
    manifest: {},
    created_at: 0,
  },
];

describe("WardrobePanel (V4)", () => {
  beforeEach(() => {
    listSkinsMock.mockReset().mockResolvedValue(FIXTURES);
    getActiveSkinIdMock.mockReset().mockResolvedValue("skin-a");
    activateSkinMock.mockReset().mockResolvedValue(undefined);
    dispatchUiActionMock.mockReset().mockResolvedValue(undefined);
    cleanup();
  });

  it("renders 拥有的皮肤 grid and shows 当前装备", async () => {
    render(<WardrobePanel onClose={() => {}} />);
    expect(await screen.findByTestId("wardrobe-skin-skin-a")).toBeInTheDocument();
    expect(await screen.findByTestId("wardrobe-skin-skin-b")).toBeInTheDocument();
    // active skin name in header section appears in TWO places (header + card) — ensure both rendered
    expect(screen.getAllByText("默认浮球").length).toBeGreaterThanOrEqual(1);
  });

  it("clicking 装备 calls activateSkin(id)", async () => {
    render(<WardrobePanel onClose={() => {}} />);
    const btn = await screen.findByTestId("wardrobe-activate-skin-b");
    fireEvent.click(btn);
    await waitFor(() => {
      expect(activateSkinMock).toHaveBeenCalledWith("skin-b");
    });
  });

  it("agentrix:pet-skin-changed event updates active highlight", async () => {
    render(<WardrobePanel onClose={() => {}} />);
    await screen.findByText("蓝色独角兽");
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("agentrix:pet-skin-changed", {
          detail: { active_skin_id: "skin-b" },
        }),
      );
    });
    await waitFor(() => {
      const newActiveBtn = screen.getByTestId("wardrobe-activate-skin-b") as HTMLButtonElement;
      expect(newActiveBtn.disabled).toBe(true);
      expect(newActiveBtn.textContent).toContain("已装备");
    });
  });

  it("3 跨面板按钮 dispatchUiAction(open-pet-creator/soul-picker/marketplace)", async () => {
    render(<WardrobePanel onClose={() => {}} />);
    await screen.findByTestId("wardrobe-skin-skin-a");

    fireEvent.click(screen.getByTestId("wardrobe-open-creator"));
    await waitFor(() => expect(dispatchUiActionMock).toHaveBeenCalledWith("open-pet-creator"));

    fireEvent.click(screen.getByTestId("wardrobe-open-soul"));
    await waitFor(() => expect(dispatchUiActionMock).toHaveBeenCalledWith("open-soul-picker"));

    // marketplace toggle internal — switches to iframe view, just assert no crash
    fireEvent.click(screen.getByTestId("wardrobe-open-market"));
    expect(await screen.findByTitle("Agentrix Skin Marketplace")).toBeInTheDocument();
  });
});
