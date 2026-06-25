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
export class AssetOverviewTool implements AgentrixTool<Input> {
  readonly name = 'asset_overview';
  readonly category = ToolCategory.WALLET;
  readonly description = 'Get a portfolio-style overview of all accounts and balances for the current user or active agent.';
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
    const normalizedCurrency = input.currency?.toUpperCase();
    const accounts = await this.accountService.findByOwner(ownerId, ownerType);

    const overviewAccounts = [] as Array<Record<string, any>>;
    const totalsByCurrency: Record<string, number> = {};

    for (const account of accounts) {
      const summary = await this.accountService.getBalance(account.id);
      const balances = await this.accountService.getMultiCurrencyBalances(account.id);
      const filteredBalances = normalizedCurrency
        ? Object.fromEntries(Object.entries(balances).filter(([currency]) => currency.toUpperCase() === normalizedCurrency))
        : balances;

      for (const [currency, amount] of Object.entries(filteredBalances)) {
        totalsByCurrency[currency] = (totalsByCurrency[currency] || 0) + Number(amount);
      }

      overviewAccounts.push({
        id: account.id,
        accountId: account.accountId,
        chainType: account.chainType,
        isDefault: account.isDefault,
        walletAddress: account.walletAddress || account.mpcWalletId || null,
        summary,
        balances: filteredBalances,
      });
    }

    return {
      success: true,
      data: {
        ownerId,
        ownerType,
        totalAccounts: overviewAccounts.length,
        totalsByCurrency,
        accounts: overviewAccounts,
        message: overviewAccounts.length > 0
          ? `Retrieved asset overview across ${overviewAccounts.length} account${overviewAccounts.length === 1 ? '' : 's'}.`
          : 'No wallet accounts found for the current context.',
      },
    };
  }
}