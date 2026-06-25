import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AgentTaskSpawnService,
  SpawnDto,
  SpawnResult,
} from './agent-task-spawn.service';

interface AuthedRequest {
  user?: { sub?: string; userId?: string };
}

function userIdOf(req: AuthedRequest): string {
  const id = req.user?.sub || req.user?.userId;
  if (!id) throw new Error('unauthenticated');
  return String(id);
}

/**
 * Multi-Agent Collaboration HTTP entry points.
 *
 * Spec: multi-agent-collaboration-2026-06 W2.2
 * Design: §3.3
 */
@Controller('agent-tasks')
@UseGuards(JwtAuthGuard)
export class MultiAgentController {
  constructor(private readonly spawnService: AgentTaskSpawnService) {}

  /**
   * POST /api/agent-tasks/spawn
   * Body: SpawnDto without userId (server enforces from JWT).
   */
  @Post('spawn')
  async spawn(
    @Req() req: AuthedRequest,
    @Body()
    body: Omit<SpawnDto, 'userId'>,
  ): Promise<SpawnResult> {
    const userId = userIdOf(req);
    return this.spawnService.dispatch({ ...body, userId });
  }
}
