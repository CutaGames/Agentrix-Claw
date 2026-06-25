import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AutoEarnService } from './auto-earn.service';
import { AirdropService } from './airdrop.service';
import { ArbitrageService } from './arbitrage.service';
import { LaunchpadService } from './launchpad.service';
import { StrategyService } from './strategy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('auto-earn')
@Controller('auto-earn')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AutoEarnController {
  constructor(
    private readonly autoEarnService: AutoEarnService,
    private readonly airdropService: AirdropService,
    private readonly arbitrageService: ArbitrageService,
    private readonly launchpadService: LaunchpadService,
    private readonly strategyService: StrategyService,
  ) {}

  @Get('tasks')
  @ApiOperation({ summary: '获取Auto-Earn任务列表' })
  @ApiResponse({ status: 200, description: '返回任务列表' })
  async getTasks(@Request() req: any, @Query('agentId') agentId?: string) {
    return this.autoEarnService.getTasks(req.user?.id, agentId);
  }

  @Post('tasks/:taskId/execute')
  @ApiOperation({ summary: '执行Auto-Earn任务' })
  @ApiResponse({ status: 200, description: '返回执行结果' })
  async executeTask(
    @Request() req: any,
    @Param('taskId') taskId: string,
    @Body() body?: { agentId?: string },
  ) {
    return this.autoEarnService.executeTask(req.user?.id, taskId, body?.agentId);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取Auto-Earn统计数据' })
  @ApiResponse({ status: 200, description: '返回统计数据' })
  async getStats(@Request() req: any, @Query('agentId') agentId?: string) {
    return this.autoEarnService.getStats(req.user?.id, agentId);
  }

  @Post('strategies/:strategyId/toggle')
  @ApiOperation({ summary: '启动/停止策略' })
  @ApiResponse({ status: 200, description: '返回策略状态' })
  async toggleStrategy(
    @Request() req: any,
    @Param('strategyId') strategyId: string,
    @Body() body: { enabled: boolean; agentId?: string },
  ) {
    return this.autoEarnService.toggleStrategy(
      req.user?.id,
      strategyId,
      body.enabled,
      body.agentId,
    );
  }

  @Get('airdrops')
  @ApiOperation({ summary: '获取用户的空投列表' })
  @ApiResponse({ status: 200, description: '返回空投列表' })
  async getAirdrops(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('agentId') agentId?: string,
  ) {
    return this.airdropService.getUserAirdrops(
      req.user?.id,
      status as any,
      agentId,
    );
  }

  @Post('airdrops/discover')
  @ApiOperation({ summary: '发现新的空投机会' })
  @ApiResponse({ status: 200, description: '返回发现的空投' })
  async discoverAirdrops(
    @Request() req: any,
    @Body() body?: { agentId?: string },
  ) {
    return this.airdropService.discoverAirdrops(req.user?.id, body?.agentId);
  }

  @Post('airdrops/:airdropId/check-eligibility')
  @ApiOperation({ summary: '检查空投是否符合领取条件' })
  @ApiResponse({ status: 200, description: '返回检查结果' })
  async checkEligibility(
    @Request() req: any,
    @Param('airdropId') airdropId: string,
  ) {
    return this.airdropService.checkEligibility(airdropId, req.user?.id);
  }

  @Post('airdrops/:airdropId/claim')
  @ApiOperation({ summary: '领取空投' })
  @ApiResponse({ status: 200, description: '返回领取结果' })
  async claimAirdrop(
    @Request() req: any,
    @Param('airdropId') airdropId: string,
  ) {
    return this.airdropService.claimAirdrop(airdropId, req.user?.id);
  }

  // ========== 套利功能 ==========

  @Get('arbitrage/opportunities')
  @ApiOperation({ summary: '扫描套利机会' })
  @ApiResponse({ status: 200, description: '返回套利机会列表' })
  async scanArbitrageOpportunities(
    @Query('chains') chains?: string,
    @Query('pairs') pairs?: string,
  ) {
    const chainList = chains ? chains.split(',') : undefined;
    const pairList = pairs ? pairs.split(',') : undefined;
    return this.arbitrageService.scanArbitrageOpportunities(chainList, pairList);
  }

  @Post('arbitrage/execute')
  @ApiOperation({ summary: '执行套利交易' })
  @ApiResponse({ status: 200, description: '返回执行结果' })
  async executeArbitrage(
    @Request() req: any,
    @Body() body: { opportunityId: string; amount: number; agentId?: string },
  ) {
    return this.arbitrageService.executeArbitrage(
      req.user?.id,
      body.opportunityId,
      body.amount,
      body.agentId,
    );
  }

  @Post('arbitrage/auto-strategy')
  @ApiOperation({ summary: '启动自动套利策略' })
  @ApiResponse({ status: 200, description: '返回策略执行结果' })
  async autoArbitrageStrategy(
    @Request() req: any,
    @Body() body: { config: any; agentId?: string },
  ) {
    return this.arbitrageService.autoArbitrageStrategy(
      req.user?.id,
      body.config,
      body.agentId,
    );
  }

  // ========== Launchpad功能 ==========

  @Get('launchpad/projects')
  @ApiOperation({ summary: '发现Launchpad项目' })
  @ApiResponse({ status: 200, description: '返回项目列表' })
  async discoverLaunchpadProjects(@Query('platforms') platforms?: string) {
    const platformList = platforms ? platforms.split(',') : undefined;
    return this.launchpadService.discoverLaunchpadProjects(platformList);
  }

  @Post('launchpad/participate')
  @ApiOperation({ summary: '参与Launchpad项目' })
  @ApiResponse({ status: 200, description: '返回参与结果' })
  async participateInLaunchpad(
    @Request() req: any,
    @Body() body: { projectId: string; amount: number; agentId?: string },
  ) {
    return this.launchpadService.participateInLaunchpad(
      req.user?.id,
      body.projectId,
      body.amount,
      body.agentId,
    );
  }

  @Post('launchpad/auto-strategy')
  @ApiOperation({ summary: '启动自动参与Launchpad策略' })
  @ApiResponse({ status: 200, description: '返回策略执行结果' })
  async autoParticipateStrategy(
    @Request() req: any,
    @Body() body: { config: any; agentId?: string },
  ) {
    return this.launchpadService.autoParticipateStrategy(
      req.user?.id,
      body.config,
      body.agentId,
    );
  }

  // ========== 策略管理 ==========

  @Post('strategies/create')
  @ApiOperation({ summary: '创建策略' })
  @ApiResponse({ status: 200, description: '返回创建的策略' })
  async createStrategy(
    @Request() req: any,
    @Body() body: { type: string; config: any; agentId?: string },
  ) {
    return this.strategyService.createStrategy(
      req.user?.id,
      body.type as any,
      body.config,
      body.agentId,
    );
  }

  @Get('strategies')
  @ApiOperation({ summary: '获取用户的策略列表' })
  @ApiResponse({ status: 200, description: '返回策略列表' })
  async getUserStrategies(
    @Request() req: any,
    @Query('agentId') agentId?: string,
  ) {
    return this.strategyService.getUserStrategies(req.user?.id, agentId);
  }

  @Get('strategies/:strategyId')
  @ApiOperation({ summary: '获取策略详情' })
  @ApiResponse({ status: 200, description: '返回策略详情' })
  async getStrategy(@Request() req: any, @Param('strategyId') strategyId: string) {
    return this.strategyService.getStrategy(strategyId, req.user?.id);
  }

  @Post('strategies/:strategyId/start')
  @ApiOperation({ summary: '启动策略' })
  @ApiResponse({ status: 200, description: '返回执行结果' })
  async startStrategy(@Request() req: any, @Param('strategyId') strategyId: string) {
    return this.strategyService.startStrategy(strategyId, req.user?.id);
  }

  @Post('strategies/:strategyId/stop')
  @ApiOperation({ summary: '停止策略' })
  @ApiResponse({ status: 200, description: '返回停止结果' })
  async stopStrategy(@Request() req: any, @Param('strategyId') strategyId: string) {
    return this.strategyService.stopStrategy(strategyId, req.user?.id);
  }
}

