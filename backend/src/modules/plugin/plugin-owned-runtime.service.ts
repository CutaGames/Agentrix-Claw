import { Injectable, Logger } from '@nestjs/common';
import { PluginService } from './plugin.service';

/**
 * Plugin-owned capability runtime: wires manifest.ownedTools / ownedHooks /
 * ownedChannels / ownedServices into the active runtime for a user.
 */

export interface OwnedCapability {
  type: 'tool' | 'hook' | 'channel' | 'service' | 'memory' | 'protocol' | 'doctor' | 'runtime';
  name: string;
  pluginId: string;
  pluginName: string;
  config: Record<string, any>;
}

export interface PluginRuntimeSummary {
  pluginCount: number;
  capabilityCount: number;
  lastBuiltAt: string;
  counts: {
    tools: number;
    hooks: number;
    channels: number;
    services: number;
    memory: number;
    protocols: number;
    doctors: number;
    runtime: number;
  };
  owners: Array<{
    pluginId: string;
    pluginName: string;
    capabilityCount: number;
    categories: string[];
  }>;
}

export interface PluginRuntimeSnapshot {
  tools: OwnedCapability[];
  hooks: OwnedCapability[];
  channels: OwnedCapability[];
  services: OwnedCapability[];
  memory: OwnedCapability[];
  protocols: OwnedCapability[];
  doctors: OwnedCapability[];
  runtime: OwnedCapability[];
  summary: PluginRuntimeSummary;
}

type CapabilityBucket = keyof Omit<PluginRuntimeSnapshot, 'summary'>;
type OwnedEntry = string | Record<string, any>;

@Injectable()
export class PluginOwnedRuntimeService {
  private readonly logger = new Logger(PluginOwnedRuntimeService.name);

  /** userId → runtime snapshot cache */
  private runtimeCache = new Map<string, PluginRuntimeSnapshot>();

  constructor(private readonly pluginService: PluginService) {}

  /**
   * Build and cache the full owned-capability snapshot for a user.
   */
  async buildSnapshot(userId: string): Promise<PluginRuntimeSnapshot> {
    const manifests = await this.pluginService.getActivePluginManifests(userId);

    const snapshot: PluginRuntimeSnapshot = {
      tools: [],
      hooks: [],
      channels: [],
      services: [],
      memory: [],
      protocols: [],
      doctors: [],
      runtime: [],
      summary: {
        pluginCount: 0,
        capabilityCount: 0,
        lastBuiltAt: new Date().toISOString(),
        counts: {
          tools: 0,
          hooks: 0,
          channels: 0,
          services: 0,
          memory: 0,
          protocols: 0,
          doctors: 0,
          runtime: 0,
        },
        owners: [],
      },
    };

    const seen = new Set<string>();
    const ownerSummary = new Map<string, {
      pluginId: string;
      pluginName: string;
      capabilityCount: number;
      categories: Set<string>;
    }>();

    const register = (
      bucket: CapabilityBucket,
      type: OwnedCapability['type'],
      name: string,
      pluginId: string,
      pluginName: string,
      config: Record<string, any> = {},
    ) => {
      const normalizedName = String(name || '').trim();
      if (!normalizedName) {
        return;
      }

      const dedupeKey = `${pluginId}:${bucket}:${normalizedName}`;
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);

      snapshot[bucket].push({
        type,
        name: normalizedName,
        pluginId,
        pluginName,
        config,
      });

      const currentOwner = ownerSummary.get(pluginId) || {
        pluginId,
        pluginName,
        capabilityCount: 0,
        categories: new Set<string>(),
      };
      currentOwner.capabilityCount += 1;
      currentOwner.categories.add(bucket);
      ownerSummary.set(pluginId, currentOwner);
    };

    for (const { pluginId, name: pluginName, manifest, capabilities, description } of manifests) {
      if (!manifest) continue;
      const raw = manifest as any;
      const hints = [
        ...(Array.isArray(capabilities) ? capabilities : []),
        ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
        typeof description === 'string' ? description : '',
      ].join(' ').toLowerCase();

      // Standard tools
      if (manifest.tools?.length) {
        for (const tool of manifest.tools) {
          register('tools', 'tool', tool.name, pluginId, pluginName, {
            inputSchema: tool.inputSchema,
            description: tool.description,
          });
        }
      }

      // Owned tools from manifest extension fields
      if (raw.ownedTools?.length) {
        for (const t of raw.ownedTools) {
          const normalized = this.normalizeOwnedEntry(t, 'tool');
          register('tools', 'tool', normalized.name, pluginId, pluginName, normalized.config);
        }
      }

      // Hooks
      if (manifest.hooks?.length) {
        for (const h of manifest.hooks) {
          register('hooks', 'hook', h.event, pluginId, pluginName, {
            handler: h.handler,
            priority: h.priority ?? 50,
          });
        }
      }
      if (raw.ownedHooks?.length) {
        for (const h of raw.ownedHooks) {
          const normalized = this.normalizeOwnedEntry(h, 'hook');
          register('hooks', 'hook', normalized.name, pluginId, pluginName, normalized.config);
        }
      }

      // Channels
      if (raw.ownedChannels?.length) {
        for (const c of raw.ownedChannels) {
          const normalized = this.normalizeOwnedEntry(c, 'channel');
          register('channels', 'channel', normalized.name, pluginId, pluginName, normalized.config);
        }
      }

      // Services
      if (raw.ownedServices?.length) {
        for (const s of raw.ownedServices) {
          const normalized = this.normalizeOwnedEntry(s, 'service');
          register('services', 'service', normalized.name, pluginId, pluginName, normalized.config);
        }
      }

      for (const memoryEntry of this.readOwnedEntries(raw.ownedMemorySlots || raw.ownedMemory)) {
        const normalized = this.normalizeOwnedEntry(memoryEntry, 'memory');
        register('memory', 'memory', normalized.name, pluginId, pluginName, normalized.config);
      }

      for (const protocolEntry of this.readOwnedEntries(raw.ownedProtocols)) {
        const normalized = this.normalizeOwnedEntry(protocolEntry, 'protocol');
        register('protocols', 'protocol', normalized.name, pluginId, pluginName, normalized.config);
      }

      if (manifest.mcpServers?.length) {
        for (const server of manifest.mcpServers) {
          register('protocols', 'protocol', server.name, pluginId, pluginName, {
            protocol: 'mcp',
            transport: server.transport,
            url: server.url,
            command: server.command,
          });
        }
      }

      for (const doctorEntry of this.readOwnedEntries(raw.ownedDoctors)) {
        const normalized = this.normalizeOwnedEntry(doctorEntry, 'doctor');
        register('doctors', 'doctor', normalized.name, pluginId, pluginName, normalized.config);
      }

      for (const runtimeEntry of this.readOwnedEntries(raw.ownedRuntimeCompat || raw.ownedRuntime)) {
        const normalized = this.normalizeOwnedEntry(runtimeEntry, 'runtime');
        register('runtime', 'runtime', normalized.name, pluginId, pluginName, normalized.config);
      }

      if (/(memory:|\bmemory\b|prompt supplement|flush plan|wiki)/i.test(hints)) {
        register('memory', 'memory', 'memory-surface', pluginId, pluginName, {
          inferred: true,
          description: 'Inferred memory ownership from plugin capabilities or permissions.',
        });
      }

      if (/(\bacp\b|\bmcp\b|protocol|gateway method)/i.test(hints)) {
        register('protocols', 'protocol', 'protocol-surface', pluginId, pluginName, {
          inferred: true,
          description: 'Inferred protocol ownership from plugin capabilities or permissions.',
        });
      }

      if (/(doctor|health|diagnostic|diagnostics|compat check)/i.test(hints)) {
        register('doctors', 'doctor', 'doctor-surface', pluginId, pluginName, {
          inferred: true,
          description: 'Inferred doctor ownership from plugin capabilities or permissions.',
        });
      }

      if (/(runtime|compat|channel runtime|runtime seam)/i.test(hints)) {
        register('runtime', 'runtime', 'runtime-surface', pluginId, pluginName, {
          inferred: true,
          description: 'Inferred runtime ownership from plugin capabilities or permissions.',
        });
      }
    }

    snapshot.summary = this.buildSummary(snapshot, ownerSummary);

    this.runtimeCache.set(userId, snapshot);
    this.logger.log(
      `Built plugin runtime for user ${userId}: ${snapshot.summary.capabilityCount} capabilities across ${snapshot.summary.pluginCount} plugins`,
    );
    return snapshot;
  }

  /** Get cached snapshot or build */
  async getSnapshot(userId: string): Promise<PluginRuntimeSnapshot> {
    return this.runtimeCache.get(userId) ?? this.buildSnapshot(userId);
  }

  /** Invalidate cache when plugin installed/uninstalled/toggled */
  invalidate(userId: string): void {
    this.runtimeCache.delete(userId);
  }

  /** List all owned capabilities of a specific type */
  async listCapabilities(
    userId: string,
    type?: OwnedCapability['type'],
  ): Promise<OwnedCapability[]> {
    const snap = await this.getSnapshot(userId);
    if (!type) {
      return [
        ...snap.tools,
        ...snap.hooks,
        ...snap.channels,
        ...snap.services,
        ...snap.memory,
        ...snap.protocols,
        ...snap.doctors,
        ...snap.runtime,
      ];
    }
    switch (type) {
      case 'tool': return snap.tools;
      case 'hook': return snap.hooks;
      case 'channel': return snap.channels;
      case 'service': return snap.services;
      case 'memory': return snap.memory;
      case 'protocol': return snap.protocols;
      case 'doctor': return snap.doctors;
      case 'runtime': return snap.runtime;
    }
  }

  private readOwnedEntries(value: unknown): OwnedEntry[] {
    return Array.isArray(value) ? value.filter(Boolean) as OwnedEntry[] : [];
  }

  private normalizeOwnedEntry(entry: OwnedEntry, fallback: string): { name: string; config: Record<string, any> } {
    if (typeof entry === 'string') {
      return { name: entry, config: {} };
    }

    const objectEntry = entry && typeof entry === 'object' ? entry : {};
    const name = String(
      objectEntry.name
      || objectEntry.id
      || objectEntry.key
      || objectEntry.event
      || objectEntry.protocol
      || objectEntry.domain
      || objectEntry.surface
      || fallback,
    );
    return { name, config: objectEntry as Record<string, any> };
  }

  private buildSummary(
    snapshot: PluginRuntimeSnapshot,
    ownerSummary: Map<string, { pluginId: string; pluginName: string; capabilityCount: number; categories: Set<string> }>,
  ): PluginRuntimeSummary {
    const counts = {
      tools: snapshot.tools.length,
      hooks: snapshot.hooks.length,
      channels: snapshot.channels.length,
      services: snapshot.services.length,
      memory: snapshot.memory.length,
      protocols: snapshot.protocols.length,
      doctors: snapshot.doctors.length,
      runtime: snapshot.runtime.length,
    };

    const capabilityCount = Object.values(counts).reduce((sum, value) => sum + value, 0);

    return {
      pluginCount: ownerSummary.size,
      capabilityCount,
      lastBuiltAt: new Date().toISOString(),
      counts,
      owners: [...ownerSummary.values()]
        .map((owner) => ({
          pluginId: owner.pluginId,
          pluginName: owner.pluginName,
          capabilityCount: owner.capabilityCount,
          categories: [...owner.categories].sort(),
        }))
        .sort((left, right) => right.capabilityCount - left.capabilityCount || left.pluginName.localeCompare(right.pluginName)),
    };
  }
}
