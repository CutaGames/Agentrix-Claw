import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const IS_PUBLIC_KEY = 'isPublic';

/**
 * Ensures the authenticated user carries an admin-type JWT.
 * Apply alongside JwtAuthGuard on admin-only controllers/routes.
 * Automatically skips routes decorated with @Public().
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.type !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
