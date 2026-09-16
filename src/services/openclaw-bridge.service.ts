/**
 * openclaw-bridge.service.ts
 *
 * Client-side bridge utilities:
 *  - probeUrl      — quick reachability + metadata check (via backend relay)
 *  - migrateInstance — pull skills/memory/config/sessions from bound instance
 *  - lanScan       — scan local subnet natively from the device (same LAN)
 *  - getDiscoveryConfig — fetch port/path hints from backend
 */

import { apiFetch } from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProbeResult {
  reachable: boolean;
  instanceName?: string;
  version?: string;
  skillCount?: number;
  memoryEntries?: number;
  sessionCount?: number;
  model?: string;
  latencyMs?: number;
  error?: string;
}

export interface MigrationCategory {
  category: 'config' | 'skills' | 'memory' | 'sessions';
  status: 'ok' | 'skipped' | 'error';
  count?: number;
  detail?: string;
}

export interface MigrationResult {
  instanceId: string;
  startedAt: string;
  finishedAt: string;
  categories: MigrationCategory[];
  config?: Record<string, unknown>;
  skills: Array<{
    skillKey: string;
    name: string;
    enabled: boolean;
    version?: string;
  }>;
  memoryEntries: Array<{
    id?: string;
    type: string;
    content: string;
    createdAt?: string;
    tags?: string[];
  }>;
  sessionSummaries: Array<{
    sessionId: string;
    title?: string;
    messageCount: number;
    createdAt?: string;
  }>;
  totalMigrated: number;
}

export interface DiscoveryConfig {
  ports: number[];
  paths: string[];
  timeoutMs: number;
}

export interface LanCandidate {
  url: string;
  probe: ProbeResult;
}

// ── API calls ─────────────────────────────────────────────────────────────────

/**
 * Ask backend to probe a URL for OpenClaw presence.
 * NOTE: Backend can only reach public/routable URLs.
 * For private LAN IPs use lanScan() instead.
 */
export async function probeInstanceUrl(url: string, token?: string): Promise<ProbeResult> {
  return apiFetch<ProbeResult>('/openclaw/bridge/probe', {
    method: 'POST',
    body: JSON.stringify({ url, token }),
  });
}

/** Trigger full data migration from a bound instance → Agentrix */
export async function migrateInstance(instanceId: string): Promise<MigrationResult> {
  return apiFetch<MigrationResult>(`/openclaw/bridge/${instanceId}/migrate`, {
    method: 'POST',
  });
}

/** Fetch recommended ports / paths from backend for LAN scanning */
export async function getDiscoveryConfig(): Promise<DiscoveryConfig> {
  return apiFetch<DiscoveryConfig>('/openclaw/bridge/discover/config');
}

// ── Native LAN scanning (runs on device, not through backend) ─────────────────

/**
 * Scan the local subnet for OpenClaw instances.
 * Generates IP candidates from the phone's likely subnet, tries each
 * port/path combo in parallel with a short timeout.
 *
 * @param subnet   e.g. "192.168.1" — auto-detected if omitted (not available in RN without native module)
 * @param config   Port + path hints from getDiscoveryConfig()
 * @param onProgress   Called each time a host is checked
 */
export async function lanScan(
  config: DiscoveryConfig,
  subnet = '192.168.1',
  onProgress?: (checked: number, total: number) => void,
): Promise<LanCandidate[]> {
  const lastOctets = Array.from({ length: 254 }, (_, i) => i + 1);
  const hosts = lastOctets.map((n) => `${subnet}.${n}`);
  const ports = config.ports;
  const healthPath = config.paths[0] ?? '/api/health';
  const timeoutMs = config.timeoutMs;

  const candidates: { url: string }[] = hosts.flatMap((h) =>
    ports.map((p) => ({ url: `http://${h}:${p}` })),
  );

  const found: LanCandidate[] = [];
  let checked = 0;
  const total = candidates.length;

  // Process in parallel batches of 30 to avoid opening too many sockets
  const BATCH = 30;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async ({ url }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(`${url}${healthPath}`, {
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (res.ok || res.status === 401 || res.status === 403) {
            // Something responded — likely an OpenClaw (or similar) service
            let data: Record<string, unknown> = {};
            try { data = await res.json(); } catch (_) { /* ignore */ }
            return {
              url,
              probe: {
                reachable: true,
                instanceName: (data.name ?? data.agentName ?? data.instanceName) as string | undefined,
                version: data.version as string | undefined,
                model: (data.model ?? data.currentModel) as string | undefined,
              } satisfies ProbeResult,
            };
          }
        } catch (_) {
          clearTimeout(timer);
        }
        return null;
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value !== null) {
        found.push(r.value as LanCandidate);
      }
    }

    checked += batch.length;
    onProgress?.(checked, total);
  }

  return found;
}
