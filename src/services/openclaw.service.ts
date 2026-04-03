// OpenClaw Connection Service
import { apiFetch } from './api';
import * as SecureStore from 'expo-secure-store';

export interface BindPayload {
  instanceUrl: string;
  apiToken: string;
  instanceName?: string;
  deployType?: 'cloud' | 'local' | 'server' | 'existing';
}

export interface OpenClawInstanceInfo {
  id: string;
  name: string;
  instanceUrl: string;
  status: 'active' | 'disconnected' | 'error';
  version?: string;
  deployType?: string;
  instanceType?: string;
  models?: string[];
  agentCount?: number;
  lastSyncAt?: string;
  updatedAt?: string;
  relayToken?: string;
  relayConnected?: boolean;
  agentAccountId?: string;
  metadata?: {
    agentAccountId?: string;
    [key: string]: any;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokens?: number;
}

export interface AgentTask {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'pending';
  input: string;
  output?: string;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

// Bind a new OpenClaw instance (manual input or QR scan result)
export async function bindOpenClaw(payload: BindPayload): Promise<OpenClawInstanceInfo> {
  // Map client-side field names to backend DTO field names
  const body = {
    instanceUrl: payload.instanceUrl,
    instanceToken: payload.apiToken ?? '',
    name: payload.instanceName || 'My Local Agent',
    deployType: payload.deployType,
  };
  return apiFetch<OpenClawInstanceInfo>('/openclaw/bind', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// Create a new QR bind session (get a QR code for user to scan from their OpenClaw)
export async function createBindSession(): Promise<{ sessionId: string; qrData: string; expiresAt: number }> {
  return apiFetch('/openclaw/bind-session', { method: 'POST' });
}

// Poll bind session status (after user scans QR on their OpenClaw)
export async function pollBindSession(sessionId: string): Promise<{
  status: 'pending' | 'confirmed' | 'expired';
  instance?: OpenClawInstanceInfo;
}> {
  return apiFetch(`/openclaw/bind-session/${sessionId}`);
}

// Provision a new cloud-hosted OpenClaw instance
export async function provisionCloudAgent(opts: {
  name: string;
  llmProvider: string;
}): Promise<OpenClawInstanceInfo> {
  return apiFetch<OpenClawInstanceInfo>('/openclaw/cloud/provision', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

// Get all user's instances
export async function getMyInstances(): Promise<OpenClawInstanceInfo[]> {
  return apiFetch<OpenClawInstanceInfo[]>('/openclaw/instances');
}

// Get a single instance by ID (used to poll for async SSH provisioning)
export async function getInstanceById(instanceId: string): Promise<OpenClawInstanceInfo> {
  return apiFetch<OpenClawInstanceInfo>(`/openclaw/instances/${instanceId}`);
}

export async function bindAgentAccountToInstance(instanceId: string, agentAccountId?: string | null): Promise<OpenClawInstanceInfo> {
  return apiFetch<OpenClawInstanceInfo>(`/openclaw/instances/${instanceId}/agent-account`, {
    method: 'PATCH',
    body: JSON.stringify({ agentAccountId: agentAccountId ?? null }),
  });
}

// Get instance status / health
export async function getInstanceStatus(instanceId: string): Promise<{
  status: string;
  cpuPercent: number;
  memoryMb: number;
  uptimeSeconds: number;
  version: string;
}> {
  return apiFetch(`/openclaw/proxy/${instanceId}/status`);
}

// Send a chat message to an agent via the instance
export async function sendAgentMessage(instanceId: string, message: string, sessionId?: string, model?: string): Promise<{
  sessionId: string;
  reply: ChatMessage;
}> {
  return apiFetch(`/openclaw/proxy/${instanceId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message, sessionId, model }),
  });
}

// Get agent chat history
export async function getAgentHistory(instanceId: string, sessionId?: string, limit = 50): Promise<ChatMessage[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (sessionId) q.set('sessionId', sessionId);
  return apiFetch(`/openclaw/proxy/${instanceId}/history?${q}`);
}

// Get skills installed on instance
export async function getInstanceSkills(instanceId: string): Promise<{
  id: string;
  name: string;
  enabled: boolean;
  version: string;
}[]> {
  return apiFetch(`/openclaw/proxy/${instanceId}/skills`);
}

// Toggle skill enable/disable
export async function toggleSkill(instanceId: string, skillId: string, enabled: boolean): Promise<void> {
  return apiFetch(`/openclaw/proxy/${instanceId}/skills/${skillId}/toggle`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
}

// Install a marketplace skill: first records to Agentrix DB, then pushes to OpenClaw instance
export async function installSkillToInstance(instanceId: string, skillId: string): Promise<any> {
  let dbRecorded = false;
  let dbError: string | null = null;
  let proxyError: string | null = null;

  // 1. Record installation in Agentrix marketplace DB
  try {
    await apiFetch(`/skills/${skillId}/install`, { method: 'POST' });
    dbRecorded = true;
  } catch (e: any) {
    // Hub skills may not have marketplace entries — always try bridge endpoint as fallback
    // (Hub skills can have UUID IDs or various prefixes)
    try {
      await apiFetch(`/openclaw/bridge/${instanceId}/skill-hub-install`, {
        method: 'POST',
        body: JSON.stringify({ skillId }),
      });
      dbRecorded = true;
    } catch (bridgeErr: any) {
      if (e?.message?.includes('already installed') || e?.message?.includes('Conflict')) {
        dbRecorded = true; // Already installed is fine
      } else {
        dbError = bridgeErr?.message || e?.message || 'Install failed';
      }
    }
  }

  // 2. Activate on the target claw (platform-hosted claws activate immediately;
  // disconnected local claws may explicitly return pendingDeploy=true).
  let proxyResult: any = {};
  try {
    proxyResult = await apiFetch(`/openclaw/proxy/${instanceId}/skills/install`, {
      method: 'POST',
      body: JSON.stringify({ skillId }),
    });
  } catch (proxyErr: any) {
    proxyError = proxyErr?.message || 'Skill activation failed on claw';
    proxyResult = { success: false, pendingDeploy: false, proxyFailed: true, message: proxyError };
  }

  // If both DB record and proxy push failed, throw an error
  if (!dbRecorded && proxyResult?.pendingDeploy !== true && !proxyResult?.success) {
    throw new Error(dbError || 'Install failed. Please try again.');
  }

  // DB-only success is not enough for a live claw unless backend explicitly said pendingDeploy.
  if (dbRecorded && proxyError && proxyResult?.pendingDeploy !== true) {
    throw new Error(`Skill was saved to your account, but activation on this claw failed: ${proxyError}`);
  }

  return { ...(proxyResult || {}), dbRecorded, dbError, proxyError };
}

// Restart instance
export async function restartInstance(instanceId: string): Promise<void> {
  return apiFetch(`/openclaw/proxy/${instanceId}/restart`, { method: 'POST' });
}

// Disconnect / unbind instance
export async function unbindInstance(instanceId: string): Promise<void> {
  return apiFetch(`/openclaw/instances/${instanceId}`, { method: 'DELETE' });
}

// Batch delete instances by status (e.g. 'error')
export async function batchCleanupInstances(status: string = 'error'): Promise<{ deleted: number }> {
  return apiFetch(`/openclaw/instances?status=${encodeURIComponent(status)}`, { method: 'DELETE' });
}

// ── Model Switching ────────────────────────────────────────────────────────────

export interface AvailableModel {
  id: string;
  label: string;
  provider: string;
  bedrockModelId?: string;
  icon: string;
  badge?: string;
  availability: 'available' | 'coming_soon' | 'requires_key';
  costTier: 'free_trial' | 'starter' | 'pro';
}

/** Fetch available models from backend */
export async function getAvailableModels(): Promise<AvailableModel[]> {
  return apiFetch<AvailableModel[]>('/openclaw/models');
}

/** Get the currently active model for an instance */
export async function getInstanceModel(instanceId: string): Promise<{ modelId: string; model: AvailableModel | null }> {
  return apiFetch(`/openclaw/instances/${instanceId}/model`);
}

/** Switch model for an instance (both cloud and local) */
export async function switchInstanceModel(instanceId: string, modelId: string): Promise<{
  success: boolean;
  modelId: string;
  model: AvailableModel;
  pushed: boolean;
  message: string;
}> {
  return apiFetch(`/openclaw/instances/${instanceId}/model`, {
    method: 'PATCH',
    body: JSON.stringify({ modelId }),
  });
}

// ── Local Agent ────────────────────────────────────────────────────────────────

export interface ProvisionLocalResult {
  instanceId: string;
  relayToken: string;
  wsRelayUrl: string;
  downloadUrls: { win: string; mac: string };
}

export interface RegisterLocalRelayResult extends OpenClawInstanceInfo {}

/** Create a new LOCAL-type instance and get relay token + download links */
export async function provisionLocalAgent(opts: {
  name: string;
  os?: 'android' | 'ios';
}): Promise<ProvisionLocalResult> {
  return apiFetch<ProvisionLocalResult>('/openclaw/local/provision', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export async function registerLocalRelayAgent(opts: {
  relayToken: string;
  name?: string;
  wsRelayUrl?: string;
}): Promise<OpenClawInstanceInfo> {
  return apiFetch<OpenClawInstanceInfo>('/openclaw/local/register', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

/** Check whether the local agent binary is connected to the relay */
export async function getRelayStatus(instanceId: string): Promise<{ connected: boolean; instanceId: string }> {
  return apiFetch(`/openclaw/local/${instanceId}/relay-status`);
}

// ── Social Binding ─────────────────────────────────────────────────────────────

export interface TelegramQrResult {
  deepLink: string;
  relayToken: string;
  platform: 'telegram';
}

/** Generate a Telegram deep-link QR for binding this instance */
export async function generateTelegramQr(instanceId: string): Promise<TelegramQrResult> {
  return apiFetch<TelegramQrResult>('/openclaw/social/telegram/qr', {
    method: 'POST',
    body: JSON.stringify({ instanceId }),
  });
}

/** Unlink Telegram from an instance */
export async function unlinkTelegram(instanceId: string): Promise<void> {
  return apiFetch(`/openclaw/social/telegram/${instanceId}`, { method: 'DELETE' });
}

// Stream chat using WebSocket — returns cleanup function
export function streamAgentChat(
  instanceId: string,
  message: string,
  sessionId: string | undefined,
  onChunk: (chunk: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: string) => void,
  token: string
): () => void {
  const WS_BASE = 'wss://api.agentrix.top';
  const ws = new WebSocket(
    `${WS_BASE}/openclaw/proxy/${instanceId}/stream?token=${encodeURIComponent(token)}`
  );

  let fullText = '';

  ws.onopen = () => {
    ws.send(JSON.stringify({ message, sessionId }));
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data as string);
      if (data.type === 'chunk') {
        fullText += data.content;
        onChunk(data.content);
      } else if (data.type === 'done') {
        onDone(fullText);
        ws.close();
      }
    } catch (_) {
      onChunk(e.data as string);
      fullText += e.data as string;
    }
  };

  ws.onerror = () => onError('Connection error');
  ws.onclose = (_e) => { /* cleanup */ };

  return () => ws.close();
}

// ── Storage / Plan ─────────────────────────────────────────────────────────────

export type StorageTier = 'free' | 'starter' | 'pro';

export interface StorageInfo {
  tier: StorageTier;
  totalGb: number;
  usedGb: number;
  availableGb: number;
  usedPercent: number;
  /** Is this the early-access free grant? */
  isGiftStorage: boolean;
  /** Plans user can upgrade to */
  upgradePlans: StoragePlan[];
}

export interface StoragePlan {
  tier: StorageTier;
  storageGb: number;
  priceUsdPerMonth: number;
  label: string;
  highlight: boolean;
}

/** Fetch current user's storage usage and available plans */
export async function getStorageInfo(): Promise<StorageInfo> {
  return apiFetch<StorageInfo>('/openclaw/storage/info');
}

/** Initiate plan upgrade (returns a Stripe/payment checkout URL) */
export async function upgradeStoragePlan(tier: StorageTier): Promise<{ checkoutUrl: string }> {
  return apiFetch('/openclaw/storage/upgrade', {
    method: 'POST',
    body: JSON.stringify({ tier }),
  });
}

// ═══════════════════════════════════════════════════════════
// Platform Tools — Agentrix platform capabilities for claws
// ═══════════════════════════════════════════════════════════

export interface PlatformTool {
  name: string;
  displayName: string;
  description: string;
  category: string;
  enabledByDefault: boolean;
  icon: string;
  type: 'platform';
}

export interface PlatformToolResult {
  success: boolean;
  tool: string;
  result?: any;
  error?: string;
  executionTime?: number;
}

/** Get available platform tools for a claw instance */
export async function getPlatformTools(instanceId: string): Promise<{
  tools: PlatformTool[];
  total: number;
  defaultEnabled: string[];
}> {
  return apiFetch(`/openclaw/proxy/${instanceId}/platform-tools`);
}

/** Execute a single platform tool */
export async function executePlatformTool(
  instanceId: string,
  tool: string,
  params: Record<string, any> = {},
): Promise<PlatformToolResult> {
  return apiFetch<PlatformToolResult>(`/openclaw/proxy/${instanceId}/platform-tools/execute`, {
    method: 'POST',
    body: JSON.stringify({ tool, params }),
  });
}

/** Batch-execute multiple platform tools */
export async function executePlatformToolBatch(
  instanceId: string,
  calls: Array<{ tool: string; params: Record<string, any> }>,
): Promise<{ results: PlatformToolResult[]; total: number; succeeded: number; failed: number }> {
  return apiFetch(`/openclaw/proxy/${instanceId}/platform-tools/batch`, {
    method: 'POST',
    body: JSON.stringify({ calls }),
  });
}

// Convenience wrappers for common platform tools

/** Search marketplace + ClawHub skills via platform tool */
export async function agentSkillSearch(
  instanceId: string,
  query: string,
  category?: string,
  limit = 10,
): Promise<PlatformToolResult> {
  return executePlatformTool(instanceId, 'skill_search', { query, category, limit });
}

/** Install a skill via platform tool */
export async function agentSkillInstall(
  instanceId: string,
  skillId: string,
  config?: Record<string, any>,
): Promise<PlatformToolResult> {
  return executePlatformTool(instanceId, 'skill_install', { skillId, config });
}

/** Get AI skill recommendations via platform tool */
export async function agentSkillRecommend(
  instanceId: string,
  intent?: string,
  category?: string,
  limit = 5,
): Promise<PlatformToolResult> {
  return executePlatformTool(instanceId, 'skill_recommend', { intent, category, limit });
}

/** Purchase a skill from marketplace via platform tool */
export async function agentMarketplacePurchase(
  instanceId: string,
  skillId: string,
  paymentMethod: 'wallet' | 'x402' = 'wallet',
): Promise<PlatformToolResult> {
  return executePlatformTool(instanceId, 'marketplace_purchase', { skillId, paymentMethod });
}

/** Post a task/bounty via platform tool */
export async function agentTaskPost(
  instanceId: string,
  title: string,
  description: string,
  budget: number,
  currency = 'USDC',
): Promise<PlatformToolResult> {
  return executePlatformTool(instanceId, 'task_post', { title, description, budget, currency });
}

/** Search tasks on marketplace via platform tool */
export async function agentTaskSearch(
  instanceId: string,
  query?: string,
  limit = 10,
): Promise<PlatformToolResult> {
  return executePlatformTool(instanceId, 'task_search', { query, limit });
}
