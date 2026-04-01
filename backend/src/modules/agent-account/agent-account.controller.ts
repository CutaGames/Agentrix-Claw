import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentAccountService, CreateAgentAccountDto, UpdateAgentAccountDto } from './agent-account.service';
import { AccountChainType } from '../../entities/account.entity';

@ApiTags('Agent Accounts')
@Controller('agent-accounts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgentAccountController {
  constructor(private readonly agentAccountService: AgentAccountService) {}

  @Post()
  @ApiOperation({ summary: '创建 Agent 账户' })
  @ApiResponse({ status: 201, description: 'Agent 账户创建成功' })
  async create(@Request() req, @Body() dto: CreateAgentAccountDto) {
    // 默认使用当前用户作为所有者
    if (!dto.ownerId) {
      dto.ownerId = req.user.id;
    }
    const agent = await this.agentAccountService.create(dto);
    return {
      success: true,
      data: agent,
      message: 'Agent 账户创建成功',
    };
  }

  @Get()
  @ApiOperation({ summary: '获取当前用户的 Agent 账户列表' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: '返回 Agent 账户列表' })
  async findMyAgents(
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const result = await this.agentAccountService.findByOwner(req.user.id, Number(page), Number(limit));
    return {
      success: true,
      data: result.items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.total,
        totalPages: Math.ceil(result.total / Number(limit)),
      },
    };
  }

  @Get('unique/:uniqueId')
  @ApiOperation({ summary: '根据唯一 ID 获取 Agent 账户' })
  @ApiParam({ name: 'uniqueId', description: 'Agent 唯一 ID' })
  @ApiResponse({ status: 200, description: '返回 Agent 账户详情' })
  async findByUniqueId(@Param('uniqueId') uniqueId: string) {
    const agent = await this.agentAccountService.findByUniqueId(uniqueId);
    return {
      success: true,
      data: agent,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '获取 Agent 账户详情' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: '返回 Agent 账户详情' })
  async findOne(@Param('id') id: string) {
    const agent = await this.agentAccountService.findById(id);
    return {
      success: true,
      data: agent,
    };
  }

  @Put(':id')
  @ApiOperation({ summary: '更新 Agent 账户' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: 'Agent 账户更新成功' })
  async update(@Param('id') id: string, @Body() dto: UpdateAgentAccountDto) {
    const agent = await this.agentAccountService.update(id, dto);
    return {
      success: true,
      data: agent,
      message: 'Agent 账户更新成功',
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: '部分更新 Agent 账户' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: 'Agent 账户更新成功' })
  async patchUpdate(@Param('id') id: string, @Body() dto: UpdateAgentAccountDto) {
    const agent = await this.agentAccountService.update(id, dto);
    return {
      success: true,
      data: agent,
      message: 'Agent 账户更新成功',
    };
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '激活 Agent 账户' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: 'Agent 账户激活成功' })
  async activate(@Param('id') id: string) {
    const agent = await this.agentAccountService.activate(id);
    return {
      success: true,
      data: agent,
      message: 'Agent 账户激活成功',
    };
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '暂停 Agent 账户' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: 'Agent 账户已暂停' })
  async suspend(@Param('id') id: string, @Body('reason') reason?: string) {
    const agent = await this.agentAccountService.suspend(id, reason);
    return {
      success: true,
      data: agent,
      message: 'Agent 账户已暂停',
    };
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复 Agent 账户' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: 'Agent 账户已恢复' })
  async resume(@Param('id') id: string) {
    const agent = await this.agentAccountService.resume(id);
    return {
      success: true,
      data: agent,
      message: 'Agent 账户已恢复',
    };
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '撤销 Agent 账户' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: 'Agent 账户已撤销' })
  async revoke(@Param('id') id: string, @Body('reason') reason?: string) {
    const agent = await this.agentAccountService.revoke(id, reason);
    return {
      success: true,
      data: agent,
      message: 'Agent 账户已撤销',
    };
  }

  @Post(':id/credit-score')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新信用评分' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: '信用评分已更新' })
  async updateCreditScore(
    @Param('id') id: string,
    @Body('delta') delta: number,
    @Body('reason') reason?: string,
  ) {
    const agent = await this.agentAccountService.updateCreditScore(id, delta, reason);
    return {
      success: true,
      data: {
        creditScore: agent.creditScore,
        riskLevel: agent.riskLevel,
      },
      message: '信用评分已更新',
    };
  }

  @Get(':id/check-spending')
  @ApiOperation({ summary: '检查支出限额' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiQuery({ name: 'amount', required: true, type: Number })
  @ApiResponse({ status: 200, description: '返回是否允许支出' })
  async checkSpendingLimit(@Param('id') id: string, @Query('amount') amount: number) {
    const result = await this.agentAccountService.checkSpendingLimit(id, Number(amount));
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id/accounts')
  @ApiOperation({ summary: '获取 Agent 的资金账户列表' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: '返回资金账户列表' })
  async getAgentAccounts(@Param('id') id: string) {
    const accounts = await this.agentAccountService.getAgentAccounts(id);
    return {
      success: true,
      data: accounts,
    };
  }

  @Post(':id/link-wallet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '关联外部钱包' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: '钱包关联成功' })
  async linkExternalWallet(
    @Param('id') id: string,
    @Body('walletAddress') walletAddress: string,
    @Body('chainType') chainType: AccountChainType,
  ) {
    const account = await this.agentAccountService.linkExternalWallet(id, walletAddress, chainType);
    return {
      success: true,
      data: account,
      message: '钱包关联成功',
    };
  }

  @Post(':id/api-key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成 Agent API Key' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: '返回 API Key（仅显示一次）' })
  async generateApiKey(@Param('id') id: string) {
    const result = await this.agentAccountService.generateApiKey(id);
    return {
      success: true,
      data: result,
      message: '请立即保存此 API Key，关闭后将无法再次查看。',
    };
  }

  // ========== Phase 4: 链上身份 ==========

  @Post(':id/onchain-register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '链上注册 Agent 身份（可选，Gas 由平台代付）' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: '链上注册成功' })
  async onchainRegister(
    @Param('id') id: string,
    @Body('chain') chain?: string,
  ) {
    const result = await this.agentAccountService.onchainRegister(id, chain || 'bsc-testnet');
    return {
      success: true,
      data: result,
      message: '链上注册已提交，Gas 费由平台承担。',
    };
  }

  @Get(':id/onchain-status')
  @ApiOperation({ summary: '查询链上注册状态' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: '返回链上注册状态' })
  async getOnchainStatus(@Param('id') id: string) {
    const result = await this.agentAccountService.getOnchainStatus(id);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id/balance')
  @ApiOperation({ summary: '查询 Agent 余额（平台+链上统一视图）' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: '返回余额信息' })
  async getBalance(@Param('id') id: string) {
    const result = await this.agentAccountService.getBalance(id);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id/capabilities')
  @ApiOperation({ summary: '查询 Agent 链上能力档案' })
  @ApiParam({ name: 'id', description: 'Agent 账户 ID' })
  @ApiResponse({ status: 200, description: '返回能力档案' })
  async getCapabilities(@Param('id') id: string) {
    const result = await this.agentAccountService.getCapabilities(id);
    return {
      success: true,
      data: result,
    };
  }
}
