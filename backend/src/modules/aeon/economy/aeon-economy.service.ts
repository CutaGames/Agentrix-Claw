import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AeonLedgerEntry } from '../entities/aeon-ledger-entry.entity';
import { AeonOrg } from '../entities/aeon-org.entity';
import {
  ComplianceGateService,
  type ComplianceContext,
  type AeonCurrency,
  type AeonMoneyCapability,
} from './compliance-gate.service';
import { AeonHighRiskGateService } from './aeon-high-risk-gate.service';

/**
 * AeonEconomyService — 世界经济结算门面(Task 3.1 / 3.2 / R11)。
 *
 * 世界内一切价值流转的唯一入口:工资/任务/悬赏/市场/门票。支持 AXP 或数字货币
 * (经 Compliance_Gate)。账本守恒(Property 1):org 权威余额 = aeon_ledger_entries
 * 代数和;禁负余额(Property 2 / R11.5);append-only 可审计(R19.4)。
 *
 * 高风险闸门(R11.3/11.4)由调用方(agent/copilot 态)在调用本服务前经 Trust3
 * sign-request 完成;本服务的 `transfer` 假定授权已通过(普通赚取免审批,R11.6)。
 *
 * 与现有 AXP 钱包的桥接:org→user 的 AXP 出账影响用户钱包余额,该桥接在 wiring 时
 * 通过 AxpService 接入(AXP_EARN_SOURCES 需登记 'aeon_wage' 等来源)。Phase 3 先保证
 * Aeon 账本自洽与守恒,钱包桥接为明确的后续接线点。
 */
@Injectable()
export class AeonEconomyService {
  private readonly logger = new Logger(AeonEconomyService.name);

  /**
   * 世界托管(escrow)系统账户的固定 UUID(payer/payee 列为 uuid 类型,不能用任意字符串)。
   * 用一个保留的全 0 段 UUID 作为"系统托管账户"主体;悬赏发布时资金从发起方转入此账户,
   * 验收/取消时再从此账户转出。该账户不对应真实用户,仅作账本记账主体(R9 escrow)。
   */
  static readonly ESCROW_ACCOUNT = '00000000-0000-4000-8000-0000000e5c70';

  constructor(
    @InjectRepository(AeonLedgerEntry)
    private readonly ledgerRepo: Repository<AeonLedgerEntry>,
    @InjectRepository(AeonOrg)
    private readonly orgRepo: Repository<AeonOrg>,
    private readonly compliance: ComplianceGateService,
    private readonly highRisk: AeonHighRiskGateService,
    private readonly dataSource: DataSource,
  ) {}

  /** org 权威余额 = 分录代数和(payee 加 / payer 减),按币种。 */
  async orgBalance(orgId: string, currency: AeonCurrency = 'AXP'): Promise<number> {
    const inflow = await this.ledgerRepo
      .createQueryBuilder('l')
      .select('COALESCE(SUM(CAST(l.amount AS BIGINT)),0)', 'sum')
      .where('l.org_id = :orgId', { orgId })
      .andWhere('l.payee_user_id = :sys', { sys: this.orgWallet(orgId) })
      .andWhere('l.currency = :cur', { cur: currency })
      .getRawOne();
    const outflow = await this.ledgerRepo
      .createQueryBuilder('l')
      .select('COALESCE(SUM(CAST(l.amount AS BIGINT)),0)', 'sum')
      .where('l.org_id = :orgId', { orgId })
      .andWhere('l.payer_user_id = :sys', { sys: this.orgWallet(orgId) })
      .andWhere('l.currency = :cur', { cur: currency })
      .getRawOne();
    return Number(inflow?.sum ?? 0) - Number(outflow?.sum ?? 0);
  }

  /**
   * 记一笔价值流转(R11.1/11.2)。币种经 Compliance_Gate 校验(可能回退 AXP)。
   * 若 orgId 提供且为出账方,事务内校验 org 余额非负(禁负余额,Property 2)。
   *
   * @returns 实际记账币种(可能从数字货币回退 AXP)+ 分录 id
   */
  async transfer(input: {
    orgId?: string | null;
    payerUserId: string;
    payeeUserId: string;
    amount: number;
    currency: AeonCurrency;
    capability: AeonMoneyCapability;
    reason: string;
    refId?: string | null;
    compliance: ComplianceContext;
    /** 出账方是否为 org 账户(校验 org 余额);wage/bounty 通常 true。 */
    debitFromOrg?: boolean;
    /**
     * 发起方控制态(B7 高风险闸门)。agent/copilot 态 + 大额/真钱 → 先过 Trust3 签名,
     * 未签/超时则抛错且不记账(R11.3/11.4)。manual / 不传 → 视为真人在控,免闸门。
     */
    controlState?: 'manual' | 'agent' | 'copilot';
  }): Promise<{ ledgerId: string; currency: AeonCurrency; fellBackToAxp: boolean }> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('amount 必须为正');
    }

    const auth = this.compliance.authorize(input.compliance, {
      currency: input.currency,
      capability: input.capability,
    });
    const currency = auth.currency;

    // B7 高风险闸门:agent/copilot 态的大额/真钱花费,先过 Trust3(未签/超时 → 抛错,不记账)。
    if (input.controlState && input.controlState !== 'manual') {
      await this.highRisk.authorize({
        userId: input.payerUserId,
        controlState: input.controlState,
        amount: input.amount,
        currency,
        description: `${input.reason} ${input.amount} ${currency}`,
        idempotencyKey: input.refId ? `aeon-spend-${input.refId}` : undefined,
      });
    }

    return this.dataSource.transaction(async (manager) => {
      // 禁负余额:org 出账时校验余额充足(R6.6 / R11.5 / Property 2)。
      if (input.debitFromOrg && input.orgId) {
        const bal = await this.orgBalanceInTx(manager, input.orgId, currency);
        if (bal < input.amount) {
          throw new BadRequestException('组织账本余额不足');
        }
      }
      const entry = manager.create(AeonLedgerEntry, {
        orgId: input.orgId ?? null,
        payerUserId: input.payerUserId,
        payeeUserId: input.payeeUserId,
        amount: String(input.amount),
        currency,
        reason: input.reason,
        refId: input.refId ?? null,
      });
      const saved = await manager.save(entry);

      // 维护 org 缓存余额(权威仍以分录求和)。
      if (input.orgId) {
        await this.refreshOrgCache(manager, input.orgId);
      }
      return { ledgerId: saved.id, currency, fellBackToAxp: auth.fellBackToAxp };
    });
  }

  /** 给 org 账户充值(owner 注资),payee = org 钱包。 */
  async fundOrg(orgId: string, fromUserId: string, amount: number, currency: AeonCurrency = 'AXP'): Promise<string> {
    const entry = this.ledgerRepo.create({
      orgId,
      payerUserId: fromUserId,
      payeeUserId: this.orgWallet(orgId),
      amount: String(amount),
      currency,
      reason: 'fund',
    });
    const saved = await this.ledgerRepo.save(entry);
    await this.dataSource.transaction((m) => this.refreshOrgCache(m, orgId));
    return saved.id;
  }

  /** org 内置"钱包用户" id:用 org id 作为其账户主体,简化分录建模。 */
  orgWallet(orgId: string): string {
    return orgId;
  }

  // ── 内部 ──────────────────────────────────────────────────────
  private async orgBalanceInTx(manager: any, orgId: string, currency: AeonCurrency): Promise<number> {
    const repo = manager.getRepository(AeonLedgerEntry);
    const sys = this.orgWallet(orgId);
    const inflow = await repo
      .createQueryBuilder('l')
      .select('COALESCE(SUM(CAST(l.amount AS BIGINT)),0)', 'sum')
      .where('l.org_id = :orgId', { orgId })
      .andWhere('l.payee_user_id = :sys', { sys })
      .andWhere('l.currency = :cur', { cur: currency })
      .getRawOne();
    const outflow = await repo
      .createQueryBuilder('l')
      .select('COALESCE(SUM(CAST(l.amount AS BIGINT)),0)', 'sum')
      .where('l.org_id = :orgId', { orgId })
      .andWhere('l.payer_user_id = :sys', { sys })
      .andWhere('l.currency = :cur', { cur: currency })
      .getRawOne();
    return Number(inflow?.sum ?? 0) - Number(outflow?.sum ?? 0);
  }

  private async refreshOrgCache(manager: any, orgId: string): Promise<void> {
    const bal = await this.orgBalanceInTx(manager, orgId, 'AXP');
    await manager.getRepository(AeonOrg).update(orgId, { axpLedgerBalance: String(bal) });
  }
}
