import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreationExperienceService } from './creation-experience.service';
import { CreationPresenceService, type CreationPresenceDescriptor } from '../presence/creation-presence.service';
import type {
  EnterCreationRequest,
  EnterCreationResponse,
} from '../../../../shared/types/creation-api';

/**
 * CreationExperienceController — 统一进入体验 REST 入口(world-creation-feed task 5.1)。
 *
 * spec: design §Components and Interfaces — `POST /v1/creations/:id/enter`;需求 6.1–6.7。
 * 编排在 {@link CreationExperienceService}(解析 ECS_World/隔离级/只读资产);
 * 进入超时为客户端竞速(LOAD_TIMEOUT 回退,需求 6.5)。
 */
@ApiTags('creation')
@Controller('v1/creations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CreationExperienceController {
  constructor(
    private readonly experience: CreationExperienceService,
    private readonly presence: CreationPresenceService,
  ) {}

  /** GET /v1/creations/:id/presence — 实时同框加入描述符(复用 aeon realtime,需求 8.5)。 */
  @Get(':id/presence')
  @ApiOperation({ summary: 'Realtime co-presence join descriptor (reuses aeon realtime)' })
  async presenceDescriptor(@Param('id') id: string): Promise<CreationPresenceDescriptor> {
    return this.presence.getDescriptor(id);
  }

  /** POST /v1/creations/:id/enter — 进入体验(解析 ECS_World/隔离级/只读资产)。 */
  @Post(':id/enter')
  @ApiOperation({ summary: 'Enter a Creation experience (resolve ECS_World / isolation / readonly assets)' })
  async enter(
    @Param('id') id: string,
    @Body() body: EnterCreationRequest = {},
  ): Promise<EnterCreationResponse> {
    return this.experience.enter(id, body);
  }
}
