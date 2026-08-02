export type AgentFirstAgentStackParamList = {
  AgentHome: undefined;
  GoalComposer: { agentId: string };
  CandidateCompare: {
    agentId: string;
    goalId: string;
  };
  AuthorityReview: { agentId: string; actionId: string };
  ActionTracking: { agentId: string; actionId: string; view?: 'tracking' | 'receipt' };
  Companion: undefined;
  Prediction: undefined;
  Lsm: undefined;
  HardwareAssurance: { agentId: string };
  AgentSoulCore: { agentId: string };
  DestinationError: { reason: string };
};

export type AgentFirstActionsStackParamList = {
  ActionsHome: { agentId?: string } | undefined;
  AuthorityReview: { agentId: string; actionId: string };
  ActionTracking: { agentId: string; actionId: string; view?: 'tracking' | 'receipt' };
};

export type AgentFirstCreationStackParamList = {
  CreationHome: undefined;
  CreationFeed: undefined;
  CreationCreator: { type?: string } | undefined;
  CreationExperience: { creationId: string; type?: string; title?: string; item?: unknown };
  CreationDetail: { creationId: string; title?: string; item?: unknown };
  MyWorld: undefined;
  UnifiedWorldMap: undefined;
  WorldCreationMarketplace: undefined;
};

export type AgentFirstTabParamList = {
  Agent: undefined;
  Actions: undefined;
  Creation: undefined;
  My: undefined;
  /** Hidden compatibility routes for existing companion/deep-link call sites. */
  World: undefined;
  Summon: undefined;
  Plaza: undefined;
  Me: undefined;
};
