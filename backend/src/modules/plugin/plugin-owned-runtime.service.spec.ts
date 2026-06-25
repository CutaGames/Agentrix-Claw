import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PluginOwnedRuntimeService } from './plugin-owned-runtime.service';
import { PluginService } from './plugin.service';

describe('PluginOwnedRuntimeService', () => {
  let service: PluginOwnedRuntimeService;

  const getActivePluginManifests = jest.fn<(...args: any[]) => Promise<any>>();

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PluginOwnedRuntimeService({
      getActivePluginManifests,
    } as unknown as PluginService);
  });

  it('builds an ownership snapshot with runtime, protocol, memory, and doctor surfaces', async () => {
    getActivePluginManifests.mockResolvedValue([
      {
        pluginId: 'plugin-1',
        name: 'Memory Pilot',
        capabilities: ['memory', 'runtime'],
        description: 'Owns session memory and runtime compatibility hooks.',
        manifest: {
          tools: [{ name: 'memory_search', description: 'Search memory', inputSchema: { type: 'object' } }],
          mcpServers: [{ name: 'planner-mcp', transport: 'http', url: 'https://planner.example.com/mcp' }],
          permissions: ['memory:write', 'runtime:compat'],
          ownedMemorySlots: [{ name: 'session-slot', scope: 'session', description: 'Owns session memory flush plans.' }],
          ownedProtocols: [{ name: 'acp-bridge', protocol: 'acp', endpoint: '/api/acp/sessions' }],
          ownedDoctors: [{ name: 'runtime-health', domain: 'runtime', description: 'Checks runtime health.' }],
          ownedRuntimeCompat: [{ name: 'editor-compat', target: 'vscode', surface: 'editor-runtime' }],
        },
      },
      {
        pluginId: 'plugin-2',
        name: 'Channel Relay',
        capabilities: ['protocol', 'doctor'],
        description: 'Provides external channel runtime and diagnostics.',
        manifest: {
          ownedChannels: ['telegram'],
          ownedServices: [{ name: 'delivery-relay', description: 'Async relay service.' }],
          ownedDoctors: ['transport-health'],
        },
      },
    ]);

    const snapshot = await service.buildSnapshot('user-1');

    expect(snapshot.tools).toHaveLength(1);
    expect(snapshot.channels.some((capability) => capability.name === 'telegram')).toBe(true);
    expect(snapshot.services.some((capability) => capability.name === 'delivery-relay')).toBe(true);
    expect(snapshot.memory.some((capability) => capability.name === 'session-slot')).toBe(true);
    expect(snapshot.protocols.some((capability) => capability.name === 'acp-bridge')).toBe(true);
    expect(snapshot.protocols.some((capability) => capability.name === 'planner-mcp')).toBe(true);
    expect(snapshot.doctors.some((capability) => capability.name === 'runtime-health')).toBe(true);
    expect(snapshot.runtime.some((capability) => capability.name === 'editor-compat')).toBe(true);
    expect(snapshot.summary.pluginCount).toBe(2);
    expect(snapshot.summary.capabilityCount).toBeGreaterThanOrEqual(8);
    expect(snapshot.summary.owners[0]?.pluginName).toBe('Memory Pilot');
  });

  it('returns all capability buckets when type is omitted', async () => {
    getActivePluginManifests.mockResolvedValue([
      {
        pluginId: 'plugin-1',
        name: 'ACP Runtime',
        capabilities: ['memory', 'protocol', 'doctor', 'runtime'],
        description: 'Owns ACP runtime and diagnostics.',
        manifest: {
          ownedProtocols: ['gateway-acp'],
          ownedDoctors: ['doctor-surface'],
          ownedRuntimeCompat: ['runtime-surface'],
          ownedMemorySlots: ['memory-surface'],
        },
      },
    ]);

    const capabilities = await service.listCapabilities('user-1');

    expect(capabilities.some((capability) => capability.type === 'protocol')).toBe(true);
    expect(capabilities.some((capability) => capability.type === 'doctor')).toBe(true);
    expect(capabilities.some((capability) => capability.type === 'runtime')).toBe(true);
    expect(capabilities.some((capability) => capability.type === 'memory')).toBe(true);
  });
});