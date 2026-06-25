import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreationRealityService } from './creation-reality.service';
import type {
  BindCreationPoiRequest,
  BindCreationPoiResponse,
  CheckinCreationRequest,
  CheckinCreationResponse,
} from '../../../../shared/types/creation-api';

/**
 * CreationRealityController — Creation 现实关联 REST 入口(world-creation-feed task 10.2)。
 *
 * spec: design §Components and Interfaces — `POST /:id/poi`、`POST /:id/checkin`;需求 9.1/9.2。
 */
@ApiTags('creation')
@Controller('v1/creations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CreationRealityController {
  constructor(private readonly reality: CreationRealityService) {}

  /** POST /v1/creations/:id/poi — 绑定真实商家 POI(需求 9.1)。 */
  @Post(':id/poi')
  @ApiOperation({ summary: 'Bind a real-world merchant POI to a Creation' })
  async bindPoi(
    @Param('id') id: string,
    @Body() body: BindCreationPoiRequest,
  ): Promise<BindCreationPoiResponse> {
    return this.reality.bindPoi(id, body.poi);
  }

  /** POST /v1/creations/:id/checkin — 到访签到(需求 9.2)。 */
  @Post(':id/checkin')
  @ApiOperation({ summary: 'Geo check-in at a Creation (reward AXP within radius)' })
  async checkin(
    @Param('id') id: string,
    @Body() body: CheckinCreationRequest,
  ): Promise<CheckinCreationResponse> {
    return this.reality.checkin(id, body.location);
  }
}
