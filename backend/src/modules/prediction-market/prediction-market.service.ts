import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import {
  PredictionAsset,
  PredictionOutcome,
  PredictionRound,
  PredictionRoundStatus,
} from '../../entities/prediction-round.entity';
import {
  PredictionBet,
  PredictionBetSide,
  PredictionBetStatus,
} from '../../entities/prediction-bet.entity';
import { PredictionUserBalance } from '../../entities/prediction-user-balance.entity';
import { PriceOracleService } from './price-oracle.service';

const ROUND_INTERVAL_SEC = 300; // 5min
const LOCK_AHEAD_SEC = 60; // 最后 60s 锁定，不接受下注
const ROUNDS_AHEAD = 6; // 始终预备未来 6 个轮次

const MIN_BET = 1;
const MAX_BET = 500;
const STARTER_BALANCE = 1000;

@Injectable()
export class PredictionMarketService implements OnModuleInit {
  private readonly logger = new Logger(PredictionMarketService.name);

  constructor(
    @InjectRepository(PredictionRound)
    private readonly roundRepo: Repository<PredictionRound>,
    @InjectRepository(PredictionBet)
    private readonly betRepo: Repository<PredictionBet>,
    @InjectRepository(PredictionUserBalance)
    private readonly balanceRepo: Repository<PredictionUserBalance>,
    private readonly oracle: PriceOracleService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureUpcomingRounds(PredictionAsset.BTC);
    } catch (e: any) {
      this.logger.warn(`onModuleInit ensureUpcomingRounds: ${e?.message}`);
    }
  }

  // ─── Cron 调度 ─────────────────────────────────────────────
  @Cron(CronExpression.EVERY_30_SECONDS)
  async tick(): Promise<void> {
    try {
      await this.lockExpiredOpenRounds();
      await this.settleDueRounds();
      await this.ensureUpcomingRounds(PredictionAsset.BTC);
    } catch (e: any) {
      this.logger.warn(`tick error: ${e?.message}`);
    }
  }

  // ─── 轮次维护 ──────────────────────────────────────────────
  /** 保证 BTC 至少有 ROUNDS_AHEAD 个未到期 OPEN 轮次。 */
  async ensureUpcomingRounds(asset: PredictionAsset): Promise<void> {
    const now = new Date();
    const futureOpen = await this.roundRepo.count({
      where: {
        asset,
        status: In([PredictionRoundStatus.OPEN]),
      },
    });

    if (futureOpen >= ROUNDS_AHEAD) return;

    // 找最后一个轮次的 expiry，作为下一轮 open 的起点
    const last = await this.roundRepo.findOne({
      where: { asset },
      order: { expiryTime: 'DESC' },
    });

    let nextOpen = last
      ? new Date(last.expiryTime.getTime())
      : this.alignToInterval(now, ROUND_INTERVAL_SEC);

    const toCreate: Partial<PredictionRound>[] = [];
    while (toCreate.length + futureOpen < ROUNDS_AHEAD) {
      const open = new Date(nextOpen);
      const expiry = new Date(open.getTime() + ROUND_INTERVAL_SEC * 1000);
      const lock = new Date(expiry.getTime() - LOCK_AHEAD_SEC * 1000);
      // 跳过已过期的潜在轮次
      if (expiry.getTime() > now.getTime()) {
        toCreate.push({
          asset,
          intervalSeconds: ROUND_INTERVAL_SEC,
          status: PredictionRoundStatus.OPEN,
          openTime: open,
          lockTime: lock,
          expiryTime: expiry,
        });
      }
      nextOpen = expiry;
    }
    if (toCreate.length) {
      await this.roundRepo.save(toCreate as PredictionRound[]);
      this.logger.log(`Created ${toCreate.length} upcoming ${asset} rounds`);
    }
  }

  private alignToInterval(now: Date, intervalSec: number): Date {
    const ms = intervalSec * 1000;
    return new Date(Math.ceil(now.getTime() / ms) * ms);
  }

  /** 把已到锁定时间但仍 OPEN 的轮次切到 LOCKED，并采集 lockPrice。 */
  private async lockExpiredOpenRounds(): Promise<void> {
    const now = new Date();
    const due = await this.roundRepo.find({
      where: {
        status: PredictionRoundStatus.OPEN,
        lockTime: LessThanOrEqual(now),
      },
      take: 20,
    });
    for (const round of due) {
      try {
        const price = await this.oracle.getSpotPrice(round.asset);
        round.lockPrice = String(price);
        round.status = PredictionRoundStatus.LOCKED;
        await this.roundRepo.save(round);
      } catch (e: any) {
        this.logger.warn(`Lock round ${round.id} failed: ${e?.message}`);
      }
    }
  }

  /** 已到期 LOCKED 轮次结算。 */
  private async settleDueRounds(): Promise<void> {
    const now = new Date();
    const due = await this.roundRepo.find({
      where: {
        status: PredictionRoundStatus.LOCKED,
        expiryTime: LessThanOrEqual(now),
      },
      take: 20,
    });
    for (const round of due) {
      try {
        await this.settleRound(round);
      } catch (e: any) {
        this.logger.error(`Settle round ${round.id} failed: ${e?.message}`);
      }
    }
  }

  private async settleRound(round: PredictionRound): Promise<void> {
    if (round.status !== PredictionRoundStatus.LOCKED) return;

    let close: number;
    try {
      close = await this.oracle.getSpotPrice(round.asset);
    } catch (e: any) {
      this.logger.warn(`Oracle failed for round ${round.id}, voiding: ${e?.message}`);
      await this.voidRound(round);
      return;
    }
    const lock = parseFloat(round.lockPrice ?? '0');
    if (!lock) {
      await this.voidRound(round);
      return;
    }

    let outcome: PredictionOutcome;
    if (close > lock) outcome = PredictionOutcome.UP;
    else if (close < lock) outcome = PredictionOutcome.DOWN;
    else outcome = PredictionOutcome.TIE;

    round.closePrice = String(close);
    round.outcome = outcome;
    round.status = PredictionRoundStatus.SETTLED;

    const upPool = parseFloat(round.upPool || '0');
    const downPool = parseFloat(round.downPool || '0');
    const totalPool = upPool + downPool;
    const feeRate = parseFloat(round.feeRate || '0.05');

    const bets = await this.betRepo.find({ where: { roundId: round.id } });

    if (outcome === PredictionOutcome.TIE || totalPool === 0) {
      // 平局或无对手盘 → 全部退款
      for (const bet of bets) {
        await this.refundBet(bet, round);
      }
      round.feeCollected = '0';
      await this.roundRepo.save(round);
      return;
    }

    const winningSide =
      outcome === PredictionOutcome.UP ? PredictionBetSide.UP : PredictionBetSide.DOWN;
    const winningPool = winningSide === PredictionBetSide.UP ? upPool : downPool;
    const losingPool = winningSide === PredictionBetSide.UP ? downPool : upPool;

    if (winningPool === 0) {
      // 无人下注获胜方 → 全部退款，平台不抽佣
      for (const bet of bets) {
        await this.refundBet(bet, round);
      }
      round.feeCollected = '0';
      await this.roundRepo.save(round);
      return;
    }

    const platformFee = losingPool * feeRate;
    const distributable = losingPool - platformFee;

    for (const bet of bets) {
      const stake = parseFloat(bet.amount);
      if (bet.side === winningSide) {
        const share = stake / winningPool;
        const profit = distributable * share;
        const payout = stake + profit;
        bet.status = PredictionBetStatus.WON;
        bet.outcome = outcome;
        bet.payout = payout.toFixed(4);
        bet.settledAt = new Date();
        await this.betRepo.save(bet);
        await this.creditBalance(bet.userId, payout, true);
      } else {
        bet.status = PredictionBetStatus.LOST;
        bet.outcome = outcome;
        bet.payout = '0';
        bet.settledAt = new Date();
        await this.betRepo.save(bet);
        await this.recordLoss(bet.userId);
      }
    }

    round.feeCollected = platformFee.toFixed(4);
    await this.roundRepo.save(round);
    this.logger.log(
      `Round ${round.id} settled: ${outcome} (lock=${lock} close=${close}) pool=${totalPool} fee=${platformFee.toFixed(4)}`,
    );
  }

  private async voidRound(round: PredictionRound): Promise<void> {
    round.status = PredictionRoundStatus.VOIDED;
    round.outcome = PredictionOutcome.UNKNOWN;
    await this.roundRepo.save(round);
    const bets = await this.betRepo.find({ where: { roundId: round.id } });
    for (const bet of bets) await this.refundBet(bet, round);
  }

  private async refundBet(bet: PredictionBet, round: PredictionRound): Promise<void> {
    if (
      bet.status === PredictionBetStatus.WON ||
      bet.status === PredictionBetStatus.LOST ||
      bet.status === PredictionBetStatus.REFUNDED
    ) {
      return;
    }
    const stake = parseFloat(bet.amount);
    bet.status = PredictionBetStatus.REFUNDED;
    bet.payout = stake.toFixed(4);
    bet.outcome = round.outcome;
    bet.settledAt = new Date();
    await this.betRepo.save(bet);
    // 退还本金（不计入 wins/losses）
    const bal = await this.getOrCreateBalance(bet.userId);
    bal.balance = (parseFloat(bal.balance) + stake).toFixed(4);
    bal.totalWagered = (parseFloat(bal.totalWagered) - stake).toFixed(4);
    await this.balanceRepo.save(bal);
  }

  // ─── 余额 ─────────────────────────────────────────────────
  async getOrCreateBalance(userId: string): Promise<PredictionUserBalance> {
    let bal = await this.balanceRepo.findOne({ where: { userId } });
    if (!bal) {
      bal = this.balanceRepo.create({ userId, balance: String(STARTER_BALANCE) });
      bal = await this.balanceRepo.save(bal);
    }
    return bal;
  }

  private async creditBalance(userId: string, amount: number, isWin: boolean): Promise<void> {
    const bal = await this.getOrCreateBalance(userId);
    const next = parseFloat(bal.balance) + amount;
    bal.balance = next.toFixed(4);
    bal.totalPayout = (parseFloat(bal.totalPayout) + amount).toFixed(4);
    bal.netPnl = (parseFloat(bal.totalPayout) - parseFloat(bal.totalWagered)).toFixed(4);
    if (isWin) {
      bal.winsCount += 1;
      bal.currentStreak = bal.currentStreak >= 0 ? bal.currentStreak + 1 : 1;
      if (bal.currentStreak > bal.bestStreak) bal.bestStreak = bal.currentStreak;
    }
    await this.balanceRepo.save(bal);
  }

  private async recordLoss(userId: string): Promise<void> {
    const bal = await this.getOrCreateBalance(userId);
    bal.lossesCount += 1;
    bal.currentStreak = bal.currentStreak <= 0 ? bal.currentStreak - 1 : -1;
    bal.netPnl = (parseFloat(bal.totalPayout) - parseFloat(bal.totalWagered)).toFixed(4);
    await this.balanceRepo.save(bal);
  }

  // ─── 公开 API ──────────────────────────────────────────────
  /** 当前活跃轮次列表（OPEN + LOCKED） */
  async listLiveRounds(asset: PredictionAsset = PredictionAsset.BTC, limit = 8): Promise<any[]> {
    await this.ensureUpcomingRounds(asset);
    const rows = await this.roundRepo.find({
      where: {
        asset,
        status: In([PredictionRoundStatus.OPEN, PredictionRoundStatus.LOCKED]),
      },
      order: { expiryTime: 'ASC' },
      take: limit,
    });
    return rows.map((r) => this.serializeRound(r));
  }

  /** 已结算最近 N 轮（带结果） */
  async listRecentSettled(asset: PredictionAsset = PredictionAsset.BTC, limit = 10): Promise<any[]> {
    const rows = await this.roundRepo.find({
      where: { asset, status: In([PredictionRoundStatus.SETTLED, PredictionRoundStatus.VOIDED]) },
      order: { expiryTime: 'DESC' },
      take: limit,
    });
    return rows.map((r) => this.serializeRound(r));
  }

  async getRound(id: string): Promise<any> {
    const r = await this.roundRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Round not found');
    return this.serializeRound(r);
  }

  /** 下注 */
  async placeBet(params: {
    userId: string;
    roundId: string;
    side: PredictionBetSide;
    amount: number;
  }): Promise<{ bet: PredictionBet; balance: PredictionUserBalance; round: any }> {
    const { userId, roundId, side, amount } = params;
    if (!userId) throw new ForbiddenException('Login required');
    if (!Number.isFinite(amount)) throw new BadRequestException('Invalid amount');
    if (amount < MIN_BET) throw new BadRequestException(`Minimum bet is ${MIN_BET} USDC`);
    if (amount > MAX_BET) throw new BadRequestException(`Maximum bet is ${MAX_BET} USDC`);

    const round = await this.roundRepo.findOne({ where: { id: roundId } });
    if (!round) throw new NotFoundException('Round not found');
    if (round.status !== PredictionRoundStatus.OPEN) {
      throw new BadRequestException('Round is closed for betting');
    }
    const now = Date.now();
    if (now >= round.lockTime.getTime()) {
      throw new BadRequestException('Round is locked');
    }

    const bal = await this.getOrCreateBalance(userId);
    const cur = parseFloat(bal.balance);
    if (cur < amount) throw new BadRequestException('Insufficient balance');

    // 扣余额
    bal.balance = (cur - amount).toFixed(4);
    bal.totalWagered = (parseFloat(bal.totalWagered) + amount).toFixed(4);
    bal.totalBets += 1;
    await this.balanceRepo.save(bal);

    // 更新池子
    if (side === PredictionBetSide.UP) {
      round.upPool = (parseFloat(round.upPool) + amount).toFixed(4);
      round.upCount += 1;
    } else {
      round.downPool = (parseFloat(round.downPool) + amount).toFixed(4);
      round.downCount += 1;
    }
    round.totalPool = (parseFloat(round.totalPool) + amount).toFixed(4);
    await this.roundRepo.save(round);

    // 记录 bet
    const bet = await this.betRepo.save(
      this.betRepo.create({
        userId,
        roundId,
        side,
        amount: amount.toFixed(4),
        status: PredictionBetStatus.PLACED,
        outcome: PredictionOutcome.UNKNOWN,
        mode: 'demo',
      }),
    );

    return { bet, balance: bal, round: this.serializeRound(round) };
  }

  async getMyBets(userId: string, limit = 30): Promise<any[]> {
    const rows = await this.betRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    if (rows.length === 0) return [];
    const roundIds = Array.from(new Set(rows.map((r) => r.roundId)));
    const rounds = await this.roundRepo.find({ where: { id: In(roundIds) } });
    const map = new Map(rounds.map((r) => [r.id, r]));
    return rows.map((b) => ({
      id: b.id,
      roundId: b.roundId,
      side: b.side,
      amount: Number(b.amount),
      status: b.status,
      outcome: b.outcome,
      payout: Number(b.payout),
      createdAt: b.createdAt,
      settledAt: b.settledAt,
      round: map.get(b.roundId) ? this.serializeRound(map.get(b.roundId)!) : null,
    }));
  }

  /** 简易排行榜：按 netPnl 取 top N */
  async leaderboard(limit = 10): Promise<any[]> {
    const rows = await this.balanceRepo
      .createQueryBuilder('b')
      .orderBy('b.netPnl', 'DESC')
      .limit(limit)
      .getMany();
    return rows.map((b, i) => ({
      rank: i + 1,
      userId: b.userId,
      netPnl: Number(b.netPnl),
      totalBets: b.totalBets,
      winsCount: b.winsCount,
      lossesCount: b.lossesCount,
      bestStreak: b.bestStreak,
      winRate:
        b.totalBets > 0 ? Number(((b.winsCount / b.totalBets) * 100).toFixed(2)) : 0,
    }));
  }

  // ─── 工具 ─────────────────────────────────────────────────
  private serializeRound(r: PredictionRound) {
    const upPool = parseFloat(r.upPool || '0');
    const downPool = parseFloat(r.downPool || '0');
    const total = upPool + downPool;
    const upPct = total > 0 ? Math.round((upPool / total) * 100) : 50;
    const downPct = 100 - upPct;
    // 池内赔率（不含手续费）：池总 / 该方池
    const feeRate = parseFloat(r.feeRate || '0.05');
    const upOdds = upPool > 0 ? 1 + ((downPool * (1 - feeRate)) / upPool) : null;
    const downOdds = downPool > 0 ? 1 + ((upPool * (1 - feeRate)) / downPool) : null;
    return {
      id: r.id,
      asset: r.asset,
      status: r.status,
      openTime: r.openTime,
      lockTime: r.lockTime,
      expiryTime: r.expiryTime,
      lockPrice: r.lockPrice ? Number(r.lockPrice) : null,
      closePrice: r.closePrice ? Number(r.closePrice) : null,
      outcome: r.outcome,
      totalPool: total,
      upPool,
      downPool,
      upCount: r.upCount,
      downCount: r.downCount,
      upPct,
      downPct,
      upOdds: upOdds != null ? Number(upOdds.toFixed(3)) : null,
      downOdds: downOdds != null ? Number(downOdds.toFixed(3)) : null,
      feeRate,
      intervalSeconds: r.intervalSeconds,
    };
  }
}
