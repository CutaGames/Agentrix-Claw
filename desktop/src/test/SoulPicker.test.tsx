/**
 * DT-T1.3 / DT-T1.4 / DT-T1.5 — SoulPicker component tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const listSoulsMock = vi.fn();
const switchSoulMock = vi.fn();
const getLastPetStateMock = vi.fn(() => ({ soul_template_id: "claw" }));

vi.mock("../services/petSoulSdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../services/petSoulSdk");
  return {
    ...actual,
    listSouls: (...args: unknown[]) => listSoulsMock(...args),
    switchSoul: (...args: unknown[]) => switchSoulMock(...args),
  };
});

vi.mock("../services/petSdk", () => ({
  getLastPetState: () => getLastPetStateMock(),
}));

vi.mock("../services/store", () => ({
  API_BASE: "http://test.local/api",
  useAuthStore: { getState: () => ({ token: "t" }) },
}));

import SoulPicker from "../components/SoulPicker";

const A_OFFICE_SOULS = [
  { id: "claw",   clan: "A_office", display_name: "爪爪",   archetype: "ENFP", tagline: "everyday helper", tier: "free",      age_rating: "all", recommended_skin_tags: [], default_idle_emotion: "happy",  display_name_en: "Claw",  marketing_hook: "" },
  { id: "tinker", clan: "A_office", display_name: "叮当",   archetype: "ISTP", tagline: "tinkerer",       tier: "high_arpu", age_rating: "all", recommended_skin_tags: [], default_idle_emotion: "focused",display_name_en: "Tinker",marketing_hook: "" },
  { id: "sentry", clan: "A_office", display_name: "哨兵",   archetype: "ISTJ", tagline: "guard",          tier: "high_arpu", age_rating: "all", recommended_skin_tags: [], default_idle_emotion: "calm",   display_name_en: "Sentry",marketing_hook: "" },
  { id: "hawk",   clan: "A_office", display_name: "猎鹰",   archetype: "INTJ", tagline: "analyst",        tier: "high_arpu", age_rating: "all", recommended_skin_tags: [], default_idle_emotion: "focused",display_name_en: "Hawk",  marketing_hook: "" },
  { id: "owl",    clan: "A_office", display_name: "夜枭",   archetype: "INTJ", tagline: "researcher",     tier: "high_arpu", age_rating: "13+", recommended_skin_tags: [], default_idle_emotion: "focused",display_name_en: "Owl",   marketing_hook: "" },
  { id: "fox",    clan: "A_office", display_name: "狐火",   archetype: "ENFP", tagline: "creative spark", tier: "high_arpu", age_rating: "13+", recommended_skin_tags: [], default_idle_emotion: "excited",display_name_en: "Fox",   marketing_hook: "" },
  { id: "dragon", clan: "A_office", display_name: "龙脉",   archetype: "INTJ-A", tagline: "strategy",     tier: "high_arpu", age_rating: "18+", recommended_skin_tags: [], default_idle_emotion: "focused",display_name_en: "Dragon",marketing_hook: "" },
];

describe("SoulPicker (DT-T1.3 / 1.4 / 1.5)", () => {
  beforeEach(() => {
    listSoulsMock.mockReset().mockResolvedValue(A_OFFICE_SOULS);
    switchSoulMock.mockReset().mockResolvedValue(undefined);
    getLastPetStateMock.mockReset().mockReturnValue({ soul_template_id: "claw" });
    cleanup();
  });

  it("DT-T1.3: renders 7 A-clan souls", async () => {
    render(<SoulPicker />);
    await waitFor(() => {
      expect(listSoulsMock).toHaveBeenCalledWith({ clan: "A_office" });
    });
    for (const s of A_OFFICE_SOULS) {
      expect(await screen.findByText(s.display_name)).toBeInTheDocument();
    }
  });

  it("DT-T1.4: clicking '选这只' calls switchSoul(id)", async () => {
    render(<SoulPicker />);
    const tinkerCard = await screen.findByText("叮当");
    const article = tinkerCard.closest("article");
    expect(article).not.toBeNull();
    const button = article!.querySelector("button")!;
    fireEvent.click(button);
    await waitFor(() => {
      expect(switchSoulMock).toHaveBeenCalledWith("tinker");
    });
  });

  it("DT-T1.4: shows '✓ 当前灵魂' for the active soul and disables its button", async () => {
    render(<SoulPicker />);
    const clawCard = (await screen.findByText("爪爪")).closest("article")!;
    const button = clawCard.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("当前灵魂");
  });

  it("DT-T1.5: agentrix:pet-soul-changed event updates active highlight", async () => {
    render(<SoulPicker />);
    await screen.findByText("叮当");
    // Initially claw is active
    let clawBtn = (screen.getByText("爪爪").closest("article")!.querySelector("button")) as HTMLButtonElement;
    expect(clawBtn.disabled).toBe(true);

    // Fire realtime event — switch to owl
    window.dispatchEvent(
      new CustomEvent("agentrix:pet-soul-changed", { detail: { soul_template_id: "owl" } }),
    );

    await waitFor(() => {
      const owlBtn = (screen.getByText("夜枭").closest("article")!.querySelector("button")) as HTMLButtonElement;
      expect(owlBtn.disabled).toBe(true);
      expect(owlBtn.textContent).toContain("当前灵魂");
    });
    clawBtn = (screen.getByText("爪爪").closest("article")!.querySelector("button")) as HTMLButtonElement;
    expect(clawBtn.disabled).toBe(false);
  });
});
