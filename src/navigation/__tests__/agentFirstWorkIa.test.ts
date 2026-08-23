import {
  AGENT_FIRST_DEFAULT_TAB,
  AGENT_FIRST_HIDDEN_ROLLBACK_TABS,
  AGENT_FIRST_VISIBLE_TABS,
  AGENT_HOME_DEFAULT_SURFACES,
  AGENT_STACK_DEFAULT_ROUTE,
  AGENT_STACK_REGULATED_EXCLUDED,
  AGENT_STACK_ROUTES,
  ECONOMY_STACK_SELLER_ROUTES,
  WORK_STACK_ACTION_ROUTES,
  agentSoulCoreStaysOnAgent,
  isRegulatedSecondarySurface,
  resolveAgentSoulCoreDestination,
} from "../agent-first/iaContract";

describe("Agent-first Work/Economy IA", () => {
  it("makes Agent / Work / Economy / My the visible flag-on tabs", () => {
    expect(AGENT_FIRST_VISIBLE_TABS).toEqual([
      "Agent",
      "Work",
      "Economy",
      "My",
    ]);
    expect(AGENT_FIRST_DEFAULT_TAB).toBe("Agent");
    expect(AGENT_FIRST_HIDDEN_ROLLBACK_TABS).toEqual(
      expect.arrayContaining(["Actions", "Creation", "Prediction", "Lsm"]),
    );
  });

  it("keeps Action under Work and Creation under Economy/Seller", () => {
    expect(WORK_STACK_ACTION_ROUTES).toEqual(
      expect.arrayContaining(["ActionsHome"]),
    );
    expect(ECONOMY_STACK_SELLER_ROUTES).toEqual(
      expect.arrayContaining(["CreationHome"]),
    );
  });

  it("keeps Prediction/LSM out of the Agent default stack", () => {
    expect(AGENT_STACK_DEFAULT_ROUTE).toBe("AgentHome");
    expect(AGENT_STACK_REGULATED_EXCLUDED).toEqual(["Prediction", "Lsm"]);
    expect(isRegulatedSecondarySurface("Prediction")).toBe(true);
    expect(AGENT_STACK_ROUTES).not.toContain("Prediction");
    expect(AGENT_STACK_ROUTES).not.toContain("Lsm");
    expect(AGENT_STACK_ROUTES).toContain("AgentSoulCore");
  });

  it("keeps Prediction/LSM off the Agent Home default surfaces", () => {
    expect(AGENT_HOME_DEFAULT_SURFACES).toEqual([
      "Companion",
      "HardwareAssurance",
    ]);
    expect(AGENT_HOME_DEFAULT_SURFACES).not.toContain("Prediction");
    expect(AGENT_HOME_DEFAULT_SURFACES).not.toContain("Lsm");
  });

  it("keeps AgentSoulCore on the Agent stack instead of redirecting to My", () => {
    const destination = resolveAgentSoulCoreDestination("agent-1");
    expect(destination).toEqual({
      tab: "Agent",
      screen: "AgentSoulCore",
      params: { agentId: "agent-1" },
    });
    expect(agentSoulCoreStaysOnAgent(destination)).toBe(true);
    expect(destination.tab).not.toBe("My");
  });
});
