import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const petRendererRuntime = vi.hoisted(() => {
  const state = { activeRendererId: "fallback" as "fallback" | "rive" | "vrm" };
  return {
    state,
    refreshPetRenderers: vi.fn(async () => state.activeRendererId),
    getActivePetRenderer: vi.fn(() => ({ id: state.activeRendererId })),
  };
});

vi.mock("../services/petSdk", () => ({
  refreshPetRenderers: petRendererRuntime.refreshPetRenderers,
  getActivePetRenderer: petRendererRuntime.getActivePetRenderer,
}));

vi.mock("../components/PetCanvas", () => ({
  default: () => <div data-testid="pet-canvas">canvas</div>,
}));

vi.mock("../components/PetRive", () => ({
  default: ({ url }: { url: string }) => <div data-testid="pet-rive-view">{url}</div>,
}));

vi.mock("../components/PetVRM", () => ({
  default: ({ url }: { url: string }) => <div data-testid="pet-vrm-view">{url}</div>,
}));

import PetRenderer from "../components/PetRenderer";

describe("PetRenderer", () => {
  beforeEach(() => {
    petRendererRuntime.state.activeRendererId = "fallback";
    localStorage.clear();
    petRendererRuntime.refreshPetRenderers.mockClear();
    petRendererRuntime.getActivePetRenderer.mockClear();
  });

  it("renders the Rive runtime when Rive is the active renderer", async () => {
    petRendererRuntime.state.activeRendererId = "rive";
    localStorage.setItem("agentrix_pet_rive_url", "https://cdn.agentrix.top/pets/default.riv");

    render(<PetRenderer />);

    expect(await screen.findByTestId("pet-rive-view")).toHaveTextContent("default.riv");
    expect(petRendererRuntime.refreshPetRenderers).toHaveBeenCalled();
  });

  it("prefers VRM over Rive when both renderers are available", async () => {
    petRendererRuntime.state.activeRendererId = "vrm";
    localStorage.setItem("agentrix_pet_rive_url", "https://cdn.agentrix.top/pets/default.riv");
    localStorage.setItem("agentrix_pet_vrm_url", "https://cdn.agentrix.top/pets/default.vrm");

    render(<PetRenderer />);

    expect(await screen.findByTestId("pet-vrm-view")).toHaveTextContent("default.vrm");
    expect(screen.queryByTestId("pet-rive-view")).not.toBeInTheDocument();
  });

  it("refreshes when a Rive asset hint is written after boot", async () => {
    render(<PetRenderer />);

    expect(screen.getByTestId("pet-canvas")).toBeInTheDocument();

    petRendererRuntime.state.activeRendererId = "rive";
    localStorage.setItem("agentrix_pet_rive_url", "https://cdn.agentrix.top/pets/late.riv");
    window.dispatchEvent(new CustomEvent("agentrix:pet-rive-changed", { detail: { url: "https://cdn.agentrix.top/pets/late.riv" } }));

    await waitFor(() => {
      expect(screen.getByTestId("pet-rive-view")).toHaveTextContent("late.riv");
    });
  });
});