import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AccountOwnerType } from '../../../../entities/account.entity';
import { AccountService } from '../../../account/account.service';
import { AgentrixTool, ToolCategory, ToolContext, ToolResult } from '../../interfaces';
import { RegisterTool } from '../../decorators/register-tool.decorator';

const inputSchema = z.object({
  chain: z.string().optional().describe('Optional chain filter'),
  currency: z.string().optional().describe('Optional currency filter'),
});

type Input = z.infer<typeof inputSchema>;

@RegisterTool()
@Injectable()
export class GetBalanceTool implements AgentrixTool<Input> {
  readonly name = 'get_balance';
  readonly category = ToolCategory.WALLET;
  readonly description = 'Get available wallet balance and funds for the current user or active agent.';
  readonly inputSchema = inputSchema;
  readonly isReadOnly = true;
  readonly isConcurrencySafe = true;
  readonly requiresPayment = false;
  readonly riskLevel = 0 as const;
  readonly maxResultChars = 4000;

  constructor(private readonly accountService: AccountService) {}

  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    const ownerType = ctx.agentId ? AccountOwnerType.AGENT : AccountOwnerType.USER;
    const ownerId = ctx.agentId || ctx.userId;
    const accounts = await this.accountService.findByOwner(ownerId, ownerType);
    const defaultAccount = (await this.accountService.getDefaultAccount(ownerId, ownerType)) || accounts[0] || null;

    if (!defaultAccount) {
      return {
        success: true,
        data: {
          ownerId,
          ownerType,
          balances: {},
          message: 'No wallet account found for the current context.',
        },
      };
    }

    const summary = await this.accountService.getBalance(defaultAccount.id);
    const balances = await this.accountService.getMultiCurrencyBalances(defaultAccount.id);
    const normalizedCurrency = input.currency?.toUpperCase();
    const filteredBalances = normalizedCurrency
      ? Object.fromEntries(Object.entries(balances).filter(([currency]) => currency.toUpperCase() === normalizedCurrency))
      : balances;

    return {
      success: true,
      data: {
        ownerId,
        ownerType,
        accountId: defaultAccount.id,
        chainType: defaultAccount.chainType,
        balances: filteredBalances,
        summary,
        walletAddress: defaultAccount.walletAddress || defaultAccount.mpcWalletId || null,
        message: `Retrieved balance for ${ownerType} account ${defaultAccount.accountId}.`,
      },
    };
  }
}