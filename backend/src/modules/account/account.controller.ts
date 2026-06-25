import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountService, CreateAccountDto, FundOperationDto, TransferDto } from './account.service';
import { AccountOwnerType, AccountChainType, AccountWalletType } from '../../entities/account.entity';

@ApiTags('Accounts')
@Controller('accounts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  @ApiOperation({ summary: '创建资金账户' })
  @ApiResponse({ status: 201, description: '账户创建成功' })
  async create(@Request() req, @Body() dto: CreateAccountDto) {
    // 默认使用当前用户作为所有者
    if (!dto.ownerId) {
      dto.ownerId = req.user.id;
    }
    if (!dto.ownerType) {
      dto.ownerType = AccountOwnerType.USER;
    }
    const account = await this.accountService.create(dto);
    return {
      success: true,
      data: account,
      message: '账户创建成功',
    };
  }

  @Get('my')
  @ApiOperation({ summary: '获取当前用户的资金账户列表' })
  @ApiResponse({ status: 200, description: '返回账户列表' })
  async getMyAccounts(@Request() req) {
    const accounts = await this.accountService.findByOwner(req.user.id, AccountOwnerType.USER);
    return {
      success: true,
      data: accounts,
    };
  }

  @Get('summary')
  @ApiOperation({ summary: '获取账户汇总信息' })
  @ApiResponse({ status: 200, description: '返回账户汇总' })
  async getSummary(@Request() req) {
    const accounts = await this.accountService.findByOwner(req.user.id, AccountOwnerType.USER);
    
    // 计算汇总数据
    let totalBalance = 0;
    let totalFrozen = 0;
    const byChain: Record<string, { balance: number; chain: string }> = {};
    
    for (const account of accounts) {
      const available = parseFloat(account.availableBalance?.toString() || '0');
      const frozen = parseFloat(account.frozenBalance?.toString() || '0');
      totalBalance += available + frozen;
      totalFrozen += frozen;
      
      const chain = account.chainType || 'evm';
      if (!byChain[chain]) {
        byChain[chain] = { balance: 0, chain };
      }
      byChain[chain].balance += available + frozen;
    }
    
    return {
      success: true,
      data: {
        totalBalance,
        totalFrozen,
        totalPending: 0,
        accountCount: accounts.length,
        byChain,
      },
    };
  }

  @Get('pending-earnings')
  @ApiOperation({ summary: '获取待结算收益' })
  @ApiResponse({ status: 200, description: '返回待结算收益' })
  async getPendingEarnings(@Request() req) {
    // 返回默认值，后续可以从实际数据中计算
    return {
      success: true,
      data: {
        totalAmount: 0,
        currency: 'USDC',
        nextSettlementDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        settlementCycle: 'weekly',
        breakdown: [],
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '获取账户详情' })
  @ApiParam({ name: 'id', description: '账户 ID' })
  @ApiResponse({ status: 200, description: '返回账户详情' })
  async findOne(@Param('id') id: string) {
    const account = await this.accountService.findById(id);
    return {
      success: true,
      data: account,
    };
  }

  @Get(':id/balance')
  @ApiOperation({ summary: '查询账户余额' })
  @ApiParam({ name: 'id', description: '账户 ID' })
  @ApiResponse({ status: 200, description: '返回账户余额' })
  async getBalance(@Param('id') id: string) {
    const balance = await this.accountService.getBalance(id);
    return {
      success: true,
      data: balance,
    };
  }

  @Get(':id/balances')
  @ApiOperation({ summary: '查询多币种余额' })
  @ApiParam({ name: 'id', description: '账户 ID' })
  @ApiResponse({ status: 200, description: '返回多币种余额' })
  async getMultiCurrencyBalances(@Param('id') id: string) {
    const balances = await this.accountService.getMultiCurrencyBalances(id);
    return {
      success: true,
      data: balances,
    };
  }

  @Get(':id/transactions')
  @ApiOperation({ summary: '获取账户交易历史' })
  @ApiParam({ name: 'id', description: '账户 ID' })
  @ApiResponse({ status: 200, description: '返回交易历史' })
  async getTransactions(
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('type') type?: string,
  ) {
    const result = await this.accountService.getTransactions(id, {
      limit: limit ? Number(limit) : 20,
      offset: offset ? Number(offset) : 0,
      type,
    });
    return {
      success: true,
      data: result,
    };
  }

  @Post(':id/deposit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '充值' })
  @ApiParam({ name: 'id', description: '账户 ID' })
  @ApiResponse({ status: 200, description: '充值成功' })
  async deposit(@Param('id') id: string, @Body() dto: FundOperationDto) {
    const account = await this.accountService.deposit(id, dto);
    return {
      success: true,
      data: {
        accountId: account.id,
        availableBalance: account.availableBalance,
        currency: account.currency,
      },
      message: '充值成功',
    };
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提现' })
  @ApiParam({ name: 'id', description: '账户 ID' })
  @ApiResponse({ status: 200, description: '提现成功' })
  async withdraw(@Param('id') id: string, @Body() dto: FundOperationDto) {
    const account = await this.accountService.withdraw(id, dto);
    return {
      success: true,
      data: {
        accountId: account.id,
        availableBalance: account.availableBalance,
        currency: account.currency,
      },
      message: '提现成功',
    };
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '转账' })
  @ApiResponse({ status: 200, description: '转账成功' })
  async transfer(@Body() dto: TransferDto) {
    const result = await this.accountService.transfer(dto);
    return {
      success: true,
      data: {
        from: {
          accountId: result.from.id,
          availableBalance: result.from.availableBalance,
        },
        to: {
          accountId: result.to.id,
          availableBalance: result.to.availableBalance,
        },
      },
      message: '转账成功',
    };
  }

  @Post(':id/freeze-balance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '冻结部分余额' })
  @ApiParam({ name: 'id', description: '账户 ID' })
  @ApiResponse({ status: 200, description: '余额冻结成功' })
  async freezeBalance(
    @Param('id') id: string,
    @Body('amount') amount: number,
    @Body('reason') reason?: string,
  ) {
    const account = await this.accountService.freezeBalance(id, amount, reason);
    return {
      success: true,
      data: {
        accountId: account.id,
        availableBalance: account.availableBalance,
        frozenBalance: account.frozenBalance,
      },
      message: '余额冻结成功',
    };
  }

  @Post(':id/unfreeze-balance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '解冻部分余额' })
  @ApiParam({ name: 'id', description: '账户 ID' })
  @ApiResponse({ status: 200, description: '余额解冻成功' })
  async unfreezeBalance(
    @Param('id') id: string,
    @Body('amount') amount: number,
    @Body('reason') reason?: string,
  ) {
    const account = await this.accountService.unfreezeBalance(id, amount, reason);
    return {
      success: true,
      data: {
        accountId: account.id,
        availableBalance: account.availableBalance,
        frozenBalance: account.frozenBalance,
      },
      message: '余额解冻成功',
    };
  }

  @Post(':id/freeze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '冻结账户' })
  @ApiParam({ name: 'id', description: '账户 ID' })
  @ApiResponse({ status: 200, description: '账户已冻结' })
  async freezeAccount(@Param('id') id: string, @Body('reason') reason?: string) {
    const account = await this.accountService.freezeAccount(id, reason);
    return {
      success: true,
      data: account,
      message: '账户已冻结',
    };
  }

  @Post(':id/unfreeze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '解冻账户' })
  @ApiParam({ name: 'id', description: '账户 ID' })
  @ApiResponse({ status: 200, description: '账户已解冻' })
  async unfreezeAccount(@Param('id') id: string) {
    const account = await this.accountService.unfreezeAccount(id);
    return {
      success: true,
      data: account,
      message: '账户已解冻',
    };
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '关闭账户' })
  @ApiParam({ name: 'id', description: '账户 ID' })
  @ApiResponse({ status: 200, description: '账户已关闭' })
  async closeAccount(@Param('id') id: string, @Body('reason') reason?: string) {
    const account = await this.accountService.closeAccount(id, reason);
    return {
      success: true,
      data: account,
      message: '账户已关闭',
    };
  }

  @Put(':id/set-default')
  @ApiOperation({ summary: '设置为默认账户' })
  @ApiParam({ name: 'id', description: '账户 ID' })
  @ApiResponse({ status: 200, description: '已设置为默认账户' })
  async setDefault(@Request() req, @Param('id') id: string) {
    const account = await this.accountService.setDefaultAccount(id, req.user.id, AccountOwnerType.USER);
    return {
      success: true,
      data: account,
      message: '已设置为默认账户',
    };
  }

  @Get(':id/stats')
  @ApiOperation({ summary: '获取账户统计' })
  @ApiParam({ name: 'id', description: '账户 ID' })
  @ApiResponse({ status: 200, description: '返回账户统计' })
  async getStats(@Param('id') id: string) {
    const stats = await this.accountService.getAccountStats(id);
    return {
      success: true,
      data: stats,
    };
  }

  @Post('create-default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '为当前用户创建默认账户' })
  @ApiResponse({ status: 200, description: '默认账户创建成功' })
  async createDefaultAccount(@Request() req) {
    const account = await this.accountService.createUserDefaultAccount(
      req.user.id,
      req.user.name || req.user.email,
    );
    return {
      success: true,
      data: account,
      message: '默认账户创建成功',
    };
  }
}
