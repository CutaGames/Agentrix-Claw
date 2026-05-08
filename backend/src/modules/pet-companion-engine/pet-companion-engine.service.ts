import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetProactiveEvent } from '../../entities/pet-proactive-event.entity';
import { PetProactivePref } from '../../entities/pet-proactive-pref.entity';
import { emitDesktopSyncEvent } from '../desktop-sync/desktop-sync.events';

/**
 * Pet Phase 6 — S2 主动陪伴引擎
 *
 * 设计契约（避坑 Replika 翻车）：
 *   1. 每 30 min Cron 评估，但任意 4 小时窗口最多 maxPer4h=1 条
 *   2. 用户可全局静音 N 小时（mute_until）
 *   3. 静默时段（默认 23:00-08:00 本地）一律不推
 *   4. 同 kind 软去重：8 小时内不重复
 *   5. 7 档亲密度解锁矩阵 — kind 强相关于 intimacy_level
 *
 * 7 档解锁矩阵：
 *   lv 0  morning_greet (基础早安)
 *   lv 1  pomodoro (专注番茄钟提醒)
 *   lv 2  night_wind_down (深夜助眠)
 *   lv 3  weekly_recap (周报感悟)
 *   lv 4  mood_followup (情绪跟进)
 *   lv 5  anxiety_help (焦虑疏导)
 *   lv 7  birthday (生日祝福；需用户在 profile 设了生日)
 *
 * 客户端约定：
 *   WS 事件 'presence:pet.proactive' → desktop PetProactiveBubble 展示气泡 + TTS
 *   payload = { event_id, kind, title, body, cta?, intimacy_level }
 */

export const PROACTIVE_KINDS = [
  'morning_greet',
  'pomodoro',
  'night_wind_down',
  'weekly_recap',
  'mood_followup',
  'anxiety_help',
  'birthday',
] as const;
export type ProactiveKind = (typeof PROACTIVE_KINDS)[number];

const INTIMACY_GATE: Record<ProactiveKind, number> = {
  morning_greet: 0,
  pomodoro: 1,
  night_wind_down: 2,
  weekly_recap: 3,
  mood_followup: 4,
  anxiety_help: 5,
  birthday: 7,
};

const DEDUPE_WINDOW_MS_BY_KIND: Record<ProactiveKind, number> = {
  morning_greet: 20 * 60 * 60 * 1000, // 20 h — 早安一天一次
  pomodoro: 90 * 60 * 1000, // 90 min
  night_wind_down: 20 * 60 * 60 * 1000,
  weekly_recap: 6 * 24 * 60 * 60 * 1000, // 6 d
  mood_followup: 4 * 60 * 60 * 1000,
  anxiety_help: 4 * 60 * 60 * 1000,
  birthday: 360 * 24 * 60 * 60 * 1000, // 1 年
};

interface Candidate {
  kind: ProactiveKind;
  payload: {
    title: string;
    body: string;
    cta?: { label: string; action: string } | null;
  };
}

@Injectable()
export class PetCompanionEngineService {
  private readonly logger = new Logger(PetCompanionEngineService.name);

  constructor(
    @InjectRepository(LivingPet)
    private readonly petRepo: Repository<LivingPet>,
    @InjectRepository(PetProactiveEvent)
    private readonly eventRepo: Repository<PetProactiveEvent>,
    @InjectRepository(PetProactivePref)
    private readonly prefRepo: Repository<PetProactivePref>,
  ) {}

  /** 每 30 分钟扫一次（生产）；test 通过 evaluateUser 直驱。 */
  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'pet-proactive-engine' })
  async tick(): Promise<void> {
    try {
      // 仅扫描"最近 24h 有交互"的活跃用户，避免长尾用户被骚扰
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const pets = await this.petRepo
        .createQueryBuilder('p')
        .where('p.last_interaction_at IS NOT NULL')
        .andWhere('p.last_interaction_at >= :cutoff', { cutoff: new Date(cutoff) })
        .limit(500) // 守门：单 tick 最多评估 500 个用户
        .getMany();
      this.logger.log(`[proactive] tick scanned ${pets.length} active pets`);
      for (const pet of pets) {
        try {
          await this.evaluateUser(pet);
        } catch (err) {
          this.logger.warn(
            `[proactive] evaluateUser failed user=${pet.userId}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`[proactive] tick failed: ${(err as Error).message}`);
    }
  }

  /** 单用户评估（cron 调用 + 测试钩子） */
  async evaluateUser(pet: LivingPet, nowMs = Date.now()): Promise<PetProactiveEvent | null> {
    const pref = await this.getOrCreatePref(pet.userId);

    // 1. 全局静音
    if (Number(pref.muteUntil) > nowMs) {
      return this.recordSuppressed(pet.userId, 'globally_muted');
    }

    // 2. 静默时段
    const localHour = new Date(nowMs).getHours();
    if (this.isQuietHour(localHour, pref.quietHoursStart, pref.quietHoursEnd)) {
      return this.recordSuppressed(pet.userId, 'quiet_hours');
    }

    // 3. 4 小时窗口频次
    const sentLast4h = await this.eventRepo.count({
      where: {
        userId: pet.userId,
        status: 'sent',
        createdAt: Between(new Date(nowMs - 4 * 60 * 60 * 1000), new Date(nowMs)),
      },
    });
    if (sentLast4h >= pref.maxPer4h) {
      return this.recordSuppressed(pet.userId, 'rate_limited');
    }

    // 4. 候选生成 + 亲密度门槛
    const candidates = this.generateCandidates(pet, nowMs);
    const enabled = pref.enabledKinds && pref.enabledKinds.length > 0
      ? new Set(pref.enabledKinds)
      : new Set(PROACTIVE_KINDS as readonly string[]);
    const eligible = candidates.filter(
      (c) =>
        pet.intimacyLevel >= INTIMACY_GATE[c.kind] && enabled.has(c.kind),
    );
    if (eligible.length === 0) return null;

    // 5. 同 kind 软去重 — 取第一个未在去重窗口内的
    for (const candidate of eligible) {
      const window = DEDUPE_WINDOW_MS_BY_KIND[candidate.kind];
      const recent = await this.eventRepo.count({
        where: {
          userId: pet.userId,
          kind: candidate.kind,
          status: 'sent',
          createdAt: Between(new Date(nowMs - window), new Date(nowMs)),
        },
      });
      if (recent === 0) {
        return this.dispatch(pet.userId, candidate, pet.intimacyLevel);
      }
    }
    return null;
  }

  /** 候选事件：根据时间 + 用户状态生成 */
  private generateCandidates(pet: LivingPet, nowMs: number): Candidate[] {
    const out: Candidate[] = [];
    const hour = new Date(nowMs).getHours();
    const dow = new Date(nowMs).getDay();

    // 早 7-10 点 → 早安
    if (hour >= 7 && hour <= 10) {
      out.push({
        kind: 'morning_greet',
        payload: {
          title: '早安',
          body: `今天又是和 ${pet.name} 一起的一天，要不要先列个 todo？`,
          cta: { label: '打开聊天', action: 'open_chat_panel' },
        },
      });
    }

    // 工作时段 10-18 → 番茄钟
    if (hour >= 10 && hour <= 18) {
      out.push({
        kind: 'pomodoro',
        payload: {
          title: '专注 25 分钟？',
          body: '我帮你计时 + 屏蔽通知，到点提醒休息。',
          cta: { label: '开始番茄钟', action: 'start_pomodoro' },
        },
      });
    }

    // 22-23 点 → 助眠（只在亲密度够时才会通过 gate）
    if (hour >= 22 && hour <= 23) {
      out.push({
        kind: 'night_wind_down',
        payload: {
          title: '该睡了',
          body: '要不要播一段白噪音？我帮你调暗屏幕。',
          cta: { label: '助眠模式', action: 'wind_down' },
        },
      });
    }

    // 周日 19-21 点 → 周记
    if (dow === 0 && hour >= 19 && hour <= 21) {
      out.push({
        kind: 'weekly_recap',
        payload: {
          title: '回顾这一周？',
          body: '我整理了你这周的高光时刻 + 1 个建议。',
          cta: { label: '看周报', action: 'open_weekly_recap' },
        },
      });
    }

    // 情绪持续 sad / angry / concerned 超 30 min → 跟进
    if (
      ['sad', 'angry', 'concerned', 'tired'].includes(pet.emotion) &&
      Number(pet.emotionSince) > 0 &&
      nowMs - Number(pet.emotionSince) > 30 * 60 * 1000
    ) {
      out.push({
        kind: 'mood_followup',
        payload: {
          title: '还好吗？',
          body: '我注意到你状态不太对，想聊聊吗？',
          cta: { label: '陪我聊聊', action: 'open_chat_panel' },
        },
      });
    }

    // angry / 高强度 concerned → 焦虑疏导
    if (
      (pet.emotion === 'angry' && pet.emotionIntensity >= 2) ||
      (pet.emotion === 'concerned' && pet.emotionIntensity >= 3)
    ) {
      out.push({
        kind: 'anxiety_help',
        payload: {
          title: '深呼吸 3 次',
          body: '我陪你做 60 秒呼吸练习，会好很多。',
          cta: { label: '开始练习', action: 'start_breathing' },
        },
      });
    }

    // birthday: 不在 service 实现（需要用户 profile 生日字段，留给 P7）
    return out;
  }

  private async dispatch(
    userId: string,
    candidate: Candidate,
    intimacyLevel: number,
  ): Promise<PetProactiveEvent> {
    const event = this.eventRepo.create({
      userId,
      kind: candidate.kind,
      payload: candidate.payload,
      intimacyRequired: INTIMACY_GATE[candidate.kind],
      status: 'sent',
    });
    const saved = await this.eventRepo.save(event);
    emitDesktopSyncEvent(userId, 'presence:pet.proactive', {
      event_id: saved.id,
      kind: saved.kind,
      title: candidate.payload.title,
      body: candidate.payload.body,
      cta: candidate.payload.cta ?? null,
      intimacy_level: intimacyLevel,
      sent_at: saved.createdAt.getTime(),
    });
    this.logger.log(
      `[proactive] sent kind=${candidate.kind} user=${userId} lv=${intimacyLevel}`,
    );
    return saved;
  }

  private async recordSuppressed(
    userId: string,
    reason: string,
  ): Promise<PetProactiveEvent> {
    const ev = this.eventRepo.create({
      userId,
      kind: 'suppressed',
      status: 'suppressed',
      suppressedReason: reason,
      payload: {},
      intimacyRequired: 0,
    });
    return this.eventRepo.save(ev);
  }

  private isQuietHour(hour: number, start: number, end: number): boolean {
    // start may wrap past midnight (e.g. 23 → 8 covers 23,0..7)
    if (start === end) return false;
    if (start < end) return hour >= start && hour < end;
    return hour >= start || hour < end;
  }

  // ── Pref API ───────────────────────────────────────────────────────
  async getOrCreatePref(userId: string): Promise<PetProactivePref> {
    let pref = await this.prefRepo.findOne({ where: { userId } });
    if (!pref) {
      pref = this.prefRepo.create({
        userId,
        maxPer4h: 1,
        quietHoursStart: 23,
        quietHoursEnd: 8,
        enabledKinds: [...PROACTIVE_KINDS],
        muteUntil: '0',
      });
      pref = await this.prefRepo.save(pref);
    }
    return pref;
  }

  async updatePref(
    userId: string,
    patch: Partial<{
      maxPer4h: number;
      quietHoursStart: number;
      quietHoursEnd: number;
      enabledKinds: string[];
    }>,
  ): Promise<PetProactivePref> {
    const pref = await this.getOrCreatePref(userId);
    if (typeof patch.maxPer4h === 'number') {
      pref.maxPer4h = Math.max(0, Math.min(6, Math.floor(patch.maxPer4h)));
    }
    if (typeof patch.quietHoursStart === 'number') {
      pref.quietHoursStart = ((patch.quietHoursStart % 24) + 24) % 24;
    }
    if (typeof patch.quietHoursEnd === 'number') {
      pref.quietHoursEnd = ((patch.quietHoursEnd % 24) + 24) % 24;
    }
    if (Array.isArray(patch.enabledKinds)) {
      pref.enabledKinds = patch.enabledKinds.filter((k): k is string =>
        (PROACTIVE_KINDS as readonly string[]).includes(k),
      );
    }
    return this.prefRepo.save(pref);
  }

  /** 全局静音 N 小时；hours=0 取消静音。 */
  async mute(userId: string, hours: number): Promise<PetProactivePref> {
    const pref = await this.getOrCreatePref(userId);
    const clampedHours = Math.max(0, Math.min(24, Math.floor(hours)));
    pref.muteUntil = String(
      clampedHours === 0 ? 0 : Date.now() + clampedHours * 60 * 60 * 1000,
    );
    return this.prefRepo.save(pref);
  }

  async ack(userId: string, eventId: string): Promise<PetProactiveEvent | null> {
    const ev = await this.eventRepo.findOne({ where: { id: eventId, userId } });
    if (!ev) return null;
    ev.status = 'ack';
    ev.ackAt = new Date();
    return this.eventRepo.save(ev);
  }

  async dismiss(
    userId: string,
    eventId: string,
  ): Promise<PetProactiveEvent | null> {
    const ev = await this.eventRepo.findOne({ where: { id: eventId, userId } });
    if (!ev) return null;
    ev.status = 'dismissed';
    return this.eventRepo.save(ev);
  }

  /** 最近 N 条历史（GET /api/v1/pet/proactive/history） */
  async listRecent(userId: string, limit = 30): Promise<PetProactiveEvent[]> {
    return this.eventRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(100, Math.max(1, limit)),
    });
  }
}
