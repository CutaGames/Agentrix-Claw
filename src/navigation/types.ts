// ---- Navigation Types for Agentrix Mobile ----
//
// 2026-05-10 Refactor (MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 Sprint A):
//   4 new canonical tabs → Home / Summon / Plaza / Me
//   Legacy tab names (Today/Agent/Pet/Team/Wallet/Discover) are kept as
//   hidden aliases so existing `navigate('Agent', ...)` call sites still
//   work while we migrate incrementally. See legacyRouteTable.ts for the
//   deep-link mapping.

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

// ── Legacy AgentStack (still used by many screens, pointed at from new Home/Summon)
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
  // OpenClaw 4.5 features
  DreamingDashboard: undefined;
  PluginHub: undefined;
  MemoryWiki: undefined;
  McpManager: undefined;
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
  ChatList: undefined;
  DMList: undefined;
  DirectMessage: { userId: string; userName: string; userAvatar?: string };
  DMChat: { userId: string; userName: string; userAvatar?: string };
  GroupChat: { groupId: string; groupName: string };
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
  CompanionSettings: undefined;
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
  // Refactor additions (Sprint A/D):
  Subscribe: undefined;
  AxpCenter: undefined;
  AxpRewardShop: undefined;
  // Sprint 4: Toy Binding
  ToyBinding: undefined;
};

export type DiscoverStackParamList = {
  DiscoverHome: undefined;
  Predict: undefined;
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

// ── New 4-Tab Stacks (Sprint A) ────────────────────────────────────────────

/**
 * 🏠 Home Stack — 主宠陪伴仪表（Pet-as-Agent home dashboard）
 * Contains: HomeScreen + pet drawer entries (Wallet/Memory/Skills/Play/Wardrobe/Soul/Breed/Identity/Creator/Permissions/Space)
 * Plus Co-Raising (共养) multiplayer entries.
 */
export type HomeStackParamList = {
  HomeRoot: undefined;
  // Pet drawer (10 entries)
  PetCompanion: undefined;
  PetSkills: undefined;
  PetTasks: undefined;
  PetWallet: undefined;
  PetWalletBalance: { agentAccountId: string; agentName: string };
  PetMemory: undefined;
  PetMemoryDreaming: undefined;
  PetMemoryLogs: undefined;
  PetPlay: undefined;
  PetWardrobe: undefined;
  PetSoul: undefined;
  PetBreed: undefined;
  PetIdentity: undefined;
  PetCreator: undefined;
  PetCameraScan: undefined;
  NftMint: undefined;
  PetPermissions: { agentAccountId?: string } | undefined;
  PetSpace: { spaceId: string; spaceName: string };
  PetTeam: undefined;
  PetWorkflow: undefined;
  PetWorkflowDetail: { workflowId?: string };
  // Co-Raising (multiplayer Phase 1 α)
  CoRaisingInvite: undefined;
  CoRaisingLanding: { token?: string };
  CoRaisingActivity: undefined;
  // Plan Approval (legacy reused)
  PlanApproval: undefined;
};

/**
 * 🔮 Summon Stack — 多宠 × 场景会话中心
 * The conversational Agent is called "Summon" here — "召唤主宠对话".
 * Multi-session tabs handled inside SummonScreen, not via stack.
 */
export type SummonStackParamList = {
  SummonRoot: { sessionId?: string } | undefined;
  VoiceChat: { instanceId?: string; instanceName?: string };
};

/**
 * 🎪 Plaza Stack — 经济 + 社交 + 游戏
 * 5 segmented sections inside PlazaScreen: Feed / Skills / Tasks / Pets / Play
 */
export type PlazaStackParamList = {
  PlazaRoot: undefined;
  // Feed
  Feed: undefined;
  PostDetail: { postId: string };
  ShowcaseDetail: { postId: string };
  UserProfile: { userId: string };
  CreatePost: undefined;
  // Messaging (DM + Group)
  Messaging: undefined;
  DirectMessage: { userId: string; userName: string; userAvatar?: string };
  GroupChat: { groupId: string; groupName: string };
  // Skills market
  Skills: undefined;
  SkillDetail: { skillId: string; skillName: string };
  Checkout: { skillId: string; skillName?: string };
  SkillInstall: { skillId: string; skillName: string };
  // Tasks market
  Tasks: undefined;
  TaskDetail: { taskId: string };
  PostTask: undefined;
  // Pets market (Phase 1 MVP = Skin Auction)
  Pets: undefined;
  PetsSkins: undefined;
  SkinAuctionDetail: { auctionId: string };
  PetAuctionDetail: { auctionId: string };
  // Play (Predict + multiplayer + mini-games)
  Play: undefined;
  Predict: undefined;
  // G1 Photo Mimic Game (docs/G1_PHOTO_MIMIC_GAME_2026-05)
  PhotoMimic: undefined;
  // Co-Raising entry from Plaza
  CoRaisingInvite: undefined;
  CoRaisingLanding: { token?: string };
  // Greeting Cards (multiplayer Phase 1 δ)
  GreetingCardCompose: undefined;
  GreetingCardInbox: undefined;
  // Share card generator
  ShareCard: ShareCardRouteParams;
  CreateLink: { skillId: string; skillName: string; skillPrice?: number; skillPriceUnit?: string };
  // Toy custom
  ToyCustom: undefined;
};

// ── Main Tab (P-9 Companion Redesign T2.2: 4 visible only, no hidden legacies) ──

export type MainTabParamList = {
  // 🌍 World — World Engine + create digital character (default initial route)
  World: undefined;
  // 🔮 Summon — multi-session conversation surface
  Summon: undefined;
  // 🎪 Plaza — feed / market / messaging / play
  Plaza: undefined;
  // 👤 Me — user, wallet, settings, companion settings, etc.
  Me: undefined;
};

// Re-export WorldStackParamList from the navigator file for cross-tab nav typing.
export type { WorldStackParamList } from './WorldStackNavigator';

export type RootStackParamList = {
  Auth: undefined;
  InvitationGate: undefined;
  Onboarding: undefined;
  Main: undefined;
};
