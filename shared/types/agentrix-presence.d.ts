export type Surface = 'web' | 'desktop' | 'mobile' | 'watch' | 'glass';
export type Platform = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'wearos' | 'watchos' | 'web-chrome' | 'web-safari' | 'web-firefox' | 'web-edge' | 'glass-android' | 'glass-other';
export type TrustLevel = 0 | 1 | 2 | 3;
export type NetworkState = 'wifi' | 'cellular' | 'ethernet' | 'offline';
export type PetEmotion = 'happy' | 'focused' | 'concerned' | 'tired' | 'excited' | 'calm' | 'love' | 'sad' | 'angry' | 'sleepy';
export type EmotionIntensity = 0 | 1 | 2 | 3;
export interface PetState {
    pet_id: string;
    user_id: string;
    emotion: PetEmotion;
    emotion_intensity: EmotionIntensity;
    emotion_since: number;
    emotion_decay_at: number;
    intimacy_level: number;
    intimacy_xp: number;
    recent_memory_snippets: string[];
    unlocked_soul_template_ids?: string[];
    primary_agent_id: string;
    engine_switching: boolean;
    soul_template_id?: string | null;
    active_skin_id?: string | null;
    personality_overrides?: Record<string, unknown>;
    updated_at: number;
}
export interface DeviceNode {
    device_id: string;
    surface: Surface;
    platform: Platform;
    trust_level: TrustLevel;
    last_active_at: number;
    online: boolean;
    battery_pct?: number;
    locale?: string;
    agent_presence_version: string;
}
export interface UserDeviceGraph {
    user_id: string;
    devices: DeviceNode[];
    active_primary_surface: Surface;
    biometric_surface: Surface;
}
export type HandoffMode = 'handoff' | 'mirror';
export type HandoffTaskKind = 'chat' | 'coding' | 'approval' | 'voice' | 'visual';
export type HandoffStatus = 'pending' | 'accepted' | 'mirrored' | 'cancelled' | 'completed' | 'expired';
export interface HandoffSession {
    session_id: string;
    user_id: string;
    origin_surface: Surface;
    origin_device_id: string;
    started_at: number;
    last_heartbeat_at: number;
    task_kind: HandoffTaskKind;
    task_context_ref: string;
    handoff_mode: HandoffMode | null;
    target_surface: Surface | null;
    target_device_id: string | null;
    status: HandoffStatus;
}
export type RiskLevel = 0 | 1 | 2 | 3;
export type ApprovalActionKind = 'write' | 'pay' | 'transfer' | 'deploy' | 'delete';
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'timeout' | 'cancelled';
export type ApprovalMethod = 'tap' | 'biometric' | 'voice';
export interface ApprovalAction {
    kind: ApprovalActionKind;
    resource: string;
    amount_cents?: number;
    chain?: string;
    payload: unknown;
}
export interface ApprovalRecord {
    surface: Surface;
    device_id: string;
    at: number;
    method: ApprovalMethod;
}
export interface ApprovalRequest {
    request_id: string;
    user_id: string;
    action: ApprovalAction;
    risk_level: RiskLevel;
    initiator_surface: Surface;
    required_surfaces: Surface[];
    status: ApprovalStatus;
    created_at: number;
    expires_at: number;
    approvals: ApprovalRecord[];
}
export interface WalletBalance {
    chain: string;
    symbol: string;
    amount_raw: string;
    amount_usd_cents: number;
}
export interface AgentAccountProjection {
    agent_id: string;
    balance_usd_cents: number;
    auto_earn_today_cents: number;
    pending_splits_cents: number;
}
export type WalletTxKind = 'earn' | 'spend' | 'transfer' | 'split';
export type WalletTxSource = 'auto_earn' | 'a2a' | 'stripe' | 'manual';
export interface WalletTx {
    tx_id: string;
    kind: WalletTxKind;
    agent_id?: string;
    amount_usd_cents: number;
    at: number;
    source: WalletTxSource;
}
export interface StripeSubscriptionSummary {
    subscription_id: string;
    status: string;
    period_end: number;
}
export interface WalletProjection {
    user_id: string;
    as_of: number;
    balances: WalletBalance[];
    agent_accounts: AgentAccountProjection[];
    recent_txs: WalletTx[];
    stripe_subscriptions: StripeSubscriptionSummary[];
}
export type VitalKind = 'hr' | 'imu' | 'step' | 'sleep' | 'battery' | 'expression' | 'location';
export interface VitalEvent {
    user_id: string;
    source_device_id: string;
    kind: VitalKind;
    value: number | string | Record<string, unknown>;
    unit?: string;
    at: number;
    confidence: 0 | 1 | 2;
}
export type MemoryLayer = 'session' | 'agent' | 'user' | 'knowledge_base';
export type MemoryTag = 'work' | 'private' | 'family' | 'financial' | 'health' | 'relationship';
export interface MemoryQueryRequest {
    user_id: string;
    layer: MemoryLayer;
    agent_id?: string;
    query: string;
    top_k?: number;
    tags?: MemoryTag[];
}
export interface MemoryItem {
    memory_id: string;
    layer: MemoryLayer;
    agent_id?: string;
    content: string;
    tags: MemoryTag[];
    created_at: number;
    score?: number;
}
export interface MemoryWriteRequest {
    user_id: string;
    layer: MemoryLayer;
    agent_id?: string;
    content: string;
    tags: MemoryTag[];
    idempotency_key: string;
}
export interface PresenceHeartbeat {
    user_id: string;
    device_id: string;
    surface: Surface;
    platform: Platform;
    app_version: string;
    battery_pct?: number;
    network: NetworkState;
    foreground: boolean;
    last_user_input_at?: number;
    at: number;
}
export declare const PresenceTopics: {
    readonly presence: (userId: string) => string;
    readonly petState: (userId: string) => string;
    readonly petSoulChanged: (userId: string) => string;
    readonly petSkinChanged: (userId: string) => string;
    readonly handoff: (userId: string) => string;
    readonly approval: (userId: string) => string;
    readonly wallet: (userId: string) => string;
    readonly vitals: (userId: string) => string;
    readonly agentEvent: (userId: string, agentId: string) => string;
    readonly memoryChanged: (userId: string) => string;
    readonly economyEvent: (userId: string) => string;
    readonly surfacePrimaryChanged: (userId: string) => string;
};
export type TopicQoS = 'at-most-once' | 'at-least-once' | 'best-effort';
export type PresenceErrorCode = 'UNAUTHENTICATED' | 'TRUST_LEVEL_INSUFFICIENT' | 'SIGNING_SURFACE_MISMATCH' | 'HANDOFF_CONFLICT' | 'APPROVAL_EXPIRED' | 'RATE_LIMITED' | 'IDEMPOTENCY_REPLAY';
export interface PresenceError {
    code: PresenceErrorCode;
    message: string;
    details?: Record<string, unknown>;
}
export declare const AGENTRIX_PRESENCE_TYPES_VERSION = "3.0.0";
