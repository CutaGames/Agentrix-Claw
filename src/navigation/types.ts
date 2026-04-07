// ---- Navigation Types for ClawLink ----

export type AuthStackParamList = {
  Login: undefined;
  AuthCallback: { code?: string; token?: string; provider?: string };
  WalletConnect: { walletId?: string } | undefined;
};

export type OnboardingStackParamList = {
  DeploySelect: undefined;
  CloudDeploy: undefined;
  ConnectExisting: undefined;
  LocalDeploy: { directScan?: boolean } | undefined;
  SocialBind: { instanceId: string; platform?: 'telegram' };
};

export type AgentStackParamList = {
  AgentConsole: undefined;
  AgentChat: { instanceId?: string; instanceName?: string; voiceMode?: boolean; duplexMode?: boolean };
  WearableHub: undefined;
  WearableMonitor: { deviceId?: string };
  OpenClawBind: undefined;
  /** Deep-link target for the desktop installer QR code: agentrix://connect?instanceId=...&token=...&host=...&port=... */
  LocalConnect: { instanceId?: string; token?: string; host?: string; port?: string };
  Scan: undefined;
  SkillInstall: { skillId: string; skillName: string };
  SkillPack: undefined;
  StoragePlan: undefined;
  AgentLogs: undefined;
  DesktopControl: undefined;
  MemoryManagement: undefined;
  AgentMemory: undefined;
  AcpSessions: undefined;
  WorkflowList: undefined;
  WorkflowDetail: { workflowId?: string };
  AgentAccount: undefined;
  AgentBalance: { agentAccountId: string; agentName: string };
  AgentPermissions: { agentAccountId?: string } | undefined;
  AgentTools: { instanceId?: string };
  // Agent Space (collaboration rooms)
  AgentSpace: { spaceId: string; spaceName: string };
  // Layer 2
  VoiceChat: { instanceId?: string; instanceName?: string };
  TeamSpace: undefined;
  TeamInvite: { workspaceId: string; workspaceName: string };
  // From Onboarding reuse
  DeploySelect: undefined;
  CloudDeploy: undefined;
  ConnectExisting: undefined;
  LocalDeploy: { directScan?: boolean } | undefined;
  SocialBind: { instanceId: string; platform?: 'telegram' };
};

export type ShareCardRouteParams = {
  shareUrl: string;
  title?: string;
  userName?: string;
  subtitle?: string;
  headerEmoji?: string;
  categoryLabel?: string;
  priceLabel?: string;
  statsLabel?: string;
  description?: string;
  tags?: string[];
  ctaLabel?: string;
  accentFrom?: string;
  accentTo?: string;
};

export type MarketStackParamList = {
  Marketplace: undefined;
  SkillDetail: { skillId: string; skillName: string };
  Checkout: { skillId: string; skillName?: string };
  TaskMarket: undefined;
  TaskDetail: { taskId: string };
  PublishTask: undefined;
  PostTask: undefined;
  CreateLink: { skillId: string; skillName: string; skillPrice?: number; skillPriceUnit?: string };
  SkillInstall: { skillId: string; skillName: string };
  ShareCard: ShareCardRouteParams;
};

export type SocialStackParamList = {
  // Agent Showcase Feed
  Feed: undefined;
  PostDetail: { postId: string };
  ShowcaseDetail: { postId: string };
  UserProfile: { userId: string };
  // Agent Social Bridge
  SocialListener: undefined;
};

export type ChatStackParamList = {
  ChatList: undefined;
  DirectMessage: { userId: string; userName: string; userAvatar?: string };
  GroupChat: { groupId: string; groupName: string };
};

export type MeStackParamList = {
  Profile: undefined;
  Scan: undefined;
  ReferralDashboard: undefined;
  Settings: undefined;
  ApiKeys: undefined;
  Account: undefined;
  MySkills: undefined;
  MyOrders: undefined;
  WalletConnect: undefined;
  WalletSetup: undefined;
  WalletBackup: undefined;
  NotificationCenter: undefined;
  ShareCard: ShareCardRouteParams;
  SocialListener: undefined;
  LocalAiModel: undefined;
  WearableHub: undefined;
};

export type DiscoverStackParamList = {
  DiscoverHome: undefined;
  // Market screens
  Marketplace: undefined;
  SkillDetail: { skillId: string; skillName: string };
  Checkout: { skillId: string; skillName?: string };
  TaskMarket: undefined;
  TaskDetail: { taskId: string };
  PublishTask: undefined;
  PostTask: undefined;
  CreateLink: { skillId: string; skillName: string; skillPrice?: number; skillPriceUnit?: string };
  SkillInstall: { skillId: string; skillName: string };
  ShareCard: ShareCardRouteParams;
  // Social screens
  Feed: undefined;
  PostDetail: { postId: string };
  ShowcaseDetail: { postId: string };
  UserProfile: { userId: string };
  SocialListener: undefined;
};

export type TeamStackParamList = {
  TeamDashboard: undefined;
  TeamApprovalDetail: { notificationId: string; title: string };
  TeamSpace: undefined;
  TeamInvite: { workspaceId: string; workspaceName: string };
  TeamAgentAccounts: undefined;
  TaskBoard: undefined;
  TaskDetail: { taskId: string };
  AgentProfile: {
    agentId: string;
    codename: string;
    name: string;
    status: string;
    modelTier: string;
  };
};

export type MainTabParamList = {
  Agent: undefined;
  Discover: undefined;
  Team: undefined;
  Me: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  InvitationGate: undefined;
  Onboarding: undefined;
  Main: undefined;
};
