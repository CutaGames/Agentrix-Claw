import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiKeyGuard } from '../../api-key/guards/api-key.guard';

@Injectable()
export class UnifiedAuthGuard implements CanActivate {
  constructor(
    private jwtAuthGuard: JwtAuthGuard,
    private apiKeyGuard: ApiKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 1. 尝试从不同来源获取 API Key
    let apiKey = request.headers['x-api-key'] || request.query['api_key'];

    // 如果还没有，检查 Authorization Bearer (ChatGPT 等 GPTs 常用)
    const authHeader = request.headers['authorization'];
    if (!apiKey && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // 根据 Agentrix API Key 的特征（通常长度较短或有特定前缀，如 ag_）判断
      // 如果不是 JWT 格式（三个部分），或者包含特定的 API Key 前缀，则认为是 API Key
      if (!token.includes('.') || token.startsWith('ag_')) {
        apiKey = token;
      }
    }

    if (apiKey) {
      try {
        return await this.apiKeyGuard.canActivate(context) as boolean;
      } catch (e) {
        // 如果明确提供了 API Key 但无效
        throw e;
      }
    }

    // 2. 尝试 JWT
    try {
      return await this.jwtAuthGuard.canActivate(context) as boolean;
    } catch (e) {
      // 如果两者都没有或都无效
      throw e;
    }
  }
}
