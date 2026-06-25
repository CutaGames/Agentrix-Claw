import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // 对于Public路由，尝试解析token（如果存在），但不强制要求
      // 这样可以在有token时获取用户信息，但没有token时也能正常工作
      const result = super.canActivate(context);
      if (result instanceof Promise) {
        return result.catch(() => true);
      }
      return result;
    }
    return super.canActivate(context);
  }
}

