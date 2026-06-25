import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { McpServer, McpTransport, McpServerStatus } from '../../entities/mcp-server.entity';

@Injectable()
export class McpServerRegistryService {
  private readonly logger = new Logger(McpServerRegistryService.name);

  constructor(
    @InjectRepository(McpServer)
    private readonly mcpServerRepo: Repository<McpServer>,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // Server Registration CRUD
  // ═══════════════════════════════════════════════════════════════════════

  async listServers(userId: string): Promise<McpServer[]> {
    return this.mcpServerRepo.find({
      where: { userId },
      order: { name: 'ASC' },
    });
  }

  async getServer(serverId: string): Promise<McpServer | null> {
    return this.mcpServerRepo.findOne({ where: { id: serverId } });
  }

  async registerServer(userId: string, data: {
    name: string;
    description?: string;
    transport: McpTransport;
    url?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    auth?: McpServer['auth'];
  }): Promise<McpServer> {
    const server = this.mcpServerRepo.create({
      ...data,
      userId,
      status: McpServerStatus.DISCONNECTED,
      isEnabled: true,
    });
    return this.mcpServerRepo.save(server);
  }

  async updateServer(serverId: string, data: Partial<McpServer>): Promise<McpServer | null> {
    const server = await this.mcpServerRepo.findOne({ where: { id: serverId } });
    if (!server) return null;
    Object.assign(server, data);
    return this.mcpServerRepo.save(server);
  }

  async deleteServer(serverId: string): Promise<boolean> {
    const result = await this.mcpServerRepo.delete(serverId);
    return (result.affected || 0) > 0;
  }

  async toggleServer(serverId: string, enabled: boolean): Promise<McpServer | null> {
    const server = await this.mcpServerRepo.findOne({ where: { id: serverId } });
    if (!server) return null;
    server.isEnabled = enabled;
    return this.mcpServerRepo.save(server);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Tool Discovery
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Connect to an MCP server and discover its tools.
   * For SSE/HTTP: sends a JSON-RPC tools/list request.
   * For stdio: would need a local process (not supported from backend, desktop-only).
   */
  async discoverTools(serverId: string): Promise<McpServer> {
    const server = await this.mcpServerRepo.findOne({ where: { id: serverId } });
    if (!server) throw new Error('Server not found');

    if (server.transport === McpTransport.STDIO) {
      // stdio MCP servers run locally — discovery happens on the desktop client
      this.logger.warn(`stdio transport discovery not supported from backend: ${server.name}`);
      server.status = McpServerStatus.DISCONNECTED;
      server.lastError = 'stdio transport requires desktop client for discovery';
      return this.mcpServerRepo.save(server);
    }

    server.status = McpServerStatus.CONNECTING;
    await this.mcpServerRepo.save(server);

    try {
      const tools = await this.fetchToolsFromServer(server);
      server.discoveredTools = tools;
      server.toolCount = tools.length;
      server.status = McpServerStatus.CONNECTED;
      server.lastConnectedAt = new Date();
      server.lastError = undefined;
      this.logger.log(`Discovered ${tools.length} tools from MCP server "${server.name}"`);
    } catch (err: any) {
      server.status = McpServerStatus.ERROR;
      server.lastError = err.message;
      this.logger.warn(`MCP tool discovery failed for "${server.name}": ${err.message}`);
    }

    return this.mcpServerRepo.save(server);
  }

  /**
   * Get all enabled MCP server tools for a user, formatted as Claude/OpenAI tool schemas.
   */
  async getUserMcpTools(userId: string): Promise<Array<{
    name: string;
    description: string;
    input_schema: Record<string, any>;
    mcpServerId: string;
    mcpServerName: string;
  }>> {
    const servers = await this.mcpServerRepo.find({
      where: { userId, isEnabled: true },
    });

    const tools: Array<{
      name: string;
      description: string;
      input_schema: Record<string, any>;
      mcpServerId: string;
      mcpServerName: string;
    }> = [];

    for (const server of servers) {
      if (!server.discoveredTools?.length) continue;
      for (const tool of server.discoveredTools) {
        tools.push({
          name: `mcp_${server.name.replace(/\s+/g, '_').toLowerCase()}_${tool.name}`,
          description: `[MCP: ${server.name}] ${tool.description || tool.name}`,
          input_schema: tool.inputSchema || { type: 'object', properties: {} },
          mcpServerId: server.id,
          mcpServerName: server.name,
        });
      }
    }

    return tools;
  }

  /**
   * Execute a tool call against an MCP server.
   */
  async executeToolCall(serverId: string, toolName: string, args: Record<string, any>): Promise<any> {
    const server = await this.mcpServerRepo.findOne({ where: { id: serverId } });
    if (!server || !server.url) {
      throw new Error('MCP server not found or has no URL');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (server.auth?.type === 'bearer' && server.auth.token) {
      headers['Authorization'] = `Bearer ${server.auth.token}`;
    }

    const rpcPayload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(server.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(rpcPayload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`MCP server returned ${res.status}`);
      }

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      return data.result;
    } catch (err: any) {
      clearTimeout(timer);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal
  // ═══════════════════════════════════════════════════════════════════════

  private async fetchToolsFromServer(server: McpServer): Promise<Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, any>;
  }>> {
    if (!server.url) throw new Error('Server URL is required for SSE/HTTP transport');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (server.auth?.type === 'bearer' && server.auth.token) {
      headers['Authorization'] = `Bearer ${server.auth.token}`;
    }

    // JSON-RPC tools/list
    const rpcPayload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(server.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(rpcPayload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      }

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      // MCP tools/list response: { result: { tools: [...] } }
      const tools = data.result?.tools || data.tools || [];
      return tools.map((t: any) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
    } catch (err: any) {
      clearTimeout(timer);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // P3: OAuth/OIDC Token Exchange
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Exchange OAuth2 credentials for an access token.
   * Used when an MCP server requires OAuth2 authentication.
   */
  async exchangeOAuthToken(server: McpServer): Promise<string | null> {
    if (server.auth?.type !== 'oauth2') return null;
    if (!server.auth.tokenUrl || !server.auth.clientId) return null;

    try {
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: server.auth.clientId,
        ...(server.auth.clientSecret ? { client_secret: server.auth.clientSecret } : {}),
        ...(server.auth.scopes?.length ? { scope: server.auth.scopes.join(' ') } : {}),
      });

      const res = await fetch(server.auth.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        this.logger.warn(`OAuth token exchange failed for ${server.name}: HTTP ${res.status}`);
        return null;
      }

      const data = await res.json();
      return data.access_token || null;
    } catch (err: any) {
      this.logger.warn(`OAuth token exchange error for ${server.name}: ${err.message}`);
      return null;
    }
  }

  /**
   * Build auth headers for an MCP server request, handling all auth types.
   */
  async buildAuthHeaders(server: McpServer): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (!server.auth) return headers;

    switch (server.auth.type) {
      case 'bearer':
        if (server.auth.token) {
          headers['Authorization'] = `Bearer ${server.auth.token}`;
        }
        break;

      case 'oauth2': {
        const token = await this.exchangeOAuthToken(server);
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        break;
      }

      case 'api_key':
        if (server.auth.token) {
          headers['X-API-Key'] = server.auth.token;
        }
        break;
    }

    return headers;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // P3: Desktop Stdio Relay Bridge
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Register a stdio MCP server discovered by the desktop client.
   * Desktop Tauri sidecar discovers tools locally and pushes them to backend.
   */
  async registerDesktopDiscoveredTools(
    serverId: string,
    tools: Array<{ name: string; description?: string; inputSchema?: Record<string, any> }>,
  ): Promise<McpServer | null> {
    const server = await this.mcpServerRepo.findOne({ where: { id: serverId } });
    if (!server) return null;

    server.discoveredTools = tools;
    server.toolCount = tools.length;
    server.status = McpServerStatus.CONNECTED;
    server.lastConnectedAt = new Date();
    server.lastError = undefined;

    this.logger.log(`Desktop relay: registered ${tools.length} stdio tools for "${server.name}"`);
    return this.mcpServerRepo.save(server);
  }

  /**
   * Relay a tool call to a desktop stdio MCP server via WebSocket.
   * The backend sends the call to the desktop client which executes it locally.
   */
  async relayStdioToolCall(
    serverId: string,
    toolName: string,
    args: Record<string, any>,
    userId: string,
  ): Promise<{ relayed: boolean; result?: any; error?: string }> {
    const server = await this.mcpServerRepo.findOne({ where: { id: serverId } });
    if (!server || server.transport !== McpTransport.STDIO) {
      return { relayed: false, error: 'Not a stdio server' };
    }

    // Relay via WebSocket to desktop client
    // The desktop client handles actual stdio process execution
    try {
      const { RelayRegistry } = await import('../openclaw-connection/telegram-bot.service');
      const relayTarget = `mcp-${serverId}`;
      RelayRegistry.emitToAgent(relayTarget, {
        type: 'mcp-tool-call',
        serverId,
        toolName,
        args,
        requestId: `mcp-${Date.now()}`,
      });

      return { relayed: true };
    } catch (err: any) {
      return { relayed: false, error: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // P3: Mobile Relay (backend proxies MCP calls for mobile clients)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Execute an MCP tool call on behalf of a mobile client.
   * Mobile clients cannot connect to MCP servers directly.
   * The backend acts as proxy.
   */
  async proxyToolCallForMobile(
    userId: string,
    serverIdOrName: string,
    toolName: string,
    args: Record<string, any>,
  ): Promise<any> {
    // Find the server by ID or name
    let server = await this.mcpServerRepo.findOne({ where: { id: serverIdOrName, userId } });
    if (!server) {
      server = await this.mcpServerRepo.findOne({ where: { name: serverIdOrName, userId } });
    }
    if (!server) throw new Error('MCP server not found');

    if (server.transport === McpTransport.STDIO) {
      const relay = await this.relayStdioToolCall(server.id, toolName, args, userId);
      if (!relay.relayed) throw new Error(relay.error || 'Stdio relay failed');
      return relay.result;
    }

    // For SSE/HTTP servers, execute directly
    return this.executeToolCall(server.id, toolName, args);
  }
}
