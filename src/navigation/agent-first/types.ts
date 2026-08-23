export type AgentFirstAgentStackParamList = {
  AgentHome: undefined;
  GoalComposer: { agentId: string };
  CandidateCompare: {
    agentId: string;
    goalId: string;
  };
  AuthorityReview: { agentId: string; actionId: string };
  ActionTracking: { agentId: string; actionId: string; view?: 'tracking' | 'receipt' };
  Companion: { screen?: 'SummonRoot' | 'VoiceChat' } | undefined;
  HardwareAssurance: { agentId: string };
  AgentSoulCore: { agentId: string };
  DestinationError: { reason: string };
};

export type AgentFirstActionsStackParamList = {
  ActionsHome: { agentId?: string } | undefined;
  AuthorityReview: { agentId: string; actionId: string };
  ActionTracking: { agentId: string; actionId: string; view?: 'tracking' | 'receipt' };
};

export type AgentFirstWorkStackParamList = {
  WorkHome: { agentId?: string; fixture?: true | '1' } | undefined;
  ActionsHome: { agentId?: string } | undefined;
  AuthorityReview: { agentId: string; actionId: string };
  ActionTracking: { agentId: string; actionId: string; view?: 'tracking' | 'receipt' };
  WorkMachines: { agentId: string; machineRef?: string };
  WorkSessions: { agentId: string; sessionRef?: string; machineRef?: string; instructionRef?: string; actionRef?: string };
  WorkApprovals: { agentId?: string; approvalRef?: string; source?: 'push' | 'internal' };
  WorkReceipts: { agentId: string; actionRef?: string };
  WorkHandoffs: { agentId: string; handoffRef?: string };
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

export type AgentFirstEconomyStackParamList = {
  EconomyHome: undefined;
} & AgentFirstCreationStackParamList;

export type AgentFirstTabParamList = {
  Agent: undefined;
  Work: undefined;
  Economy: undefined;
  My: undefined;
  /** Hidden compatibility routes for existing companion/deep-link call sites. */
  Actions: undefined;
  Creation: undefined;
  World: undefined;
  Summon: undefined;
  Plaza: undefined;
  Me: undefined;
  Prediction: undefined;
  Lsm: undefined;
};
