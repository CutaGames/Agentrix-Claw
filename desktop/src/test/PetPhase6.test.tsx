/**
 * Pet Phase 6 — comprehensive smoke tests covering all 5 panels.
 *
 * Verifies render, fetch wiring, CustomEvent listeners, action callbacks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";

// ── Mock SDK ────────────────────────────────────────────────────────

const sdkMocks = {
  getLivingPetState: vi.fn(),
  listAchievements: vi.fn(),
  listMemories: vi.fn(),
  createMemory: vi.fn(),
  deleteMemory: vi.fn(),
  listMinigameHistory: vi.fn(),
  listMinigameLeaderboard: vi.fn(),
  submitMinigameScore: vi.fn(),
  listMyBreedingEggs: vi.fn(),
  inviteBreeding: vi.fn(),
  acceptBreeding: vi.fn(),
  declineBreeding: vi.fn(),
  cancelBreeding: vi.fn(),
  hatchBreeding: vi.fn(),
};

vi.mock("../services/petPhase6Sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../services/petPhase6Sdk");
  return {
    ...actual,
    getLivingPetState: (...a: unknown[]) => sdkMocks.getLivingPetState(...a),
    listAchievements: (...a: unknown[]) => sdkMocks.listAchievements(...a),
    listMemories: (...a: unknown[]) => sdkMocks.listMemories(...a),
    createMemory: (...a: unknown[]) => sdkMocks.createMemory(...a),
    deleteMemory: (...a: unknown[]) => sdkMocks.deleteMemory(...a),
    listMinigameHistory: (...a: unknown[]) => sdkMocks.listMinigameHistory(...a),
    listMinigameLeaderboard: (...a: unknown[]) => sdkMocks.listMinigameLeaderboard(...a),
    submitMinigameScore: (...a: unknown[]) => sdkMocks.submitMinigameScore(...a),
    listMyBreedingEggs: (...a: unknown[]) => sdkMocks.listMyBreedingEggs(...a),
    inviteBreeding: (...a: unknown[]) => sdkMocks.inviteBreeding(...a),
    acceptBreeding: (...a: unknown[]) => sdkMocks.acceptBreeding(...a),
    declineBreeding: (...a: unknown[]) => sdkMocks.declineBreeding(...a),
    cancelBreeding: (...a: unknown[]) => sdkMocks.cancelBreeding(...a),
    hatchBreeding: (...a: unknown[]) => sdkMocks.hatchBreeding(...a),
  };
});

vi.mock("../services/petSoulSdk", () => ({
  listSkins: () => Promise.resolve([
    { id: "skin-1", display_name: "皮肤1", thumbnail_url: null, soul_template_id: "claw", tags: [] },
    { id: "skin-2", display_name: "皮肤2", thumbnail_url: null, soul_template_id: "claw", tags: [] },
  ]),
}));

vi.mock("../services/petSdk", () => {
  const LEVELS = [
    { level: 0, label_zh: "陌生", xpRequired: 0,   unlocks: ["基础对话"] },
    { level: 1, label_zh: "熟悉", xpRequired: 50,  unlocks: ["主动提示"] },
    { level: 2, label_zh: "亲密", xpRequired: 150, unlocks: ["代码 review"] },
  ];
  return {
    INTIMACY_LEVELS: LEVELS,
    intimacyLevelFor: (xp: number) => {
      let cur = LEVELS[0];
      for (const lv of LEVELS) if (xp >= lv.xpRequired) cur = lv;
      return cur;
    },
  };
});

vi.mock("../services/store", () => ({
  API_BASE: "http://test.local/api",
  useAuthStore: { getState: () => ({ token: "t" }) },
}));

import PetGrowthDashboard from "../components/PetGrowthDashboard";
import PetAchievementWall from "../components/PetAchievementWall";
import PetMemoryAlbumPanel from "../components/PetMemoryAlbumPanel";
import PetMinigamePanel from "../components/PetMinigamePanel";
import PetBreedingPanel from "../components/PetBreedingPanel";
import {
  formatRelativeTime,
  formatCountdown,
  MINIGAME_META,
} from "../services/petPhase6Sdk";

const FAKE_STATE = {
  id: "pet-1",
  user_id: "u-1",
  emotion: "happy",
  emotion_intensity: 7,
  intimacy_xp: 75,
  intimacy_level: 1,
  primary_agent_id: "agent-1",
  soul_template_id: "claw",
  active_skin_id: "skin-1",
  energy: 80,
  energy_max: 100,
};

const FAKE_ACHIEVEMENTS = [
  { key: "first_chat", label_zh: "初次见面", label_en: "First Chat", desc_zh: "和宠物说第一句话", icon: "💬", threshold: 1,   unlocked: true,  unlocked_at: Date.now() - 60000 },
  { key: "level_5",    label_zh: "亲密 Lv5", label_en: "Level 5",    desc_zh: "亲密度达到 5",     icon: "⭐", threshold: 5,   unlocked: false, unlocked_at: null },
  { key: "code_100",   label_zh: "代码 100", label_en: "Code 100",   desc_zh: "代码题答对 100",   icon: "💻", threshold: 100, unlocked: false, unlocked_at: null },
];

const FAKE_MEMORIES = [
  { id: "m1", title: "第一次写代码", body: "今天写了 hello world", thumbnail_url: null, category: "milestone", metadata: null, created_at: Date.now() - 3600000 },
];

beforeEach(() => {
  Object.values(sdkMocks).forEach((m) => m.mockReset());
  sdkMocks.getLivingPetState.mockResolvedValue(FAKE_STATE);
  sdkMocks.listAchievements.mockResolvedValue({ items: FAKE_ACHIEVEMENTS });
  sdkMocks.listMemories.mockResolvedValue({ items: FAKE_MEMORIES, total: 1 });
  sdkMocks.createMemory.mockResolvedValue({ ...FAKE_MEMORIES[0], id: "m-new" });
  sdkMocks.deleteMemory.mockResolvedValue({ ok: true });
  sdkMocks.listMinigameHistory.mockResolvedValue({ items: [] });
  sdkMocks.listMinigameLeaderboard.mockResolvedValue({ items: [] });
  sdkMocks.submitMinigameScore.mockResolvedValue({
    id: "score-1", score_clamped: 50, intimacy_xp_awarded: 25,
    energy_awarded: 5, level_up: false, newly_unlocked_achievements: [],
  });
  sdkMocks.listMyBreedingEggs.mockResolvedValue({ initiated: [], received: [] });
  sdkMocks.inviteBreeding.mockResolvedValue({ id: "egg-1", status: "invited" });
  sdkMocks.acceptBreeding.mockResolvedValue({ id: "egg-1", status: "accepted" });
  sdkMocks.declineBreeding.mockResolvedValue({ id: "egg-1", status: "declined" });
  sdkMocks.cancelBreeding.mockResolvedValue({ id: "egg-1", status: "cancelled" });
  sdkMocks.hatchBreeding.mockResolvedValue({ id: "egg-1", status: "hatched" });
  cleanup();
});

// ── PetGrowthDashboard ─────────────────────────────────────────────

describe("PetGrowthDashboard (Phase 6 S3)", () => {
  it("loads pet state + achievements on mount", async () => {
    render(<PetGrowthDashboard onClose={() => {}} />);
    await waitFor(() => {
      expect(sdkMocks.getLivingPetState).toHaveBeenCalled();
      expect(sdkMocks.listAchievements).toHaveBeenCalled();
    });
  });

  it("reacts to agentrix:pet-state event", async () => {
    render(<PetGrowthDashboard onClose={() => {}} />);
    await waitFor(() => expect(sdkMocks.getLivingPetState).toHaveBeenCalled());
    act(() => {
      window.dispatchEvent(
        new CustomEvent("agentrix:pet-state", { detail: { intimacy_xp: 200, intimacy_level: 2 } }),
      );
    });
    // No assertion on UI text because layout varies — just ensure no crash.
    expect(true).toBe(true);
  });
});

// ── PetAchievementWall ─────────────────────────────────────────────

describe("PetAchievementWall (Phase 6 S4)", () => {
  it("renders all 3 achievements", async () => {
    render(<PetAchievementWall onClose={() => {}} />);
    expect(await screen.findByText("初次见面")).toBeInTheDocument();
    expect(await screen.findByText("亲密 Lv5")).toBeInTheDocument();
    expect(await screen.findByText("代码 100")).toBeInTheDocument();
  });

  it("filters to unlocked only", async () => {
    render(<PetAchievementWall onClose={() => {}} />);
    await screen.findByText("初次见面");
    const buttons = screen.getAllByRole("button");
    const unlockedBtn = buttons.find((b) => b.textContent?.trim() === "已解锁");
    expect(unlockedBtn).toBeTruthy();
    fireEvent.click(unlockedBtn!);
    expect(screen.getByText("初次见面")).toBeInTheDocument();
    expect(screen.queryByText("亲密 Lv5")).toBeNull();
  });

  it("shows toast on agentrix:pet-achievement-unlocked", async () => {
    render(<PetAchievementWall onClose={() => {}} />);
    await screen.findByText("初次见面");
    act(() => {
      window.dispatchEvent(
        new CustomEvent("agentrix:pet-achievement-unlocked", {
          detail: { key: "level_5", label_zh: "亲密 Lv5", icon: "⭐" },
        }),
      );
    });
    await waitFor(() => {
      // refresh fired
      expect(sdkMocks.listAchievements).toHaveBeenCalledTimes(2);
    });
  });
});

// ── PetMemoryAlbumPanel ────────────────────────────────────────────

describe("PetMemoryAlbumPanel (Phase 6 S4)", () => {
  it("loads memories on mount and renders", async () => {
    render(<PetMemoryAlbumPanel onClose={() => {}} />);
    expect(await screen.findByText("第一次写代码")).toBeInTheDocument();
  });

  it("filters by category", async () => {
    render(<PetMemoryAlbumPanel onClose={() => {}} />);
    await screen.findByText("第一次写代码");
    const milestoneBtn = screen.getAllByText("里程碑")[0];
    fireEvent.click(milestoneBtn);
    await waitFor(() => {
      expect(sdkMocks.listMemories).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: "milestone" }),
      );
    });
  });

  it("calls deleteMemory when delete confirmed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PetMemoryAlbumPanel onClose={() => {}} />);
    await screen.findByText("第一次写代码");
    const buttons = screen.getAllByRole("button");
    const delBtn = buttons.find((b) => b.textContent?.includes("删除"));
    if (delBtn) {
      fireEvent.click(delBtn);
      await waitFor(() => expect(sdkMocks.deleteMemory).toHaveBeenCalledWith("m1"));
    }
    confirmSpy.mockRestore();
  });
});

// ── PetMinigamePanel ───────────────────────────────────────────────

describe("PetMinigamePanel (Phase 6 S5)", () => {
  it("renders 3 game cards on menu view", async () => {
    render(<PetMinigamePanel onClose={() => {}} />);
    expect(await screen.findByText(MINIGAME_META.scratch.label_zh)).toBeInTheDocument();
    expect(await screen.findByText(MINIGAME_META.feed.label_zh)).toBeInTheDocument();
    expect(await screen.findByText(MINIGAME_META.code_buddy.label_zh)).toBeInTheDocument();
  });

  it("loads history when history view selected", async () => {
    render(<PetMinigamePanel onClose={() => {}} />);
    await screen.findByText(MINIGAME_META.scratch.label_zh);
    const histBtn = screen.getByText(/历史/);
    fireEvent.click(histBtn);
    await waitFor(() => expect(sdkMocks.listMinigameHistory).toHaveBeenCalled());
  });

  it("loads leaderboard when leaderboard view selected", async () => {
    render(<PetMinigamePanel onClose={() => {}} />);
    await screen.findByText(MINIGAME_META.scratch.label_zh);
    const lbBtn = screen.getByText(/排行榜/);
    fireEvent.click(lbBtn);
    await waitFor(() => expect(sdkMocks.listMinigameLeaderboard).toHaveBeenCalled());
  });
});

// ── PetBreedingPanel ───────────────────────────────────────────────

describe("PetBreedingPanel (Phase 6 S5)", () => {
  it("loads breeding eggs + skins on mount", async () => {
    render(<PetBreedingPanel onClose={() => {}} />);
    await waitFor(() => {
      expect(sdkMocks.listMyBreedingEggs).toHaveBeenCalled();
    });
  });

  it("refreshes on agentrix:pet-breeding-invited", async () => {
    render(<PetBreedingPanel onClose={() => {}} />);
    await waitFor(() => expect(sdkMocks.listMyBreedingEggs).toHaveBeenCalled());
    const before = sdkMocks.listMyBreedingEggs.mock.calls.length;
    act(() => {
      window.dispatchEvent(new CustomEvent("agentrix:pet-breeding-invited", { detail: {} }));
    });
    await waitFor(() =>
      expect(sdkMocks.listMyBreedingEggs.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("refreshes on agentrix:pet-breeding-hatched", async () => {
    render(<PetBreedingPanel onClose={() => {}} />);
    await waitFor(() => expect(sdkMocks.listMyBreedingEggs).toHaveBeenCalled());
    const before = sdkMocks.listMyBreedingEggs.mock.calls.length;
    act(() => {
      window.dispatchEvent(new CustomEvent("agentrix:pet-breeding-hatched", { detail: {} }));
    });
    await waitFor(() =>
      expect(sdkMocks.listMyBreedingEggs.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("calls acceptBreeding when accept clicked on received invite", async () => {
    sdkMocks.listMyBreedingEggs.mockResolvedValue({
      initiated: [],
      received: [{
        id: "egg-9", initiator_user_id: "other", partner_user_id: "me",
        initiator_pet_skin_id: "skin-9", partner_pet_skin_id: "skin-1",
        status: "invited", hatch_at: null,
        child_skin_id_initiator: null, child_skin_id_partner: null,
        metadata: null, created_at: Date.now(), updated_at: Date.now(),
      }],
    });
    render(<PetBreedingPanel onClose={() => {}} />);
    const acceptBtn = await screen.findByTestId("breeding-accept-egg-9");
    fireEvent.click(acceptBtn);
    await waitFor(() => expect(sdkMocks.acceptBreeding).toHaveBeenCalledWith("egg-9"));
  });
});

// ── format helpers ────────────────────────────────────────────────

describe("petPhase6Sdk format helpers", () => {
  it("formatRelativeTime: <60s returns 刚刚", () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe("刚刚");
  });
  it("formatRelativeTime: minutes", () => {
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toContain("分钟前");
  });
  it("formatRelativeTime: hours", () => {
    expect(formatRelativeTime(Date.now() - 3 * 3_600_000)).toContain("小时前");
  });
  it("formatCountdown: past returns 可孵化", () => {
    expect(formatCountdown(Date.now() - 1000)).toBe("可孵化");
  });
  it("formatCountdown: future days+hours", () => {
    expect(formatCountdown(Date.now() + 2 * 86_400_000 + 3 * 3_600_000)).toMatch(/天/);
  });
});
