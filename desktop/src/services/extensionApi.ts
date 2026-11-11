/**
 * P6+P7 Desktop API client — Hooks, Slash Commands, MCP Servers, Session Export/Fork, Search
 */

import { apiFetch, API_BASE } from './store';

// ═══════════════════════════════════════════════════════════════════════
// Hooks (P6.1)
// ═══════════════════════════════════════════════════════════════════════

export async function listHooks(token: string) {
  const res = await apiFetch(`${API_BASE}/hooks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createHook(token: string, data: {
  eventType: string;
  handlerType?: string;
  handler: string;
  priority?: number;
  filter?: any;
  config?: any;
  description?: string;
}) {
  const res = await apiFetch(`${API_BASE}/hooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteHook(token: string, hookId: string) {
  const res = await apiFetch(`${API_BASE}/hooks/${hookId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

export async function toggleHook(token: string, hookId: string, enabled: boolean) {
  const res = await apiFetch(`${API_BASE}/hooks/${hookId}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════
// Custom Slash Commands (P6.2)
// ═══════════════════════════════════════════════════════════════════════

export async function listSlashCommands(token: string) {
  const res = await apiFetch(`${API_BASE}/slash-commands`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createSlashCommand(token: string, data: {
  name: string;
  description?: string;
  promptTemplate: string;
  parameters?: Array<{ name: string; description?: string; required?: boolean }>;
}) {
  const res = await apiFetch(`${API_BASE}/slash-commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function resolveSlashCommand(token: string, name: string, args: string) {
  const res = await apiFetch(`${API_BASE}/slash-commands/${encodeURIComponent(name)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ args }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════
// MCP Servers (P6.3)
// ═══════════════════════════════════════════════════════════════════════

export async function listMcpServers(token: string) {
  const res = await apiFetch(`${API_BASE}/mcp-servers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function registerMcpServer(token: string, data: {
  name: string;
  description?: string;
  transport: string;
  url?: string;
  command?: string;
  args?: string[];
  auth?: any;
}) {
  const res = await apiFetch(`${API_BASE}/mcp-servers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function discoverMcpTools(token: string, serverId: string) {
  const res = await apiFetch(`${API_BASE}/mcp-servers/${serverId}/discover`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteMcpServer(token: string, serverId: string) {
  const res = await apiFetch(`${API_BASE}/mcp-servers/${serverId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

// P3: OAuth token exchange for MCP server
export async function exchangeMcpOAuthToken(token: string, serverId: string) {
  const res = await apiFetch(`${API_BASE}/mcp-servers/${serverId}/oauth-exchange`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// P3: Register tools discovered by desktop client for a stdio MCP server
export async function registerDesktopMcpTools(
  token: string,
  serverId: string,
  tools: Array<{ name: string; description?: string; inputSchema?: any }>,
) {
  const res = await apiFetch(`${API_BASE}/mcp-servers/${serverId}/desktop-tools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tools }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// P3: Relay tool call to desktop stdio MCP server via WebSocket
export async function relayMcpToolCall(
  token: string,
  serverId: string,
  toolName: string,
  args: Record<string, any>,
) {
  const res = await apiFetch(`${API_BASE}/mcp-servers/${serverId}/relay-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ toolName, args }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// P1: Memory Slot API for desktop
export async function recallMemorySlots(
  token: string,
  options: { scopes?: string[]; limit?: number; sessionId?: string },
) {
  const res = await apiFetch(`${API_BASE}/memory-slots/recall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(options),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function writeMemorySlot(
  token: string,
  params: { key: string; value: any; scope: string; type: string; importance?: number; tags?: string[] },
) {
  const res = await apiFetch(`${API_BASE}/memory-slots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteMemorySlot(token: string, key: string, scope?: string) {
  const query = scope ? `?scope=${scope}` : '';
  const res = await apiFetch(`${API_BASE}/memory-slots/${encodeURIComponent(key)}${query}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

// ═══════════════════════════════════════════════════════════════════════
// Session Export / Fork / Search (P7.4)
// ═══════════════════════════════════════════════════════════════════════

export async function exportSession(token: string, sessionId: string, format: 'markdown' | 'json' = 'markdown') {
  const res = await apiFetch(`${API_BASE}/agent-intelligence/sessions/${encodeURIComponent(sessionId)}/export?format=${format}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function forkSession(token: string, sessionId: string, fromMessageIndex?: number) {
  const res = await apiFetch(`${API_BASE}/agent-intelligence/sessions/${encodeURIComponent(sessionId)}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fromMessageIndex }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function searchMessages(token: string, query: string, limit?: number, offset?: number) {
  const params = new URLSearchParams({ q: query });
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const res = await apiFetch(`${API_BASE}/agent-intelligence/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
