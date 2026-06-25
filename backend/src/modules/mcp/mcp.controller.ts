import { Controller, Get, Post, Delete, Body, Req, Res, Logger, UseGuards, Param, Headers } from '@nestjs/common';
import { Request, Response } from 'express';
import { McpService } from './mcp.service';
import { McpAuthContextService } from './mcp-auth-context.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Public } from '../auth/decorators/public.decorator';

@Controller('mcp')
@Public()
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly mcpService: McpService,
    private readonly mcpAuthContextService: McpAuthContextService,
  ) {}

  /**
   * Streamable HTTP Transport endpoint (MCP 2025-03-26 spec)
   * Single endpoint for IDE compatibility: Windsurf, Cursor, Claude Desktop, VS Code
   * POST: Send JSON-RPC messages
   * GET: Open SSE stream for server-initiated messages
   * DELETE: Terminate session
   */
  @Post()
  async streamableHttpPost(@Req() req: Request, @Res() res: Response) {
    this.logger.log('Streamable HTTP POST request');
    const sessionId = req.headers['mcp-session-id'] as string;
    const accept = req.headers['accept'] || '';

    try {
      const body = req.body;
      if (!body || typeof body !== 'object') {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error' },
          id: null,
        });
      }

      // Handle batch requests (array of JSON-RPC messages)
      const messages = Array.isArray(body) ? body : [body];
      const responses: any[] = [];

      for (const msg of messages) {
        const response = await this.handleSingleJsonRpc(msg, req, res);
        if (response) responses.push(response);
      }

      // Generate session ID on initialize
      const initMsg = messages.find(m => m.method === 'initialize');
      if (initMsg) {
        const newSessionId = `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        res.setHeader('Mcp-Session-Id', newSessionId);
      } else if (sessionId) {
        res.setHeader('Mcp-Session-Id', sessionId);
      }

      // If all messages are notifications (no id), return 202
      if (responses.length === 0) {
        return res.status(202).send();
      }

      // Return single response or batch
      if (!Array.isArray(body)) {
        return res.json(responses[0]);
      }
      return res.json(responses);
    } catch (error: any) {
      this.logger.error(`Streamable HTTP error: ${error.message}`);
      return res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: error.message },
        id: req.body?.id || null,
      });
    }
  }

  @Get()
  async streamableHttpGet(@Req() req: Request, @Res() res: Response) {
    const accept = req.headers['accept'] || '';
    
    // If requesting JSON, return server info
    if (accept.includes('application/json')) {
      return res.json({
        name: 'agentrix-mcp-server',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: this.mcpService.getCapabilities(),
      });
    }

    // If requesting SSE, open event stream
    if (accept.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const sessionId = req.headers['mcp-session-id'] as string || 
        `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('Mcp-Session-Id', sessionId);

      // Send initial endpoint event
      res.write(`event: endpoint\ndata: /api/mcp\n\n`);

      // Keep alive
      const keepAlive = setInterval(() => {
        res.write(': keepalive\n\n');
      }, 30000);

      req.on('close', () => {
        clearInterval(keepAlive);
      });

      return;
    }

    // Default: return server info as JSON
    return res.json({
      name: 'agentrix-mcp-server',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      capabilities: this.mcpService.getCapabilities(),
    });
  }

  @Delete()
  async streamableHttpDelete(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.headers['mcp-session-id'] as string;
    if (sessionId) {
      this.logger.log(`MCP session terminated: ${sessionId}`);
    }
    return res.status(200).json({ success: true });
  }

  /**
   * Handle a single JSON-RPC message (shared by streamable HTTP and stateless)
   */
  private async handleSingleJsonRpc(msg: any, req: Request, res?: Response): Promise<any> {
    const { jsonrpc, method, params, id } = msg;

    // Notifications (no id) don't get responses
    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        return null;
      }
      return null;
    }

    if (jsonrpc !== '2.0') {
      return { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id };
    }

    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: this.mcpService.getCapabilities(),
            serverInfo: { name: 'agentrix-mcp-server', version: '1.0.0' },
          },
          id,
        };

      case 'tools/list':
        const tools = await this.mcpService.getToolsList();
        return { jsonrpc: '2.0', result: { tools }, id };

      case 'tools/call':
        if (!params?.name) {
          return { jsonrpc: '2.0', error: { code: -32602, message: 'Tool name required' }, id };
        }
        const authContext = await this.mcpAuthContextService.extractAuthContext(req);
        if (!this.mcpAuthContextService.validateToolPermission(authContext, params.name)) {
          return {
            jsonrpc: '2.0',
            error: { code: -32600, message: `Permission denied for tool: ${params.name}` },
            id,
          };
        }
        const secureCtx = this.mcpAuthContextService.createSecureToolContext(authContext, params.arguments || {});
        const toolResult = await this.mcpService.callToolWithContext(params.name, params.arguments || {}, secureCtx);
        return { jsonrpc: '2.0', result: toolResult, id };

      case 'resources/list':
        return { jsonrpc: '2.0', result: { resources: [] }, id };

      case 'prompts/list':
        return { jsonrpc: '2.0', result: { prompts: [] }, id };

      case 'ping':
        return { jsonrpc: '2.0', result: {}, id };

      default:
        return { jsonrpc: '2.0', error: { code: -32601, message: `Method not found: ${method}` }, id };
    }
  }

  /**
   * MCP SSE 端点 (Legacy)
   * 用于 ChatGPT 等云端 AI 建立长连接
   */
  @Get('sse')
  async sse(@Req() req: Request, @Res() res: Response) {
    // 如果请求的是 JSON，则返回能力声明（用于探测）
    if (req.headers.accept?.includes('application/json')) {
      this.logger.log('Probing MCP capabilities via JSON');
      return res.json({
        capabilities: this.mcpService.getCapabilities()
      });
    }

    this.logger.log('New MCP SSE connection request');
    
    // 创建一个新的 SSE transport 并连接到 server
    const transport = new (SSEServerTransport as any)('/api/mcp/messages', res);
    const sessionId = await this.mcpService.connectTransport(transport);
    
    this.logger.log(`MCP SSE connection established with sessionId: ${sessionId}`);
  }

  /**
   * 兼容性处理：有些客户端会尝试 POST 到 SSE 端点
   * ChatGPT 会先 GET 建立 SSE 连接，然后 POST 发送消息
   * 但如果没有 sessionId，我们需要特殊处理
   */
  @Post('sse')
  async ssePost(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.query.sessionId as string;
    
    // 如果有 sessionId，正常处理消息
    if (sessionId) {
      this.logger.log(`POST /sse with sessionId: ${sessionId}, redirecting to messages`);
      return this.messages(req, res);
    }
    
    // 如果没有 sessionId，尝试使用最新的 transport
    this.logger.log('POST /sse without sessionId, trying latest transport');
    const transport = this.mcpService.getLatestTransport();
    
    if (transport && (transport as any).handlePostMessage) {
      try {
        await (transport as any).handlePostMessage(req, res);
      } catch (error: any) {
        this.logger.error(`Failed to handle MCP message via POST /sse: ${error.message}`);
        // 如果SSE连接失败，降级到无状态模式处理
        return this.handleStatelessMessage(req, res);
      }
    } else {
      // 没有活跃连接时，使用无状态模式处理
      return this.handleStatelessMessage(req, res);
    }
  }

  /**
   * 处理来自 AI 的消息
   * 支持有状态（SSE）和无状态（直接HTTP）两种模式
   */
  @Post('messages')
  async messages(@Req() req: Request, @Res() res: Response) {
    // 从 query 中获取 sessionId
    const sessionId = req.query.sessionId as string;
    this.logger.log(`Received MCP message for session: ${sessionId}`);

    // 根据 sessionId 查找对应的 transport
    let transport = sessionId ? this.mcpService.getTransport(sessionId) : null;
    
    // 如果找不到，尝试使用最新的 transport（单用户兼容）
    if (!transport) {
      this.logger.warn(`No transport found for sessionId: ${sessionId}, trying latest transport`);
      transport = this.mcpService.getLatestTransport();
    }
    
    if (transport && (transport as any).handlePostMessage) {
      try {
        await (transport as any).handlePostMessage(req, res);
      } catch (error: any) {
        this.logger.error(`Failed to handle MCP message: ${error.message}`);
        // SSE连接失效时，降级到无状态模式
        return this.handleStatelessMessage(req, res);
      }
    } else {
      // 没有活跃SSE连接时，使用无状态JSON-RPC模式处理
      return this.handleStatelessMessage(req, res);
    }
  }

  /**
   * 无状态模式处理MCP JSON-RPC消息
   * 当SSE连接不可用时，直接处理JSON-RPC请求
   */
  private async handleStatelessMessage(req: Request, res: Response) {
    this.logger.log('Handling MCP message in stateless mode');
    
    try {
      const body = req.body;
      
      // 检查请求体是否为空或无效
      if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
        this.logger.warn('Empty or invalid request body received');
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { 
            code: -32700, 
            message: 'Parse error: Empty or invalid JSON body. Please send a valid JSON-RPC 2.0 request with jsonrpc, method, and id fields.' 
          },
          id: null
        });
      }

      const { jsonrpc, method, params, id } = body;

      // 验证JSON-RPC版本
      if (jsonrpc !== '2.0') {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' },
          id: id || null
        });
      }

      this.logger.log(`Stateless MCP method: ${method}, id: ${id}`);

      // 处理不同的MCP方法
      let result: any;

      switch (method) {
        case 'initialize':
          // MCP初始化请求
          result = {
            protocolVersion: '2024-11-05',
            capabilities: this.mcpService.getCapabilities(),
            serverInfo: {
              name: 'agentrix-mcp-server',
              version: '1.0.0'
            }
          };
          break;

        case 'tools/list':
          // 列出可用工具
          const tools = await this.mcpService.getToolsList();
          result = { tools };
          break;

        case 'tools/call':
          // 调用工具（带认证上下文）
          if (!params?.name) {
            return res.status(400).json({
              jsonrpc: '2.0',
              error: { code: -32602, message: 'Invalid params: tool name required' },
              id
            });
          }
          
          // 提取认证上下文
          const authContext = await this.mcpAuthContextService.extractAuthContext(req);
          
          // 验证工具权限
          if (!this.mcpAuthContextService.validateToolPermission(authContext, params.name)) {
            this.logger.warn(`Tool permission denied: ${params.name}, auth=${authContext.authMethod}`);
            return res.status(403).json({
              jsonrpc: '2.0',
              error: { 
                code: -32600, 
                message: `Permission denied for tool: ${params.name}. Authentication required.`,
                data: {
                  authRequired: true,
                  authUrl: '/api/auth/mcp/authorize',
                }
              },
              id
            });
          }
          
          // 创建安全的工具调用上下文
          const secureContext = this.mcpAuthContextService.createSecureToolContext(
            authContext, 
            params.arguments || {}
          );
          
          // 调用工具（传递安全上下文）
          result = await this.mcpService.callToolWithContext(
            params.name, 
            params.arguments || {},
            secureContext
          );
          break;

        case 'resources/list':
          result = { resources: [] };
          break;

        case 'prompts/list':
          result = { prompts: [] };
          break;

        case 'ping':
          result = {};
          break;

        case 'notifications/initialized':
          // 客户端初始化完成通知，不需要响应
          return res.status(202).send('Accepted');

        default:
          return res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32601, message: `Method not found: ${method}` },
            id
          });
      }

      // 返回JSON-RPC响应
      return res.json({
        jsonrpc: '2.0',
        result,
        id
      });

    } catch (error: any) {
      this.logger.error(`Stateless MCP error: ${error.message}`);
      return res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: `Internal error: ${error.message}` },
        id: req.body?.id || null
      });
    }
  }

  /**
   * 获取 OpenAPI Schema
   * 用于 Gemini Extensions 或 Grok Tools
   */
  @Get('openapi.json')
  async getOpenApi() {
    return this.mcpService.getOpenApiSchema();
  }

  /**
   * REST 桥接：执行 Tool 调用
   * 用于不支持 MCP 的平台通过 REST 调用
   */
  @Post('tool/:name')
  async callTool(
    @Param('name') name: string, 
    @Body() args: any,
    @Req() req: Request,
  ) {
    // 提取认证上下文
    const authContext = await this.mcpAuthContextService.extractAuthContext(req);
    
    // 验证工具权限
    if (!this.mcpAuthContextService.validateToolPermission(authContext, name)) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'PERMISSION_DENIED',
            message: `Permission denied for tool: ${name}. Authentication required.`,
            authRequired: true,
            authUrl: '/api/auth/mcp/authorize',
          })
        }],
      };
    }
    
    // 创建安全上下文并调用
    const secureContext = this.mcpAuthContextService.createSecureToolContext(authContext, args);
    return this.mcpService.callToolWithContext(name, args, secureContext);
  }

  // ============ 意图支付前端 API ============

  /**
   * 解析自然语言支付意图
   * 前端输入框提交意图后调用
   */
  @Post('intent-parse')
  async parseIntent(@Body() body: { intent: string }, @Req() req: Request) {
    const authContext = await this.mcpAuthContextService.extractAuthContext(req);
    const secureContext = this.mcpAuthContextService.createSecureToolContext(authContext, body);
    
    return this.mcpService.callToolWithContext('agent_payment', { intent: body.intent }, secureContext);
  }

  /**
   * 确认意图支付
   */
  @Post('intent-confirm')
  async confirmIntent(@Body() body: { confirmationId: string }, @Req() req: Request) {
    const authContext = await this.mcpAuthContextService.extractAuthContext(req);
    const secureContext = this.mcpAuthContextService.createSecureToolContext(authContext, body);
    
    return this.mcpService.callToolWithContext('agent_payment_confirm', body, secureContext);
  }

  /**
   * 拒绝/取消意图支付
   */
  @Post('intent-reject')
  async rejectIntent(@Body() body: { confirmationId: string; reason?: string }, @Req() req: Request) {
    const authContext = await this.mcpAuthContextService.extractAuthContext(req);
    const secureContext = this.mcpAuthContextService.createSecureToolContext(authContext, body);
    
    return this.mcpService.callToolWithContext('agent_payment_reject', body, secureContext);
  }

  /**
   * 提交 Audit Proof
   * 用于任务完成后提交证明触发分账
   */
  @Post('audit-proof')
  async submitAuditProof(
    @Body() body: { taskId: string; orderId: string; resultHash: string; proofData?: any },
    @Req() req: Request,
  ) {
    const authContext = await this.mcpAuthContextService.extractAuthContext(req);
    const secureContext = this.mcpAuthContextService.createSecureToolContext(authContext, body);
    
    return this.mcpService.callToolWithContext('submit_audit_proof', body, secureContext);
  }
}

