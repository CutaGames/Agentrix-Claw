import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyService } from '../api-key.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    let apiKey = request.headers['x-api-key'] || request.query['api_key'];

    // 支持 Authorization: Bearer <key> 格式 (ChatGPT 常用)
    const authHeader = request.headers['authorization'];
    if (!apiKey && authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    }

    if (!apiKey) {
      throw new UnauthorizedException('API Key is required');
    }

    try {
      const result = await this.apiKeyService.validateApiKey(apiKey);
      
      // 将验证结果附加到请求对象
      request.user = {
        id: result.userId,
        scopes: result.scopes,
        isPlatform: result.isPlatform,
        mode: result.mode,
      };
      
      return true;
    } catch (error) {
      throw new UnauthorizedException(error.message || 'Invalid API Key');
    }
  }
}
