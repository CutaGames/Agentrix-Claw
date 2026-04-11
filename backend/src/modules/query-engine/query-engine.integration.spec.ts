import { formatSSE, formatSSEDone, StreamEvent } from './interfaces';
import { CostTrackerService } from '../cost-tracker/cost-tracker.service';
import { DenialTrackerService } from '../permissions/denial-tracker.service';
import { PermissionEngineService } from '../permissions/permission-engine.service';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';
import { CreateOrderTool } from '../tool-registry/tools/commerce/create-order.tool';
import { ResourceSearchTool } from '../tool-registry/tools/commerce/resource-search.tool';
import { SearchProductsTool } from '../tool-registry/tools/commerce/search-products.tool';
import { AssetOverviewTool } from '../tool-registry/tools/wallet/asset-overview.tool';
import { GetBalanceTool } from '../tool-registry/tools/wallet/get-balance.tool';
import { QueryEngineService } from './query-engine.service';
import { AgentrixStreamParser } from '../../../../shared/stream-parser';

describe('QueryEngine integration', () => {
  let productService: {
    getProducts: jest.Mock;
    getProduct: jest.Mock;
  };
  let orderService: {
    createOrder: jest.Mock;
  };
  let accountService: {
    findByOwner: jest.Mock;
    getDefaultAccount: jest.Mock;
    getBalance: jest.Mock;
    getMultiCurrencyBalances: jest.Mock;
  };
  let agentAccountRepo: {
    findOne: jest.Mock;
  };
  let toolRegistry: ToolRegistryService;
  let queryEngine: QueryEngineService;

  beforeEach(async () => {
    productService = {
      getProducts: jest.fn().mockResolvedValue([
        {
          id: 'prod-1',
          merchantId: 'merchant-1',
          name: 'Camera Pro',
          description: '4K camera for streaming',
          price: 199.99,
          stock: 7,
          category: 'hardware',
          productType: 'physical',
          metadata: { currency: 'USD', resourceType: 'product' },
        },
      ]),
      getProduct: jest.fn().mockResolvedValue({
        id: 'prod-1',
        merchantId: 'merchant-1',
        name: 'Camera Pro',
        description: '4K camera for streaming',
        price: 199.99,
        stock: 7,
        category: 'hardware',
        productType: 'physical',
        metadata: { currency: 'USD' },
      }),
    };

    orderService = {
      createOrder: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'pending',
        amount: 399.98,
        currency: 'USD',
      }),
    };

    accountService = {
      findByOwner: jest.fn().mockResolvedValue([
        {
          id: 'account-1',
          accountId: 'ACC-USE-1',
          chainType: 'multi',
          isDefault: true,
          walletAddress: '0xabc',
          mpcWalletId: null,
        },
      ]),
      getDefaultAccount: jest.fn().mockResolvedValue({
        id: 'account-1',
        accountId: 'ACC-USE-1',
        chainType: 'multi',
        isDefault: true,
        walletAddress: '0xabc',
        mpcWalletId: null,
      }),
      getBalance: jest.fn().mockResolvedValue({
        availableBalance: 120.5,
        frozenBalance: 10,
        pendingBalance: 3,
        totalBalance: 133.5,
        currency: 'USD',
      }),
      getMultiCurrencyBalances: jest.fn().mockResolvedValue({
        USD: 120.5,
        USDC: 50,
      }),
    };

    agentAccountRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const toolInstances = [
      new SearchProductsTool(productService as any),
      new ResourceSearchTool(productService as any),
      new CreateOrderTool(productService as any, orderService as any),
      new GetBalanceTool(accountService as any),
      new AssetOverviewTool(accountService as any),
    ];

    toolRegistry = new ToolRegistryService({
      getProviders: () => toolInstances.map((instance) => ({ instance })),
    } as any);
    await toolRegistry.onModuleInit();

    queryEngine = new QueryEngineService(
      toolRegistry,
      new CostTrackerService(),
      new PermissionEngineService(agentAccountRepo as any),
      new DenialTrackerService(),
    );
  });

  it('registers and executes real registry-backed commerce and wallet tools', async () => {
    expect(toolRegistry.getAll().map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'search_products',
        'resource_search',
        'create_order',
        'get_balance',
        'asset_overview',
      ]),
    );

    const balanceResult = await toolRegistry.execute('get_balance', {}, {
      userId: 'user-1',
      sessionId: 'session-1',
    });
    expect(balanceResult.success).toBe(true);
    expect(accountService.getDefaultAccount).toHaveBeenCalledWith('user-1', 'user');

    const orderResult = await toolRegistry.execute('create_order', {
      productId: 'prod-1',
      quantity: 2,
    }, {
      userId: 'user-1',
      sessionId: 'session-1',
    });
    expect(orderResult.success).toBe(true);
    expect(orderService.createOrder).toHaveBeenCalled();
  });

  it('executes search_products through QueryEngine and round-trips structured SSE through the shared parser', async () => {
    const state = queryEngine.createState('You are a helpful assistant.', {
      userId: 'user-1',
      sessionId: 'session-2',
    });
    const events: StreamEvent[] = [];

    const callLLM = jest.fn()
      .mockImplementationOnce(async (_messages: any[], tools: any[]) => {
        const toolNames = tools.map((tool: any) => tool.name || tool.function?.name);
        expect(toolNames).toEqual(expect.arrayContaining(['search_products', 'create_order', 'get_balance']));
        return {
          content: '',
          toolCalls: [{ id: 'tool-call-1', name: 'search_products', input: { query: 'camera', limit: 2 } }],
          stopReason: 'tool_use',
          usage: { inputTokens: 120, outputTokens: 24 },
          model: 'claude-sonnet-4-20250514',
        };
      })
      .mockResolvedValueOnce({
        content: 'I found 1 product that matches your search.',
        toolCalls: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 64, outputTokens: 18 },
        model: 'claude-sonnet-4-20250514',
      });

    await queryEngine.submitMessage(
      state,
      'Find me a camera',
      {
        provider: 'claude',
        model: 'claude-sonnet-4-20250514',
        autoCompact: false,
      },
      (event) => events.push(event),
      callLLM,
    );

    expect(productService.getProducts).toHaveBeenCalledWith('camera');
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['turn_info', 'usage', 'tool_start', 'tool_result', 'text_delta', 'done']),
    );

    const toolResultEvent = events.find((event) => event.type === 'tool_result');
    expect(toolResultEvent).toBeDefined();
    expect((toolResultEvent as any).success).toBe(true);
    expect((toolResultEvent as any).result.products[0].id).toBe('prod-1');

    const encoded = events.map((event) => formatSSE(event)).join('') + formatSSEDone();
    const parsedTypes: string[] = [];
    let parsedText = '';

    const parser = new AgentrixStreamParser({
      onToolStart: (event) => parsedTypes.push(event.type),
      onToolResult: (event) => parsedTypes.push(event.type),
      onTextDelta: (event) => {
        parsedTypes.push(event.type);
        parsedText += event.text;
      },
      onDone: (event) => parsedTypes.push(event.type),
      onError: (event) => parsedTypes.push(event.type),
    });

    for (let index = 0; index < encoded.length; index += 19) {
      parser.feed(encoded.slice(index, index + 19));
    }
    parser.end();

    expect(parsedTypes).toEqual(expect.arrayContaining(['tool_start', 'tool_result', 'text_delta', 'done']));
    expect(parsedText).toContain('I found 1 product');
  });

  it('emits approval_required for create_order before any payment-side effect runs', async () => {
    const state = queryEngine.createState('You are a helpful assistant.', {
      userId: 'user-1',
      sessionId: 'session-3',
    });
    const events: StreamEvent[] = [];

    const callLLM = jest.fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'tool-call-2', name: 'create_order', input: { productId: 'prod-1', quantity: 2 } }],
        stopReason: 'tool_use',
        usage: { inputTokens: 80, outputTokens: 16 },
        model: 'claude-sonnet-4-20250514',
      })
      .mockResolvedValueOnce({
        content: 'This purchase needs your approval before I can continue.',
        toolCalls: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 32, outputTokens: 12 },
        model: 'claude-sonnet-4-20250514',
      });

    await queryEngine.submitMessage(
      state,
      'Buy the camera for me',
      {
        provider: 'claude',
        model: 'claude-sonnet-4-20250514',
        autoCompact: false,
      },
      (event) => events.push(event),
      callLLM,
    );

    expect(orderService.createOrder).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === 'approval_required' && (event as any).toolName === 'create_order')).toBe(true);
    expect(events.filter((event) => event.type === 'text_delta').map((event) => (event as any).text).join('')).toContain('needs your approval');
  });

  it('preserves tool_use in the done event when the turn budget is exhausted mid-task', async () => {
    const state = queryEngine.createState('You are a helpful assistant.', {
      userId: 'user-1',
      sessionId: 'session-4',
    });
    const events: StreamEvent[] = [];

    const callLLM = jest.fn().mockResolvedValue({
      content: '',
      toolCalls: [{ id: 'tool-call-3', name: 'search_products', input: { query: 'camera' } }],
      stopReason: 'tool_use',
      usage: { inputTokens: 48, outputTokens: 12 },
      model: 'claude-sonnet-4-20250514',
    });

    await queryEngine.submitMessage(
      state,
      'Keep researching camera options',
      {
        provider: 'claude',
        model: 'claude-sonnet-4-20250514',
        autoCompact: false,
        maxTurns: 1,
      },
      (event) => events.push(event),
      callLLM,
    );

    expect(productService.getProducts).toHaveBeenCalledWith('camera');
    expect(events.find((event) => event.type === 'done')).toMatchObject({
      type: 'done',
      reason: 'tool_use',
    });
  });
});