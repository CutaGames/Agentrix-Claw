import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

/**
 * MCP 认证上下文
 */
export interface McpAuthContext {
  userId?: string;
  agentId?: string;
  sessionId?: string;
  isAuthenticated: boolean;
  authMethod: 'oauth' | 'jwt' | 'api_key' | 'guest' | 'none';
  permissions: string[];
  metadata?: {
    clientId?: string;
    platform?: string; // 'chatgpt' | 'claude' | 'gemini' | 'grok'
    userAgent?: string;
  };
}

/**
 * MCP OAuth Token 数据
 */
export interface McpOAuthToken {
  userId: string;
  clientId: string;
  scope: string[];
  expiresAt: Date;
  platform?: string;
}

/**
 * MCP 认证上下文服务
 * 负责从 MCP 请求中提取和验证用户身份
 */
@Injectable()
export class McpAuthContextService {
  private readonly logger = new Logger(McpAuthContextService.name);
  
  // 存储 OAuth token -> 用户信息的映射
  private tokenStore: Map<string, McpOAuthToken> = new Map();

  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {}

  /**
   * 从请求中提取认证上下文
   */
  async extractAuthContext(req: Request): Promise<McpAuthContext> {
    const authHeader = req.headers.authorization;
    const userAgent = req.headers['user-agent'] || '';
    
    // 检测平台
    const platform = this.detectPlatform(userAgent);
    
    // 1. 尝试 OAuth Bearer Token
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // 检查是否是 MCP OAuth token
      if (token.startsWith('mcp_token_')) {
        const tokenData = this.tokenStore.get(token);
        if (tokenData && tokenData.expiresAt > new Date()) {
          return {
            userId: tokenData.userId,
            isAuthenticated: true,
            authMethod: 'oauth',
            permissions: tokenData.scope,
            metadata: {
              clientId: tokenData.clientId,
              platform: tokenData.platform || platform,
              userAgent,
            },
          };
        }
      }
      
      // 尝试 JWT 验证
      try {
        const payload = this.jwtService.verify(token);
        return {
          userId: payload.sub || payload.userId,
          isAuthenticated: true,
          authMethod: 'jwt',
          permissions: payload.permissions || ['read', 'write'],
          metadata: {
            platform,
            userAgent,
          },
        };
      } catch (e) {
        this.logger.debug('JWT verification failed, trying other methods');
      }
    }
    
    // 2. 尝试 API Key (通常在 x-api-key header)
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      const apiKeyData = await this.validateApiKey(apiKey);
      if (apiKeyData) {
        return {
          userId: apiKeyData.userId,
          agentId: apiKeyData.agentId,
          isAuthenticated: true,
          authMethod: 'api_key',
          permissions: apiKeyData.permissions,
          metadata: {
            platform,
            userAgent,
          },
        };
      }
    }
    
    // 3. 检查查询参数中的 session
    const sessionId = req.query.sessionId as string;
    
    // 4. 返回游客上下文
    return {
      sessionId,
      isAuthenticated: false,
      authMethod: 'none',
      permissions: ['read'], // 游客只有只读权限
      metadata: {
        platform,
        userAgent,
      },
    };
  }

  /**
   * 检测调用平台
   */
  private detectPlatform(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    if (ua.includes('chatgpt') || ua.includes('openai')) return 'chatgpt';
    if (ua.includes('claude') || ua.includes('anthropic')) return 'claude';
    if (ua.includes('gemini') || ua.includes('google')) return 'gemini';
    if (ua.includes('grok') || ua.includes('xai')) return 'grok';
    return 'unknown';
  }

  /**
   * 验证 API Key
   */
  private async validateApiKey(apiKey: string): Promise<{
    userId: string;
    agentId?: string;
    permissions: string[];
  } | null> {
    // 简单验证格式
    if (!apiKey.startsWith('agx_')) {
      return null;
    }
    
    // TODO: 从数据库验证 API Key
    // 这里返回一个简化的实现
    return null;
  }

  /**
   * 创建 OAuth Token（用于 MCP OAuth 流程）
   */
  createOAuthToken(userId: string, clientId: string, scope: string[], platform?: string): string {
    const token = `mcp_token_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1小时过期
    
    this.tokenStore.set(token, {
      userId,
      clientId,
      scope,
      expiresAt,
      platform,
    });
    
    return token;
  }

  /**
   * 撤销 OAuth Token
   */
  revokeToken(token: string): void {
    this.tokenStore.delete(token);
  }

  /**
   * 验证工具调用权限
   */
  validateToolPermission(context: McpAuthContext, toolName: string): boolean {
    // 定义需要认证的工具
    const authRequiredTools = [
      'quick_purchase',
      'confirm_payment',
      'pay_with_wallet',
      'setup_quickpay',
      'create_wallet',
      'setup_agent_authorization',
      'agent_authorize',
      'x402_pay',
      'x402_authorize',
      'subscribe_service',
    ];
    
    // 定义需要写权限的工具
    const writePermissionTools = [
      'create_order',
      'create_pay_intent',
      'purchase_asset',
      ...authRequiredTools,
    ];
    
    // 检查是否需要认证
    if (authRequiredTools.includes(toolName) && !context.isAuthenticated) {
      return false;
    }
    
    // 检查写权限
    if (writePermissionTools.includes(toolName) && !context.permissions.includes('write')) {
      return false;
    }
    
    return true;
  }

  /**
   * 获取工具调用所需的用户 ID
   * 安全地从上下文中获取，而不是从参数中获取
   */
  getUserIdForToolCall(context: McpAuthContext, toolArgs: any): string | null {
    // 优先使用认证上下文中的 userId
    if (context.isAuthenticated && context.userId) {
      return context.userId;
    }
    
    // 对于只读操作，允许使用参数中的 userId（但记录警告）
    if (toolArgs.userId && context.permissions.includes('read')) {
      this.logger.warn(`Using userId from args (not from auth context): ${toolArgs.userId}`);
      return toolArgs.userId;
    }
    
    return null;
  }

  /**
   * 生成安全的工具调用上下文
   */
  createSecureToolContext(context: McpAuthContext, toolArgs: any): {
    userId: string | null;
    agentId: string | null;
    isAuthenticated: boolean;
    platform: string;
    originalArgs: any;
  } {
    return {
      userId: this.getUserIdForToolCall(context, toolArgs),
      agentId: context.agentId || toolArgs.agentId || null,
      isAuthenticated: context.isAuthenticated,
      platform: context.metadata?.platform || 'unknown',
      originalArgs: { ...toolArgs, userId: undefined }, // 移除参数中的 userId
    };
  }
}
