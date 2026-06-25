import { Test, TestingModule } from '@nestjs/testing';
import { RuntimeSeamService } from './runtime-seam.service';
import { HookService } from '../hooks/hook.service';
import { McpServerRegistryService } from '../mcp-registry/mcp-server-registry.service';
import { AgentContextService } from '../agent-context/agent-context.service';
import { PluginService } from '../plugin/plugin.service';
import { MemorySlotService } from '../agent-context/memory-slot.service';
import { HookEventType } from '../../entities/hook-config.entity';

describe('RuntimeSeamService', () => {
  let service: RuntimeSeamService;

  const mockHookService = {
    executeHooks: jest.fn().mockResolvedValue([]),
    hasBlockingResult: jest.fn().mockReturnValue(false),
  };

  const mockMcpRegistryService = {
    getUserMcpTools: jest.fn().mockResolvedValue([]),
    executeToolCall: jest.fn(),
  };

  const mockAgentContextService = {
    buildContext: jest.fn().mockResolvedValue({
      systemPrompt: 'You are a helpful agent.',
      memoryTokenEstimate: 100,
    }),
    buildCacheableSystemBlocks: jest.fn().mockReturnValue([
      { type: 'text', text: 'You are a helpful agent.' },
    ]),
  };

  const mockPluginService = {
    getPluginProvidedTools: jest.fn().mockResolvedValue([]),
  };

  const mockMemorySlotService = {
    flushPendingWrites: jest.fn().mockResolvedValue(0),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuntimeSeamService,
        { provide: HookService, useValue: mockHookService },
        { provide: McpServerRegistryService, useValue: mockMcpRegistryService },
        { provide: AgentContextService, useValue: mockAgentContextService },
        { provide: PluginService, useValue: mockPluginService },
        { provide: MemorySlotService, useValue: mockMemorySlotService },
      ],
    }).compile();

    service = module.get<RuntimeSeamService>(RuntimeSeamService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildRuntimeContext', () => {
    const baseInput = {
      userId: 'u1',
      sessionId: 's1',
      message: 'Hello',
      needsTools: true,
      baseTools: [{ name: 'test_tool', description: 'A test tool', input_schema: {} }],
    };

    it('should build context with system prompt and tools', async () => {
      const result = await service.buildRuntimeContext(baseInput);

      expect(result.systemPrompt).toBe('You are a helpful agent.');
      expect(result.hookBlocked).toBe(false);
      expect(result.effectiveTools.length).toBeGreaterThanOrEqual(1);
      expect(result.contextSummary.totalToolCount).toBe(1);
      expect(mockAgentContextService.buildContext).toHaveBeenCalled();
    });

    it('should execute pre-message hooks', async () => {
      await service.buildRuntimeContext(baseInput);

      expect(mockHookService.executeHooks).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          sessionId: 's1',
          eventType: HookEventType.MESSAGE_PRE,
          message: 'Hello',
        }),
      );
    });

    it('should block when hook returns blocking result', async () => {
      mockHookService.hasBlockingResult.mockReturnValueOnce(true);

      const result = await service.buildRuntimeContext(baseInput);
      expect(result.hookBlocked).toBe(true);
      expect(result.hookBlockMessage).toBeDefined();
    });

    it('should inject MCP tools when available', async () => {
      mockMcpRegistryService.getUserMcpTools.mockResolvedValueOnce([
        { name: 'mcp_search', description: 'Search', input_schema: {} },
      ]);

      const result = await service.buildRuntimeContext(baseInput);
      expect(result.contextSummary.mcpToolCount).toBe(1);
      expect(result.effectiveTools).toHaveLength(2); // base + mcp
    });

    it('should inject plugin tools when available', async () => {
      mockPluginService.getPluginProvidedTools.mockResolvedValueOnce([
        { name: 'plugin_weather', description: 'Weather', input_schema: {} },
      ]);

      const result = await service.buildRuntimeContext(baseInput);
      expect(result.contextSummary.pluginToolCount).toBe(1);
      expect(result.effectiveTools).toHaveLength(2); // base + plugin
    });

    it('should skip tools when needsTools is false', async () => {
      const result = await service.buildRuntimeContext({
        ...baseInput,
        needsTools: false,
      });

      expect(result.effectiveTools).toHaveLength(0);
      expect(mockMcpRegistryService.getUserMcpTools).not.toHaveBeenCalled();
    });

    it('should handle hook execution errors gracefully', async () => {
      mockHookService.executeHooks.mockRejectedValueOnce(new Error('Hook failed'));

      const result = await service.buildRuntimeContext(baseInput);
      // Should not throw, hookBlocked should be false
      expect(result.hookBlocked).toBe(false);
    });
  });

  describe('postProcess', () => {
    const baseInput = {
      userId: 'u1',
      sessionId: 's1',
      message: 'Hello',
    };

    it('should execute post-message hooks and flush memory', async () => {
      await service.postProcess(baseInput, 'Response text');

      expect(mockHookService.executeHooks).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: HookEventType.MESSAGE_POST,
          message: 'Response text',
        }),
      );
      expect(mockMemorySlotService.flushPendingWrites).toHaveBeenCalledWith('u1', 's1', undefined);
    });

    it('should not throw when memory flush fails', async () => {
      mockMemorySlotService.flushPendingWrites.mockRejectedValueOnce(new Error('DB error'));

      // Should not throw
      await expect(service.postProcess(baseInput, 'Response')).resolves.toBeUndefined();
    });
  });
});
