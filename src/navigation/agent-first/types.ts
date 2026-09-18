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
  /** Agent Passport, read-only (matrix row 41; integration note §2). `agentId` = agentAccountId. */
  AgentPassport: { agentId: string };
  DestinationError: { reason: string };
};

export type AgentFirstActionsStackParamList = {
  ActionsHome: { agentId?: string } | undefined;
  AuthorityReview: { agentId: string; actionId: string };
  ActionTracking: { agentId: string; actionId: string; view?: 'tracking' | 'receipt' };
};

/**
 * Work tab (M2 slice A3, decision d-50). `agentId` / `*Ref` are opaque refs
 * already validated by `normalizeWorkRoutePath` (deep link) or
 * `parseDeveloperWorkspaceOpenRoute` (in-app); `fixture: '1'` selects the
 * local contract-fixture presentation (Maestro 91-v7, never live success).
 */
export type AgentFirstWorkStackParamList = {
  WorkHome: { agentId?: string; fixture?: string } | undefined;
  WorkMachines: { agentId: string; machineRef?: string; fixture?: string };
  WorkSessions: {
    agentId: string;
    sessionRef?: string;
    machineRef?: string;
    instructionRef?: string;
    actionRef?: string;
    fixture?: string;
  };
  WorkApprovals: {
    agentId?: string;
    approvalRef?: string;
    source?: 'push' | 'internal';
    fixture?: string;
  } | undefined;
  WorkReceipts: { agentId: string; actionRef?: string; fixture?: string };
  WorkHandoffs: { agentId: string; handoffRef?: string; fixture?: string };
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
