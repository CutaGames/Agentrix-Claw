import { Injectable, Logger } from '@nestjs/common';
import { PluginService } from './plugin.service';

/**
 * Plugin-owned capability runtime: wires manifest.ownedTools / ownedHooks /
 * ownedChannels / ownedServices into the active runtime for a user.
 */

export interface OwnedCapability {
  type: 'tool' | 'hook' | 'channel' | 'service';
  name: string;
  pluginId: string;
  pluginName: string;
  config: Record<string, any>;
}

export interface PluginRuntimeSnapshot {
  tools: OwnedCapability[];
  hooks: OwnedCapability[];
  channels: OwnedCapability[];
  services: OwnedCapability[];
}

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
    };

    for (const { pluginId, name: pluginName, manifest } of manifests) {
      if (!manifest) continue;

      // Standard tools
      if (manifest.tools?.length) {
        for (const tool of manifest.tools) {
          snapshot.tools.push({
            type: 'tool',
            name: tool.name,
            pluginId,
            pluginName,
            config: { inputSchema: tool.inputSchema, description: tool.description },
          });
        }
      }

      // Owned tools from manifest extension fields
      const raw = manifest as any;
      if (raw.ownedTools?.length) {
        for (const t of raw.ownedTools) {
          snapshot.tools.push({
            type: 'tool',
            name: t.name ?? t,
            pluginId,
            pluginName,
            config: typeof t === 'object' ? t : {},
          });
        }
      }

      // Hooks
      if (manifest.hooks?.length) {
        for (const h of manifest.hooks) {
          snapshot.hooks.push({
            type: 'hook',
            name: h.event,
            pluginId,
            pluginName,
            config: { handler: h.handler, priority: h.priority ?? 50 },
          });
        }
      }
      if (raw.ownedHooks?.length) {
        for (const h of raw.ownedHooks) {
          snapshot.hooks.push({
            type: 'hook',
            name: typeof h === 'string' ? h : h.event,
            pluginId,
            pluginName,
            config: typeof h === 'object' ? h : {},
          });
        }
      }

      // Channels
      if (raw.ownedChannels?.length) {
        for (const c of raw.ownedChannels) {
          snapshot.channels.push({
            type: 'channel',
            name: typeof c === 'string' ? c : c.name,
            pluginId,
            pluginName,
            config: typeof c === 'object' ? c : {},
          });
        }
      }

      // Services
      if (raw.ownedServices?.length) {
        for (const s of raw.ownedServices) {
          snapshot.services.push({
            type: 'service',
            name: typeof s === 'string' ? s : s.name,
            pluginId,
            pluginName,
            config: typeof s === 'object' ? s : {},
          });
        }
      }
    }

    this.runtimeCache.set(userId, snapshot);
    this.logger.log(
      `Built plugin runtime for user ${userId}: ${snapshot.tools.length}T / ${snapshot.hooks.length}H / ${snapshot.channels.length}C / ${snapshot.services.length}S`,
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
    type?: 'tool' | 'hook' | 'channel' | 'service',
  ): Promise<OwnedCapability[]> {
    const snap = await this.getSnapshot(userId);
    if (!type) {
      return [...snap.tools, ...snap.hooks, ...snap.channels, ...snap.services];
    }
    switch (type) {
      case 'tool': return snap.tools;
      case 'hook': return snap.hooks;
      case 'channel': return snap.channels;
      case 'service': return snap.services;
    }
  }
}
