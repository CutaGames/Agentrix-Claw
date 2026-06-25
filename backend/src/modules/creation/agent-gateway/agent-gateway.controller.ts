import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AgentGatewayService } from './agent-gateway.service';
import { AgentBudgetService } from './agent-budget.service';
import type {
  InvokeCreationRequest,
  InvokeCreationResponse,
  GetCreationManifestResponse,
} from '../../../../shared/types/creation-api';

/** 「我的 Agent 代付」额度设置请求(task 9.4 前端调用)。 */
interface SetBudgetRequest {
  presetBudgetAxp: number;
  whitelistCreationIds?: string[];
}

/**
 * AgentGatewayController — Agent 机器面 REST 入口(world-creation-feed task 9.1/9.2/9.4)。
 *
 * spec: design §Components and Interfaces / §Agent Invocation
 *   - GET  /v1/creations/:id/manifest        机器可读能力清单(MCP 工具,需求 1.11/13.3)
 *   - POST /v1/creations/:id/invoke          标准动词调用(经网关:鉴权/额度/审计,需求 13.2–13.7)
 *   - GET  /v1/creations/agent/budget        读取我的预设额度用量(需求 13.4,task 9.4)
 *   - POST /v1/creations/agent/budget        设置我的预设额度(需求 13.4 授权,task 9.4)
 *
 * 鉴权:JwtAuthGuard。invoke 的发起 Agent id 取认证主体;`onBehalfOfAccountId` 为被代表
 * 用户(额度/审计主体)。
 *
 * 注:`agent/budget` 路由置于 `:id/...` 之前声明,避免 `agent` 被当作 `:id` 捕获。
 */
@ApiTags('creation')
@Controller('v1/creations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgentGatewayController {
  constructor(
    private readonly gateway: AgentGatewayService,
    private readonly budget: AgentBudgetService,
  ) {}

  /** GET /v1/creations/agent/budget — 读取我的预设额度与用量(task 9.4)。 */
  @Get('agent/budget')
  @ApiOperation({ summary: 'Read my Agent preset budget + usage' })
  async getBudget(@Request() req: any) {
    const accountId = req.user?.id ?? req.user?.sub;
    return this.budget.snapshot(accountId);
  }

  /** POST /v1/creations/agent/budget — 设置我的预设额度(需求 13.4 授权)。 */
  @Post('agent/budget')
  @ApiOperation({ summary: 'Set my Agent preset budget (authorization)' })
  async setBudget(@Request() req: any, @Body() body: SetBudgetRequest) {
    const accountId = req.user?.id ?? req.user?.sub;
    const row = await this.budget.setBudget(
      accountId,
      body.presetBudgetAxp,
      body.whitelistCreationIds,
    );
    return {
      preset: Number(row.presetBudgetAxp),
      whitelist: row.whitelistCreationIds ?? [],
    };
  }

  /** GET /v1/creations/:id/manifest — 机器可读能力清单(需求 1.11/13.3)。 */
  @Get(':id/manifest')
  @ApiOperation({ summary: 'Read a Creation machine-readable capability manifest (MCP tools)' })
  async manifest(@Param('id') id: string): Promise<GetCreationManifestResponse> {
    return this.gateway.getManifest(id);
  }

  /** POST /v1/creations/:id/invoke — Agent 标准动词调用(需求 13.2–13.7)。 */
  @Post(':id/invoke')
  @ApiOperation({ summary: 'Agent standard-verb invocation via the gateway' })
  async invoke(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: InvokeCreationRequest,
  ): Promise<InvokeCreationResponse> {
    const agentId = req.user?.id ?? req.user?.sub;
    // onBehalfOfAccountId 缺省回填为认证用户(用户自己的 Agent 代自己)。
    const reqBody: InvokeCreationRequest = {
      ...body,
      onBehalfOfAccountId: body.onBehalfOfAccountId ?? agentId,
    };
    return this.gateway.invoke(agentId, id, reqBody);
  }
}
