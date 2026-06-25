import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentAuthorizationService } from './agent-authorization.service';
import { StrategyPermissionEngine } from './strategy-permission-engine.service';
import { CreateAgentAuthorizationDto } from './dto/create-agent-authorization.dto';
import { SessionService } from '../session/session.service';

/**
 * Agent授权控制器
 * 注意：这是独立模块，不影响现有支付功能
 */
@Controller('agent-authorization')
@UseGuards(JwtAuthGuard)
export class AgentAuthorizationController {
  constructor(
    private readonly agentAuthorizationService: AgentAuthorizationService,
    private readonly strategyPermissionEngine: StrategyPermissionEngine,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * 创建Agent授权
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createAuthorization(
    @Body() dto: CreateAgentAuthorizationDto,
    @Request() req: any,
  ) {
    // 确保userId来自认证用户
    dto.userId = req.user.id;
    return await this.agentAuthorizationService.createAgentAuthorization(dto);
  }

  @Post('bootstrap/erc8004')
  @HttpCode(HttpStatus.CREATED)
  async bootstrapFromActiveSession(
    @Body() body: { agentId: string; walletAddress?: string },
    @Request() req: any,
  ) {
    const activeSession = await this.sessionService.getActiveSession(req.user.id);
    if (!activeSession?.sessionId) {
      return {
        success: false,
        message: 'No active ERC8004 session found',
      };
    }

    const authorization = await this.agentAuthorizationService.ensureErc8004Authorization({
      userId: req.user.id,
      agentId: body.agentId,
      walletAddress: body.walletAddress || activeSession.signer,
      sessionId: activeSession.sessionId,
      singleLimit: Number(activeSession.singleLimit || 0),
      dailyLimit: Number(activeSession.dailyLimit || 0),
      expiry: activeSession.expiry ? new Date(activeSession.expiry) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return {
      success: true,
      authorization,
      session: activeSession,
    };
  }

  /**
   * 获取Agent的激活授权
   */
  @Get('agent/:agentId/active')
  async getActiveAuthorization(@Param('agentId') agentId: string) {
    return await this.agentAuthorizationService.getActiveAuthorization(agentId);
  }

  /**
   * 获取Agent的所有授权
   */
  @Get('agent/:agentId')
  async getAuthorizationsByAgentId(@Param('agentId') agentId: string) {
    return await this.agentAuthorizationService.getAuthorizationsByAgentId(agentId);
  }

  /**
   * 获取用户的所有Agent授权
   */
  @Get('user')
  async getAuthorizationsByUserId(@Request() req: any) {
    return await this.agentAuthorizationService.getAuthorizationsByUserId(req.user.id);
  }

  /**
   * 撤销授权
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAuthorization(@Param('id') id: string) {
    await this.agentAuthorizationService.revokeAuthorization(id);
  }

  /**
   * 检查策略权限（用于测试）
   */
  @Post('check-permission')
  async checkPermission(
    @Body()
    body: {
      agentId: string;
      strategyType: string;
      amount: number;
      tokenAddress: string;
      dexName?: string;
      cexName?: string;
    },
  ) {
    return await this.agentAuthorizationService.checkStrategyPermission(
      body.agentId,
      body.strategyType,
      body.amount,
      body.tokenAddress,
      body.dexName,
      body.cexName,
    );
  }
}

