import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/store", () => ({
  API_BASE: "https://agentrix.test/api",
  useAuthStore: {
    getState: () => ({ token: null }),
  },
}));

describe("petSdk renderer selection", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("promotes Rive after a .riv asset url appears", async () => {
    const sdk = await import("../services/petSdk");

    await sdk.refreshPetRenderers();
    expect(sdk.getActivePetRenderer()?.id).toBe("fallback");

    localStorage.setItem("agentrix_pet_rive_url", "https://cdn.agentrix.top/pets/default.riv");

    expect(await sdk.refreshPetRenderers()).toBe("rive");
    expect(sdk.getActivePetRenderer()?.id).toBe("rive");
  });

  it("keeps VRM ahead of Rive when both assets are configured", async () => {
    localStorage.setItem("agentrix_pet_rive_url", "https://cdn.agentrix.top/pets/default.riv");
    localStorage.setItem("agentrix_pet_vrm_url", "https://cdn.agentrix.top/pets/default.vrm");

    const sdk = await import("../services/petSdk");

    expect(await sdk.refreshPetRenderers()).toBe("vrm");
    expect(sdk.getActivePetRenderer()?.id).toBe("vrm");
  });
});