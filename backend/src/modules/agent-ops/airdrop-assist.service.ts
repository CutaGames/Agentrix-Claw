import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';

import {
  READ_ONLY_FETCHER,
  ReadOnlyFetcher,
} from './data-source-plugin.types';
import { isEvmAddress, normalizeChain } from './plugins/chain-explorers';
import {
  PolicyEvaluatorService,
  RiskTier,
} from '../agent/policy-evaluator.service';
import { checkRedline, RedlineCheck } from '../agent/redlines';
import { MonitorService } from './monitor.service';
import type { MonitorSubscriptionEntity } from './entities/monitor-subscription.entity';
import type {
  AirdropCandidate,
  AirdropClaimAssistPlan,
  AirdropClaimAssistRequest,
  AirdropClaimReminder,
  AirdropDiscoveryRequest,
  AirdropDiscoveryResult,
  AirdropEligibilityStatus,
} from './airdrop-assist.types';

/** 领取窗口「即将截止」阈值(默认 72 小时);剩余 < 该阈值标 closing_soon。 */
const CLOSING_SOON_MS = 72 * 60 * 60 * 1000;

/**
 * AirdropAssistService — 空投发现与合法协助领取(crypto-native-agent-ops 任务 22,需求 11)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 11.1:基于用户钱包发现潜在空投资格,提供资格检查与领取窗口/截止提醒。
 *   - 需求 11.2:用户合法获得资格并选择领取 → agent 准备/导航/填好领取流程,领取交易由用户签名确认。
 *   - 需求 11.3:完成项目要求的合法任务以参与 → 仅以单一真实身份协助,写操作需人确认。
 *   - 需求 11.4 / 6.2 / Property 3:SHALL NOT 提供多钱包批量刷量 / sybil 薅空投能力(红线,不可绕过)。
 *   - Property 4:领取交易(transaction_sign)在无人工确认时不得执行。
 *   - Property 7/8:资格/窗口数据不可得时显式降级,绝不编造。
 *
 * 复用:
 *   - 资格发现走 Task 12 只读采集路径(`ReadOnlyFetcher`:navigate + browser_eval)。
 *   - 领取窗口提醒走 Task 16 `MonitorService`(`airdrop_window` 类型)。
 *   - 领取风险分级走 Task 9 `PolicyEvaluatorService.classifyActionRisk`(transaction_sign → high → 人确认)。
 *   - sybil 守卫走 `redlines.checkRedline`(与 Rust `redlines.rs` 对齐)。
 *
 * 安全不变量:本服务**只读为主 + 单一真实身份**——产出资格发现、窗口提醒、未签名领取计划;
 * 不持有也不调用任何签名/转账能力,绝不代执行资金;多钱包/sybil 意图一律红线拒绝。
 */
@Injectable()
export class AirdropAssistService {
  private readonly logger = new Logger(AirdropAssistService.name);

  constructor(
    @Inject(READ_ONLY_FETCHER)
    private readonly fetcher: ReadOnlyFetcher,
    private readonly policyEvaluator: PolicyEvaluatorService,
    private readonly monitorService: MonitorService,
  ) {}

  // ───────────────────────── sybil 守卫(需求 11.4 / 6.2 / Property 3) ─────────────────────────

  /**
   * 纯函数:sybil / 多钱包批量刷量守卫(需求 11.4)。
   *
   * 命中即拒(不可被任何 UI/策略绕过,Property 3):
   *   1. 同一请求涉及 ≥2 个不同钱包(多钱包批量薅空投)→ sybil 红线。
   *   2. 意图/备注文本命中 `redlines.ABUSE_REDLINE_PATTERNS`(sybil/女巫/多账号薅 等)。
   *
   * 仅以单一真实身份协助(需求 11.3):合法路径下 wallet 唯一且无 sybil 意图。
   */
  checkSybilGuard(input: {
    wallet?: string;
    wallets?: string[];
    intent?: string;
    notes?: string;
  }): RedlineCheck {
    // 1. 多钱包检测:收集去重后的非空钱包地址。
    const distinct = new Set(
      [input.wallet, ...(input.wallets ?? [])]
        .map((w) => String(w ?? '').trim().toLowerCase())
        .filter((w) => w.length > 0),
    );
    if (distinct.size > 1) {
      return {
        ok: false,
        rule: 'abuse:sybil',
        reason:
          'multi-wallet airdrop farming requested (sybil); refused — single real identity only',
      };
    }

    // 2. 意图/备注文本红线(sybil/女巫/多账号薅 等),复用与 Rust 对齐的红线集。
    const corpus = [input.intent, input.notes].filter(Boolean).join(' \n ');
    return checkRedline({ intent: corpus || undefined });
  }

  /** 命中 sybil 红线即抛出 ForbiddenException(写/发现入口统一守卫)。 */
  private assertNotSybil(input: {
    wallet?: string;
    wallets?: string[];
    intent?: string;
    notes?: string;
  }): void {
    const check = this.checkSybilGuard(input);
    if (!check.ok) {
      this.logger.warn(
        `空投 sybil 红线拒绝: rule=${check.rule} reason=${check.reason}`,
      );
      throw new ForbiddenException({
        code: 'AIRDROP_SYBIL_REDLINE',
        rule: check.rule,
        reason: check.reason,
      });
    }
  }

  // ───────────────────────── 资格发现 + 窗口提醒(需求 11.1) ─────────────────────────

  /**
   * 基于用户钱包只读发现潜在空投资格,并给出领取窗口/截止提醒(需求 11.1)。
   *
   * sybil 守卫前置(需求 11.4)。经 {@link ReadOnlyFetcher} 在资格检查页只读取数;
   * 无可核来源 / 取数失败 / 非法钱包 → 显式 `fetched:false`(不编造资格,Property 7/8)。
   */
  async discoverAirdrops(
    req: AirdropDiscoveryRequest,
  ): Promise<AirdropDiscoveryResult> {
    // 需求 11.4:多钱包/sybil 意图直接红线拒绝(发现侧也不得为批量薅空投服务)。
    this.assertNotSybil(req);

    const discoveredAt = new Date().toISOString();
    const wallet = String(req.wallet ?? '').trim();
    const chain = String(req.chain ?? '').trim();

    // 标的信息不足 → 显式未取数(不编造,Property 7/8)。
    if (!isEvmAddress(wallet)) {
      return this.degraded(wallet, chain, '', discoveredAt, 'INVALID_WALLET_ADDRESS');
    }
    if (!normalizeChain(chain)) {
      return this.degraded(wallet, chain, '', discoveredAt, 'UNSUPPORTED_CHAIN');
    }
    const checkerUrl = String(req.checkerUrl ?? '').trim();
    if (!checkerUrl) {
      // 无可核资格来源 → 显式降级,绝不臆造资格(Property 7/8)。
      return this.degraded(wallet, chain, '', discoveredAt, 'NO_ELIGIBILITY_SOURCE');
    }

    const res = await this.fetcher.fetch({
      userId: req.userId,
      agentId: req.agentId,
      url: checkerUrl,
      extract: req.extract ?? this.buildEligibilityExtractExpression(),
      deviceId: req.deviceId,
      sessionId: req.sessionId,
    });

    if (!res.success) {
      return this.degraded(
        wallet,
        chain,
        checkerUrl,
        discoveredAt,
        res.error ?? res.failureReason ?? 'FETCH_FAILED',
      );
    }

    const candidates = this.parseRawCandidates(res.data, chain, checkerUrl);
    const reminders = this.deriveReminders(candidates, Date.now());

    return {
      wallet,
      chain,
      sourceUrl: checkerUrl,
      fetched: true,
      candidates,
      reminders,
      discoveredAt,
    };
  }

  /**
   * 为某空投登记领取窗口/截止提醒(需求 11.1),复用 Task 16 `MonitorService`。
   *
   * 创建一个 `airdrop_window` 监控订阅(in_window 算子),由 `MonitorScheduler` 周期只读检查;
   * 命中领取窗口即多端推送提醒(需求 9.3)。sybil 守卫前置(需求 11.4)。
   */
  async scheduleClaimWindowReminder(
    ownerId: string,
    req: {
      agentId: string;
      wallet: string;
      wallets?: string[];
      projectName: string;
      claimUrl?: string;
      claimWindowStart?: string;
      claimWindowEnd?: string;
      intervalSeconds?: number;
    },
  ): Promise<MonitorSubscriptionEntity> {
    this.assertNotSybil(req);

    return this.monitorService.createMonitor(ownerId, {
      agentId: req.agentId,
      monitorType: 'airdrop_window',
      condition: {
        operator: 'in_window',
        url: req.claimUrl,
        projectName: req.projectName,
        wallet: req.wallet,
        claimWindowStart: req.claimWindowStart,
        claimWindowEnd: req.claimWindowEnd,
        windowStartField: 'claimWindowStart',
        windowEndField: 'claimWindowEnd',
      },
      interval: req.intervalSeconds,
    });
  }

  // ───────────────────────── 协助领取(需求 11.2 / 11.3 / Property 4) ─────────────────────────

  /**
   * 为合法获得资格的空投准备**未签名**领取计划(需求 11.2)。
   *
   * sybil 守卫前置(需求 11.4):多钱包/批量薅空投 → 红线拒绝;仅以单一真实身份协助(需求 11.3)。
   * agent 备好导航/填表步骤,但领取交易经 Task 9 风险分级为 `transaction_sign` → high → 强制人确认;
   * 本方法**绝不代执行**:`autoExecuted` 恒 false(Property 4)。
   */
  assistClaim(req: AirdropClaimAssistRequest): AirdropClaimAssistPlan {
    // 需求 11.4 / Property 3:多钱包/sybil 意图红线拒绝(不可绕过)。
    this.assertNotSybil(req);

    const wallet = String(req.wallet ?? '').trim();
    const description = req.contract
      ? `领取「${req.projectName}」空投:调用合约 ${req.contract}.${
          req.method ?? 'claim'
        }(链上交易,需你本人签名)`
      : `领取「${req.projectName}」空投:经领取页 ${
          req.claimUrl ?? '(待提供)'
        } 提交领取交易(需你本人签名)`;

    const preparationSteps = [
      `以单一真实身份钱包 ${wallet} 在链 ${req.chain} 上准备领取`,
      req.claimUrl
        ? `导航至领取页:${req.claimUrl}(只读核对资格与领取条件)`
        : '核对链上领取合约与资格条件',
      'agent 预填领取表单/参数(不含签名)',
      '将未签名领取交易交由你本人在钱包中签名确认',
    ];

    // 复用 Task 9 风险分级:领取交易 = transaction_sign → high → 人确认(不可绕过)。
    const { tier } = this.policyEvaluator.classifyActionRisk({
      type: 'transaction_sign',
      intent: description,
    });
    const riskTier: RiskTier = tier;

    return {
      projectName: req.projectName,
      chain: req.chain,
      wallet,
      preparationSteps,
      claimTransaction: {
        to: req.contract,
        claimUrl: req.claimUrl,
        method: req.method,
        args: req.args,
        description,
      },
      riskTier,
      // 需求 11.2 / Property 4:领取交易由用户签名确认,系统不代执行。
      requiresUserConfirmation: true,
      autoExecuted: false,
      decision: 'user_confirmation',
      reason: 'AIRDROP_CLAIM_REQUIRES_USER_SIGNATURE',
    };
  }

  // ───────────────────────── 内部:解析 / 派生 / 降级 ─────────────────────────

  /** 显式降级结果(取数失败/无源/非法标的;不编造资格,Property 7/8)。 */
  private degraded(
    wallet: string,
    chain: string,
    sourceUrl: string,
    discoveredAt: string,
    note: string,
  ): AirdropDiscoveryResult {
    return {
      wallet,
      chain,
      sourceUrl,
      fetched: false,
      candidates: [],
      reminders: [],
      discoveredAt,
      note,
    };
  }

  /** 只读 DOM 提取表达式(真实选择器由桌面端在页面上下文求值;此处声明只读读取意图)。 */
  private buildEligibilityExtractExpression(): string {
    return `(() => {
      // 占位:真实选择器随资格检查页结构而定;此处声明只读读取资格列表的意图。
      // 期望返回形如 [{ projectName, tokenSymbol, eligible, requirements, claimUrl, claimWindowStart, claimWindowEnd }]
      try {
        const w = window;
        if (Array.isArray(w.__AIRDROPS__)) return w.__AIRDROPS__;
        return [];
      } catch (e) { return []; }
    })()`;
  }

  /** 把只读提取到的原始数据归一为 AirdropCandidate[](只搬运,不编造资格/窗口)。 */
  private parseRawCandidates(
    data: any,
    chain: string,
    fallbackSourceUrl: string,
  ): AirdropCandidate[] {
    if (!Array.isArray(data)) return [];
    const out: AirdropCandidate[] = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const projectName = String(item.projectName ?? item.name ?? '').trim();
      if (!projectName) continue;

      const candidate: AirdropCandidate = {
        projectName,
        chain,
        eligibility: this.normalizeEligibility(item.eligible ?? item.eligibility),
        sourceUrl:
          typeof item.sourceUrl === 'string' && item.sourceUrl.trim()
            ? item.sourceUrl.trim()
            : fallbackSourceUrl,
      };
      if (typeof item.tokenSymbol === 'string')
        candidate.tokenSymbol = item.tokenSymbol;
      if (typeof item.eligibilityNote === 'string')
        candidate.eligibilityNote = item.eligibilityNote;
      if (Array.isArray(item.requirements)) {
        candidate.requirements = item.requirements
          .filter((r: any) => typeof r === 'string')
          .map((r: string) => r.trim());
      }
      if (typeof item.claimUrl === 'string') candidate.claimUrl = item.claimUrl;
      if (typeof item.claimWindowStart === 'string')
        candidate.claimWindowStart = item.claimWindowStart;
      if (typeof item.claimWindowEnd === 'string')
        candidate.claimWindowEnd = item.claimWindowEnd;
      out.push(candidate);
    }
    return out;
  }

  /** 归一资格状态:显式 boolean → eligible/not_eligible;字符串显式;否则 unknown(不臆断)。 */
  private normalizeEligibility(v: unknown): AirdropEligibilityStatus {
    if (v === true) return 'eligible';
    if (v === false) return 'not_eligible';
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'eligible' || s === 'true' || s === 'yes') return 'eligible';
      if (s === 'not_eligible' || s === 'false' || s === 'no' || s === 'ineligible')
        return 'not_eligible';
    }
    return 'unknown';
  }

  /** 从候选派生领取窗口/截止提醒(需求 11.1)。 */
  private deriveReminders(
    candidates: AirdropCandidate[],
    now: number,
  ): AirdropClaimReminder[] {
    return candidates.map((c) => {
      const endMs = c.claimWindowEnd ? Date.parse(c.claimWindowEnd) : NaN;
      if (!Number.isFinite(endMs)) {
        return {
          projectName: c.projectName,
          claimWindowEnd: c.claimWindowEnd,
          msUntilDeadline: null,
          status: 'unknown',
        };
      }
      const msUntilDeadline = endMs - now;
      let status: AirdropClaimReminder['status'];
      if (msUntilDeadline < 0) status = 'expired';
      else if (msUntilDeadline <= CLOSING_SOON_MS) status = 'closing_soon';
      else status = 'open';
      return {
        projectName: c.projectName,
        claimWindowEnd: c.claimWindowEnd,
        msUntilDeadline,
        status,
      };
    });
  }
}
