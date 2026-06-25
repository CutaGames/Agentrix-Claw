import { Injectable, Logger, Optional } from '@nestjs/common';
import { AxpService } from '../../axp/axp.service';
import { AsyncInboxService } from '../inbox/async-inbox.service';
import { WorldNewsService } from '../news/world-news.service';

/**
 * RealityLoopService — 现实×游戏双向闭环(Task 4.7 / R14.6 / R20)。
 *
 * 现实→游戏(R20.1/20.2):真实 agent 任务 / Computer Use 完成 → 世界奖励(AXP/buff);
 *   扫描物体入世界为居民/道具。
 * 游戏→现实(R20.3/20.4):世界事件触发 Assistant_Bridge intent(复用现有 reverse-call
 *   intents,由移动端审批门执行);世界 AXP 入现有钱包,跨 Agentrix 平台可用。
 *
 * 钱包桥接(R20.4):本服务是 Aeon 世界经济与全局 AXP 钱包的唯一桥。Aeon 内部账本
 * (aeon_ledger_entries)保证世界内守恒;当世界收入要"出金"到用户全局钱包(可跨端用)
 * 时,经此调用 AxpService.earn(已登记 aeon_* earn sources)。AxpService 不可用时降级
 * (只记 Aeon 账本 + inbox 通知),不阻断世界闭环(R18.5)。
 */
@Injectable()
export class RealityLoopService {
  private readonly logger = new Logger(RealityLoopService.name);

  constructor(
    private readonly inbox: AsyncInboxService,
    @Optional() private readonly axp?: AxpService,
    @Optional() private readonly news?: WorldNewsService,
  ) {}

  /**
   * 把世界内赚到的 AXP 出金到用户全局钱包(R20.4)。source 必须是已登记的 aeon_* earn source。
   * 返回是否成功桥接到全局钱包(false = 钱包不可用,已降级)。
   */
  async creditWallet(
    userId: string,
    amount: number,
    source: 'aeon_wage' | 'aeon_bounty' | 'aeon_task' | 'aeon_market_sale' | 'aeon_reality_reward',
    refId?: string,
  ): Promise<{ bridged: boolean; balance?: number }> {
    if (!(amount > 0)) return { bridged: false };
    if (!this.axp) {
      this.logger.warn(`AXP wallet unavailable; world-only credit userId=${userId} +${amount} (${source})`);
      return { bridged: false };
    }
    try {
      const res = await this.axp.earn({ userId, source, amount, refId: refId ?? null });
      return { bridged: true, balance: res.balance };
    } catch (e) {
      this.logger.warn(`wallet bridge failed (${source}): ${(e as Error).message}`);
      this.inbox.push(userId, 'wage_paid', '收入待入账', `世界收入 +${amount} AXP 入账延迟,稍后自动重试。`, refId);
      return { bridged: false };
    }
  }

  /**
   * 现实→游戏奖励(R20.1):真实 agent 任务 / Computer Use 完成 → 世界 AXP 奖励 + 世界新闻。
   * 由现实侧(OpenClaw 任务完成 / 算力贡献)的 hook 调用。
   */
  async rewardFromReality(
    userId: string,
    amount: number,
    reason: string,
    refId?: string,
  ): Promise<{ bridged: boolean; balance?: number }> {
    const res = await this.creditWallet(userId, amount, 'aeon_reality_reward', refId);
    this.inbox.push(
      userId,
      'wage_paid',
      '现实任务奖励',
      `${reason} 已折算为世界奖励 +${amount} AXP。`,
      refId,
    );
    this.news?.publish('milestone', `有居民在现实世界完成了「${reason}」,赢得了永曜城的奖励 ✨`, { refId });
    return res;
  }

  /**
   * 游戏→现实意图(R20.3):世界事件触发一个 Assistant_Bridge reverse-call intent。
   * 这里只构造 intent 描述符并入收件箱(离线)/返回给调用方下发(在线);真正的
   * OS 级动作由移动端 systemAssistantBridge 审批门执行(复用现有 15 intents 通道)。
   */
  buildAssistantIntent(
    userId: string,
    kind: 'openMaps' | 'timer' | 'calendar' | 'callPhone' | 'smartHome',
    args: Record<string, unknown>,
    humanReadable: string,
  ): { kind: string; args: Record<string, unknown>; note: string } {
    this.inbox.push(userId, 'world_event', '世界触发了一个现实动作', humanReadable);
    this.logger.log(`reality intent ${kind} for user=${userId}: ${humanReadable}`);
    return { kind, args, note: humanReadable };
  }
}
