import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  READ_ONLY_FETCHER,
  ReadOnlyFetcher,
} from './data-source-plugin.types';
import { explorerHost, isEvmAddress } from './plugins/chain-explorers';
import {
  PolicyEvaluatorService,
  RiskTier,
} from '../agent/policy-evaluator.service';
import {
  AnnotatedApproval,
  ApprovalRiskTier,
  ApprovalScanRequest,
  ApprovalScanResult,
  RevokeGuidance,
  RevokeTransactionPlan,
  SCAM_INTEL_PROVIDER,
  ScamCheckRequest,
  ScamCheckResult,
  ScamIntelProvider,
  ScamRisk,
  TokenApproval,
  TRANSACTION_SIMULATOR,
  TransactionSimulationRequest,
  TransactionSimulationResult,
  TransactionSimulator,
} from './security-guard.types';

/**
 * 「无限授权」判定阈值。逼近 uint256 上限(2^256-1)的额度视为无限授权
 * (多数 dApp 用 uint256 max 或 2^96-1 等大数作无限额度)。取 2^200 作保守门槛。
 */
const UNLIMITED_ALLOWANCE_THRESHOLD = 2n ** 200n;

/** 常见被仿冒的 web3 品牌官方域名(用于域名钓鱼启发式)。 */
const KNOWN_BRAND_DOMAINS: Record<string, string[]> = {
  metamask: ['metamask.io'],
  uniswap: ['uniswap.org', 'app.uniswap.org'],
  opensea: ['opensea.io'],
  pancakeswap: ['pancakeswap.finance'],
  aave: ['aave.com', 'app.aave.com'],
  lido: ['lido.fi'],
  curve: ['curve.fi'],
  ledger: ['ledger.com'],
  phantom: ['phantom.app'],
  arbitrum: ['arbitrum.io', 'arbitrum.foundation'],
  optimism: ['optimism.io'],
};

/** 高危/常被滥用于钓鱼的 TLD(启发式信号,非绝对)。 */
const SUSPICIOUS_TLDS: ReadonlySet<string> = new Set([
  'zip',
  'mov',
  'top',
  'xyz',
  'gq',
  'tk',
  'ml',
  'cf',
  'ga',
]);

/**
 * SecurityGuard — 散户安全防护(crypto-native-agent-ops 任务 17,需求 10)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C5「SecurityGuard」。
 *   - 需求 10.1:授权扫描 + 标注高风险 + 引导撤销(撤销交易需人工签名确认)。
 *   - 需求 10.2:交易模拟/解读(资产变动、目标合约风险)供签名前决策。
 *   - 需求 10.3:地址/合约/域名骗局与风险检查并给出明确提示。
 *   - 需求 10.4:只读为主,**不代用户执行资金操作**。
 *   - Property 4:撤销(transaction_sign)在无人工确认时不得执行。
 *   - Property 8:模拟/情报不可用时显式降级,绝不伪造。
 *
 * 复用:
 *   - 授权扫描走 Task 12 只读采集路径(`ReadOnlyFetcher`:navigate + browser_eval)。
 *   - 撤销风险分级走 Task 9 `PolicyEvaluatorService.classifyActionRisk`(→ high → 人确认)。
 *   - 交易模拟器 / 骗局情报源为可注入适配器(占位实现 explicit degraded)。
 *
 * 安全不变量:本服务**只读为主**——产出未签名撤销计划、只读模拟、只读骗局检查;
 * 不持有也不调用任何签名/转账能力,绝不代执行资金操作。
 */
@Injectable()
export class SecurityGuard {
  private readonly logger = new Logger(SecurityGuard.name);

  constructor(
    @Inject(READ_ONLY_FETCHER)
    private readonly fetcher: ReadOnlyFetcher,
    private readonly policyEvaluator: PolicyEvaluatorService,
    @Inject(TRANSACTION_SIMULATOR)
    private readonly simulator: TransactionSimulator,
    @Inject(SCAM_INTEL_PROVIDER)
    private readonly scamIntel: ScamIntelProvider,
  ) {}

  // ───────────────────────── 授权扫描 + 标注(需求 10.1) ─────────────────────────

  /**
   * 只读扫描钱包的代币/合约授权并逐条标注风险(需求 10.1)。
   *
   * 经 {@link ReadOnlyFetcher} 在区块浏览器授权检查页(token approval checker)只读取数;
   * 取数失败 → 显式返回 `fetched:false`(approvals 空,不编造,Property 7/8)。
   */
  async scanApprovals(req: ApprovalScanRequest): Promise<ApprovalScanResult> {
    const scannedAt = new Date().toISOString();
    const wallet = String(req.wallet ?? '').trim();
    const chain = String(req.chain ?? '').trim();
    const host = explorerHost(chain);

    // 标的信息不足以构造可核来源 → 显式未取数(不编造)。
    if (!isEvmAddress(wallet) || !host) {
      return {
        wallet,
        chain,
        sourceUrl: '',
        fetched: false,
        approvals: [],
        highRiskCount: 0,
        scannedAt,
        note: !isEvmAddress(wallet)
          ? 'INVALID_WALLET_ADDRESS'
          : 'UNSUPPORTED_CHAIN_NO_EXPLORER',
      };
    }

    const sourceUrl = `https://${host}/tokenapprovalchecker?search=${wallet}`;

    const res = await this.fetcher.fetch({
      userId: req.userId,
      agentId: req.agentId,
      url: sourceUrl,
      extract: this.buildApprovalExtractExpression(),
      deviceId: req.deviceId,
      sessionId: req.sessionId,
    });

    if (!res.success) {
      // 只读取数失败 → 显式降级,不编造授权列表。
      return {
        wallet,
        chain,
        sourceUrl,
        fetched: false,
        approvals: [],
        highRiskCount: 0,
        scannedAt,
        note: res.error ?? res.failureReason ?? 'FETCH_FAILED',
      };
    }

    const raw = this.parseRawApprovals(res.data, chain);
    const annotated = raw
      .map((a) => this.annotateApproval(a))
      .sort((x, y) => this.tierRank(y.riskTier) - this.tierRank(x.riskTier));

    return {
      wallet,
      chain,
      sourceUrl,
      fetched: true,
      approvals: annotated,
      highRiskCount: annotated.filter((a) => a.riskTier === 'high').length,
      scannedAt,
    };
  }

  /**
   * 纯函数:标注单条授权的风险档与信号(需求 10.1)。
   *
   * 风险规则(取最高命中):
   *   - high:无限授权 / spender 被标记为骗局。
   *   - medium:spender 合约未验证 / 有限但较大的额度。
   *   - low:其余(有限额度 + spender 已验证 / 信息不足无高危信号)。
   */
  annotateApproval(approval: TokenApproval): AnnotatedApproval {
    const signals: string[] = [];
    let tier: ApprovalRiskTier = 'low';

    const unlimited = this.isUnlimitedAllowance(approval);
    if (unlimited) {
      signals.push('无限授权(allowance 逼近 uint256 上限):spender 可无限制转走该代币');
      tier = 'high';
    }

    if (approval.spenderFlagged) {
      signals.push('被授权地址(spender)被骗局情报/名单标记为高危');
      tier = 'high';
    }

    if (approval.spenderVerified === false) {
      signals.push('被授权合约在区块浏览器未验证源码,行为不可审计');
      tier = this.maxTier(tier, 'medium');
    }

    const target = `${approval.tokenSymbol ?? approval.token} → ${
      approval.spenderLabel ?? approval.spender
    }`;
    const recommendation =
      tier === 'high'
        ? `高风险授权(${target}):建议立即撤销。撤销交易需你本人签名确认,系统不会代为执行。`
        : tier === 'medium'
          ? `中风险授权(${target}):建议核实后按需撤销。撤销需你本人签名确认。`
          : `低风险授权(${target}):暂无高危信号,可保留并定期复查。`;

    return { ...approval, riskTier: tier, riskSignals: signals, recommendation };
  }

  // ───────────────────────── 引导撤销(需求 10.1 / Property 4) ─────────────────────────

  /**
   * 为一条授权生成**未签名**的撤销交易计划与人确认决策(需求 10.1 / Property 4)。
   *
   * 撤销 = ERC-20 `approve(spender, 0)`。该动作经 Task 9 风险分级为 `transaction_sign`
   * → high → 强制人工确认。本方法**绝不代执行**:`autoExecuted` 恒 false。
   */
  buildRevokeGuidance(approval: TokenApproval): RevokeGuidance {
    const plan: RevokeTransactionPlan = {
      chain: approval.chain,
      to: approval.token,
      method: 'approve',
      args: { spender: approval.spender, amount: '0' },
      description: `撤销对 ${approval.spenderLabel ?? approval.spender} 的 ${
        approval.tokenSymbol ?? approval.token
      } 授权(approve(spender, 0))`,
    };

    // 复用 Task 9 风险分级:交易签名 → high → 人确认(不可被绕过)。
    const { tier } = this.policyEvaluator.classifyActionRisk({
      type: 'transaction_sign',
      intent: plan.description,
    });

    const riskTier: RiskTier = tier;

    return {
      plan,
      riskTier,
      // Property 4:资金写操作(签名)必经人确认,系统不代执行。
      requiresUserConfirmation: true,
      autoExecuted: false,
      decision: 'user_confirmation',
      reason: 'REVOKE_REQUIRES_USER_SIGNATURE',
    };
  }

  // ───────────────────────── 交易模拟/解读(需求 10.2 / Property 8) ─────────────────────────

  /**
   * 签名前的只读交易模拟/解读(需求 10.2)。
   *
   * 委托可注入的 {@link TransactionSimulator}(待选 Tenderly/anvil fork;默认占位)。
   * 占位实现返回 `available:false`(explicit degraded,Property 8),绝不伪造资产变动。
   */
  async simulateTransaction(
    req: TransactionSimulationRequest,
  ): Promise<TransactionSimulationResult> {
    try {
      return await this.simulator.simulate(req);
    } catch (err: any) {
      // 模拟器意外抛错 → 显式降级,不伪造结果。
      this.logger.warn(
        `交易模拟失败 provider=${this.simulator.name}: ${err?.message ?? err}`,
      );
      return {
        available: false,
        provider: this.simulator.name,
        summary: '交易模拟失败,无法提供资产变动解读。请在签名前自行核对交易详情。',
        note: `SIMULATION_ERROR: ${err?.message ?? err}`,
      };
    }
  }

  // ───────────────────────── 骗局/风险检查(需求 10.3 / Property 8) ─────────────────────────

  /**
   * 对地址/合约/域名做骗局与风险检查并给出明确提示(需求 10.3)。
   *
   * 合并「可注入骗局情报源」(占位返回未知)+ 本地确定性启发式规则:
   *   - 情报源明确标记 → danger;
   *   - 域名钓鱼启发式(品牌仿冒/可疑 TLD/punycode)→ danger/caution;
   *   - 地址/合约格式与零地址校验。
   * 情报与本地规则均无信号且情报未知 → unknown(显式,不谎报 safe)。
   */
  async checkScam(req: ScamCheckRequest): Promise<ScamCheckResult> {
    const checkedAt = new Date().toISOString();
    const value = String(req.value ?? '').trim();
    const signals: string[] = [];
    const sources: string[] = [];

    // 本地启发式(确定性,不依赖网络)。
    const local =
      req.kind === 'domain'
        ? this.domainHeuristics(value)
        : this.addressHeuristics(value);
    signals.push(...local.signals);
    if (local.signals.length) sources.push('local_heuristics');

    // 可注入情报源(占位返回 flagged:null = 未知)。
    let intelFlagged: boolean | null = null;
    try {
      const intel = await this.scamIntel.lookup({ ...req, value });
      intelFlagged = intel.flagged;
      signals.push(...intel.signals);
      sources.push(...intel.sources);
    } catch (err: any) {
      this.logger.warn(
        `骗局情报查询失败 provider=${this.scamIntel.name}: ${err?.message ?? err}`,
      );
    }

    const risk = this.combineScamRisk(intelFlagged, local.localRisk);
    return {
      kind: req.kind,
      value,
      risk,
      signals,
      advice: this.scamAdvice(risk, req.kind),
      sources: Array.from(new Set(sources)),
      checkedAt,
    };
  }

  // ───────────────────────── 内部:解析 / 启发式 ─────────────────────────

  /** 只读 DOM 提取表达式:从授权检查页读取授权数组(真实选择器由桌面端在页面上下文求值)。 */
  private buildApprovalExtractExpression(): string {
    return `(() => {
      // 占位:真实选择器随页面结构而定;此处声明只读读取授权列表的意图。
      // 期望返回形如 [{ token, tokenSymbol, spender, spenderLabel, allowance, isUnlimited, spenderVerified, spenderFlagged }]
      try {
        const w = window;
        if (Array.isArray(w.__APPROVALS__)) return w.__APPROVALS__;
        return [];
      } catch (e) { return []; }
    })()`;
  }

  /** 把只读提取到的原始数据归一为 TokenApproval[](只搬运,不编造)。 */
  private parseRawApprovals(data: any, chain: string): TokenApproval[] {
    if (!Array.isArray(data)) return [];
    const out: TokenApproval[] = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const token = String(item.token ?? '').trim();
      const spender = String(item.spender ?? '').trim();
      if (!isEvmAddress(token) || !isEvmAddress(spender)) continue;
      const approval: TokenApproval = {
        chain,
        token,
        spender,
      };
      if (typeof item.tokenSymbol === 'string') approval.tokenSymbol = item.tokenSymbol;
      if (typeof item.spenderLabel === 'string') approval.spenderLabel = item.spenderLabel;
      if (item.allowance != null) approval.allowance = String(item.allowance);
      if (typeof item.isUnlimited === 'boolean') approval.isUnlimited = item.isUnlimited;
      if (typeof item.spenderVerified === 'boolean')
        approval.spenderVerified = item.spenderVerified;
      if (typeof item.spenderFlagged === 'boolean')
        approval.spenderFlagged = item.spenderFlagged;
      out.push(approval);
    }
    return out;
  }

  /** 判定是否无限授权:显式 isUnlimited 或额度逼近 uint256 上限。 */
  private isUnlimitedAllowance(approval: TokenApproval): boolean {
    if (approval.isUnlimited === true) return true;
    const raw = approval.allowance;
    if (raw == null) return false;
    if (typeof raw === 'string' && raw.trim().toLowerCase() === 'unlimited') {
      return true;
    }
    try {
      // 仅当是纯十进制整数字符串时按 BigInt 比较。
      const s = String(raw).trim();
      if (!/^\d+$/.test(s)) return false;
      return BigInt(s) >= UNLIMITED_ALLOWANCE_THRESHOLD;
    } catch {
      return false;
    }
  }

  /** 域名钓鱼启发式(确定性)。 */
  private domainHeuristics(value: string): {
    signals: string[];
    localRisk: ScamRisk;
  } {
    const signals: string[] = [];
    let localRisk: ScamRisk = 'safe';
    const domain = value.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!domain) {
      return { signals: ['空域名,无法检查'], localRisk: 'unknown' };
    }

    // 1. punycode(同形异义字钓鱼)。
    if (domain.includes('xn--')) {
      signals.push('域名含 punycode(xn--),可能为同形异义字钓鱼');
      localRisk = 'danger';
    }

    // 2. 品牌仿冒:含知名品牌词但非其官方域名。
    const labels = domain.split('.');
    for (const [brand, official] of Object.entries(KNOWN_BRAND_DOMAINS)) {
      if (domain.includes(brand) && !official.includes(domain)) {
        signals.push(
          `域名疑似仿冒品牌「${brand}」(官方:${official.join(' / ')}),警惕钓鱼`,
        );
        localRisk = 'danger';
      }
    }

    // 3. 可疑 TLD。
    const tld = labels[labels.length - 1];
    if (tld && SUSPICIOUS_TLDS.has(tld)) {
      signals.push(`使用高风险顶级域名 .${tld},需额外警惕`);
      if (localRisk === 'safe') localRisk = 'caution';
    }

    // 4. 过多连字符 / 子域(常见钓鱼特征)。
    if ((domain.match(/-/g) ?? []).length >= 3) {
      signals.push('域名含异常多的连字符,常见于钓鱼站');
      if (localRisk === 'safe') localRisk = 'caution';
    }

    return { signals, localRisk };
  }

  /** 地址/合约启发式(确定性)。 */
  private addressHeuristics(value: string): {
    signals: string[];
    localRisk: ScamRisk;
  } {
    const signals: string[] = [];
    if (!isEvmAddress(value)) {
      return { signals: ['非法 EVM 地址格式'], localRisk: 'caution' };
    }
    if (/^0x0+$/i.test(value)) {
      signals.push('零地址 / 销毁地址,向其转账资产将不可找回');
      return { signals, localRisk: 'caution' };
    }
    return { signals, localRisk: 'safe' };
  }

  /** 合并情报源与本地启发式得出综合风险等级。 */
  private combineScamRisk(
    intelFlagged: boolean | null,
    localRisk: ScamRisk,
  ): ScamRisk {
    // 情报源明确标记为骗局 → danger(最高优先)。
    if (intelFlagged === true) return 'danger';
    // 本地命中 danger → danger。
    if (localRisk === 'danger') return 'danger';
    // 本地命中 caution → caution。
    if (localRisk === 'caution') return 'caution';
    // 情报源明确未标记且本地无信号 → safe。
    if (intelFlagged === false && localRisk === 'safe') return 'safe';
    // 情报未知且本地无信号 → unknown(显式,不谎报 safe,Property 8)。
    return localRisk === 'safe' ? 'unknown' : localRisk;
  }

  /** 面向用户的明确建议。 */
  private scamAdvice(risk: ScamRisk, kind: ScamCheckRequest['kind']): string {
    const noun =
      kind === 'domain' ? '该域名' : kind === 'contract' ? '该合约' : '该地址';
    switch (risk) {
      case 'danger':
        return `⛔ 高危:${noun}存在明确骗局/钓鱼信号,强烈建议不要交互或签名。`;
      case 'caution':
        return `⚠️ 可疑:${noun}存在风险信号,请谨慎核实后再操作。`;
      case 'unknown':
        return `❓ 未知:暂无骗局情报覆盖${noun},无法确认安全,请自行谨慎核实(系统不替你判定安全)。`;
      case 'safe':
      default:
        return `✅ 暂未发现${noun}的骗局信号,但仍请保持基本警惕。`;
    }
  }

  /** 风险档排序权重(用于扫描结果按高风险在前)。 */
  private tierRank(tier: ApprovalRiskTier): number {
    return tier === 'high' ? 3 : tier === 'medium' ? 2 : 1;
  }

  /** 取两个风险档中的较高者。 */
  private maxTier(a: ApprovalRiskTier, b: ApprovalRiskTier): ApprovalRiskTier {
    return this.tierRank(a) >= this.tierRank(b) ? a : b;
  }
}
