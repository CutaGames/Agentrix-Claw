import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorldEngineFeatureFlagService } from '../feature-flag.service';

@Injectable()
export class WorldEngineFlagGuard implements CanActivate {
  constructor(private readonly flagService: WorldEngineFeatureFlagService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId) {
      throw new NotFoundException();
    }
    const enabled = await this.flagService.isEnabledForUser(userId);
    if (!enabled) {
      throw new NotFoundException();
    }
    return true;
  }
}
