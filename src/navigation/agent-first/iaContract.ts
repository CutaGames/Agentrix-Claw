export const AGENT_FIRST_VISIBLE_TABS = [
  "Agent",
  "Work",
  "Economy",
  "My",
] as const;
export const AGENT_FIRST_HIDDEN_ROLLBACK_TABS = [
  "Actions",
  "Creation",
  "World",
  "Summon",
  "Plaza",
  "Me",
  "Prediction",
  "Lsm",
] as const;
export const AGENT_FIRST_DEFAULT_TAB = "Agent" as const;
export const AGENT_STACK_DEFAULT_ROUTE = "AgentHome" as const;
export const AGENT_STACK_ROUTES = [
  "AgentHome",
  "GoalComposer",
  "CandidateCompare",
  "AuthorityReview",
  "ActionTracking",
  "Companion",
  "HardwareAssurance",
  "AgentSoulCore",
  "DestinationError",
] as const;
export const AGENT_STACK_REGULATED_EXCLUDED = ["Prediction", "Lsm"] as const;
export const AGENT_HOME_DEFAULT_SURFACES = [
  "Companion",
  "HardwareAssurance",
] as const;
export const WORK_STACK_ACTION_ROUTES = [
  "ActionsHome",
  "AuthorityReview",
  "ActionTracking",
] as const;
export const ECONOMY_STACK_SELLER_ROUTES = [
  "CreationHome",
  "CreationFeed",
  "CreationCreator",
  "CreationExperience",
  "CreationDetail",
] as const;

export function isAgentFirstVisibleTab(name: string): boolean {
  return (AGENT_FIRST_VISIBLE_TABS as readonly string[]).includes(name);
}

export function isRegulatedSecondarySurface(name: string): boolean {
  return (AGENT_STACK_REGULATED_EXCLUDED as readonly string[]).includes(name);
}

export function resolveAgentSoulCoreDestination(agentId: string): {
  tab: "Agent";
  screen: "AgentSoulCore";
  params: { agentId: string };
} {
  return {
    tab: "Agent",
    screen: "AgentSoulCore",
    params: { agentId },
  };
}

export function agentSoulCoreStaysOnAgent(
  destination: ReturnType<typeof resolveAgentSoulCoreDestination>,
): boolean {
  return destination.tab === "Agent" && destination.screen === "AgentSoulCore";
}
