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
  deployType: string;
  models?: string[];
  agentCount?: number;
  lastSyncAt?: string;
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
  return apiFetch<OpenClawInstanceInfo>('/openclaw/bind', {
    method: 'POST',
    body: JSON.stringify(payload),
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

// Get instance status / health
export async function getInstanceStatus(instanceId: string): Promise<{
  status: string;
  cpuPercent: number;
  memoryMb: number;
  uptimeSeconds: number;
  version: string;
}> {
  return apiFetch(`/openclaw/instances/${instanceId}/status`);
}

// Send a chat message to an agent via the instance
export async function sendAgentMessage(instanceId: string, message: string, sessionId?: string): Promise<{
  sessionId: string;
  reply: ChatMessage;
}> {
  return apiFetch(`/openclaw/proxy/${instanceId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message, sessionId }),
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
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

// Install a marketplace skill: first records to Agentrix DB, then pushes to OpenClaw instance
export async function installSkillToInstance(instanceId: string, skillId: string): Promise<void> {
  // 1. Record installation in Agentrix marketplace DB
  try {
    await apiFetch(`/skills/${skillId}/install`, { method: 'POST' });
  } catch (_) {
    // Fallback — skill may not have a marketplace entry
  }
  // 2. Push to live OpenClaw instance (uses skillId as both skillPackageUrl ref and skillId)
  return apiFetch(`/openclaw/proxy/${instanceId}/skills/install`, {
    method: 'POST',
    body: JSON.stringify({ skillId, skillPackageUrl: `/api/skills/${skillId}/pack/openclaw` }),
  });
}

// Restart instance
export async function restartInstance(instanceId: string): Promise<void> {
  return apiFetch(`/openclaw/proxy/${instanceId}/restart`, { method: 'POST' });
}

// Disconnect / unbind instance
export async function unbindInstance(instanceId: string): Promise<void> {
  return apiFetch(`/openclaw/instances/${instanceId}`, { method: 'DELETE' });
}

// ── Local Agent ────────────────────────────────────────────────────────────────

export interface ProvisionLocalResult {
  instanceId: string;
  relayToken: string;
  wsRelayUrl: string;
  downloadUrls: { win: string; mac: string };
}

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
