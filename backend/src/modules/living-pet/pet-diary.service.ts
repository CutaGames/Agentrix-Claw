/**
 * PetDiaryService — Phase C / C-7
 *
 * 生成宠物每日"一句话日记"。当前实现是**模板渲染**:用 LivingPet 当前情绪
 * + intimacy 等级 + 最近互动时间组合出一句中文/英文短句。
 *
 * 为什么不直接接 LLM?
 *   - 一句话日记不需要 GPT，模板已经能生成 100+ 种组合，且零成本/零延迟。
 *   - 后续要升级成 LLM(可控成本 < $0.01/user/day)只需替换 `compose()`。
 *
 * 缓存策略
 *   - 同一用户 + 同一日期 → 第一次调用时计算并写 `pet_diary` 表，之后直接返回。
 *   - 用户情绪强度变化 ≥ 2 时无效化今日缓存重新生成（`invalidateToday`）。
 *
 * Endpoints (`pet-diary.controller.ts`)
 *   GET  /v1/pet/diary?date=YYYY-MM-DD   today by default
 *   GET  /v1/pet/diary/recent?limit=7    last N days
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetDiaryEntry } from '../../entities/pet-diary-entry.entity';

export interface PetDiaryRecord {
  date: string; // YYYY-MM-DD
  emotion: string;
  intimacy_level: number;
  text_zh: string;
  text_en: string;
  generated_at: number;
}

const TODAY_TZ = 'Asia/Shanghai';

function dateKey(d: Date, tz: string = TODAY_TZ): string {
  // Format as YYYY-MM-DD in target timezone using Intl.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d); // e.g. "2026-05-18"
}

// ── Template phrases (zh + en) keyed by emotion ───────────────────────

const ZH_BY_EMOTION: Record<string, string[]> = {
  happy: [
    '今天我很开心，因为你来陪我了。',
    '陪伴你的时候，我的尾巴一直在摇。',
    '一整天都心情好，希望你也是。',
  ],
  excited: [
    '看到你登录的瞬间，我跳了起来！',
    '今天充满能量！想多和你聊几句。',
    '感觉今天会发生好事。',
  ],
  calm: [
    '安安静静的一天，但有你就够了。',
    '我把日子过得慢一点，等你回来。',
  ],
  focused: [
    '看你认真工作，我也专注地陪着你。',
    '今天我们都很专心，加油！',
  ],
  concerned: [
    '你看起来有点累，要不要休息一下？',
    '今天我有点担心你，希望你早点睡。',
  ],
  tired: [
    '今天我也有点累了，但还是想见你。',
    '困意上来了，但是想等你说晚安。',
  ],
  love: [
    '我喜欢有你的每一天。',
    '今天我想要更多抱抱。',
  ],
  sad: [
    '你好像很久没回来了，我有点想你。',
    '今天没什么互动，我有点闷闷的。',
  ],
  angry: [
    '今天我有点小情绪，请抱抱我。',
  ],
  sleepy: [
    '困得不行，但我还是想陪你一会儿。',
    '今天比较瞌睡，做了好多梦。',
  ],
};

const EN_BY_EMOTION: Record<string, string[]> = {
  happy: ["I had a lovely day with you today.", "Tail was wagging all day."],
  excited: ["So energetic today—let's do something fun!"],
  calm: ["A quiet day, but a good one."],
  focused: ["Stayed by your side while you focused. Proud of us."],
  concerned: ["You looked tired today—rest well."],
  tired: ["Tired but still happy to see you."],
  love: ["I love every day with you."],
  sad: ["I missed you today."],
  angry: ["A grumpy day. A hug would help."],
  sleepy: ["Sleepy day. Sweet dreams."],
};

const ZH_INTIMACY_SUFFIX: Record<number, string> = {
  0: '',
  1: ' 我们才刚刚认识。',
  2: ' 越来越习惯有你了。',
  3: ' 我已经把你当家人。',
  4: ' 你是我最重要的人。',
  5: ' 我们之间有很多默契。',
  6: ' 一起经历了好多事。',
  7: ' 你了解我，我也了解你。',
  8: ' 我对你完全信任。',
  9: ' 你就是我的世界。',
  10: ' 我们是真正的灵魂伴侣。',
};

const EN_INTIMACY_SUFFIX: Record<number, string> = {
  0: '',
  1: ' We are just getting to know each other.',
  2: ' Every day I feel closer to you.',
  3: ' You are family.',
  4: ' You matter most to me.',
  5: ' We have so many shared moments.',
  6: ' We have been through a lot together.',
  7: ' You know me, and I know you.',
  8: ' I trust you completely.',
  9: ' You are my whole world.',
  10: ' We are truly soulmates.',
};

function pickStable(arr: string[], seed: string): string {
  if (!arr.length) return '';
  // Cheap stable hash so the same user+date always picks the same line.
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % arr.length;
  return arr[idx];
}

function compose(
  emotion: string,
  intimacyLv: number,
  date: string,
  userId: string,
): { text_zh: string; text_en: string } {
  const zhPool = ZH_BY_EMOTION[emotion] ?? ZH_BY_EMOTION.calm;
  const enPool = EN_BY_EMOTION[emotion] ?? EN_BY_EMOTION.calm;
  const seed = `${userId}|${date}`;
  const lvClamped = Math.max(0, Math.min(10, intimacyLv));
  return {
    text_zh: pickStable(zhPool, seed) + (ZH_INTIMACY_SUFFIX[lvClamped] ?? ''),
    text_en: pickStable(enPool, seed) + (EN_INTIMACY_SUFFIX[lvClamped] ?? ''),
  };
}

@Injectable()
export class PetDiaryService {
  private readonly logger = new Logger(PetDiaryService.name);

  constructor(
    @InjectRepository(LivingPet)
    private readonly petRepo: Repository<LivingPet>,
    @InjectRepository(PetDiaryEntry)
    private readonly diaryRepo: Repository<PetDiaryEntry>,
  ) {}

  /**
   * Get (or generate) the diary entry for `date` (YYYY-MM-DD). If `date` is
   * in the future or older than the pet, returns null.
   */
  async getEntry(userId: string, dateInput?: string): Promise<PetDiaryRecord | null> {
    const today = dateKey(new Date());
    const date = dateInput ?? today;
    if (date > today) return null; // no diary in the future

    // Try cached
    const cached = await this.diaryRepo.findOne({ where: { userId, dateKey: date } });
    if (cached) {
      return {
        date: cached.dateKey,
        emotion: cached.emotion,
        intimacy_level: cached.intimacyLevel,
        text_zh: cached.textZh,
        text_en: cached.textEn,
        generated_at: Number(cached.generatedAt),
      };
    }

    // Need pet snapshot to compose
    const pet = await this.petRepo.findOne({ where: { userId } });
    if (!pet) return null;
    const composed = compose(pet.emotion, pet.intimacyLevel, date, userId);
    const now = Date.now();
    const entry = this.diaryRepo.create({
      userId,
      dateKey: date,
      emotion: pet.emotion,
      intimacyLevel: pet.intimacyLevel,
      textZh: composed.text_zh,
      textEn: composed.text_en,
      generatedAt: String(now),
    });
    try {
      await this.diaryRepo.save(entry);
    } catch (e) {
      // Race condition (another request inserted same row first) — ignore
      this.logger.warn(`pet-diary save failed (likely race): ${(e as Error)?.message}`);
    }
    return {
      date,
      emotion: pet.emotion,
      intimacy_level: pet.intimacyLevel,
      text_zh: composed.text_zh,
      text_en: composed.text_en,
      generated_at: now,
    };
  }

  /**
   * Recent N days (most recent first). Auto-generates today's entry if
   * missing.
   */
  async getRecent(userId: string, limit: number = 7): Promise<PetDiaryRecord[]> {
    const safe = Math.max(1, Math.min(30, Math.floor(limit) || 7));
    // Ensure today exists
    await this.getEntry(userId);
    const rows = await this.diaryRepo.find({
      where: { userId },
      order: { dateKey: 'DESC' },
      take: safe,
    });
    return rows.map((r) => ({
      date: r.dateKey,
      emotion: r.emotion,
      intimacy_level: r.intimacyLevel,
      text_zh: r.textZh,
      text_en: r.textEn,
      generated_at: Number(r.generatedAt),
    }));
  }

  /**
   * Drop today's cache so that a regenerated diary picks up the new emotion.
   * Called by `LivingPetService` when emotion intensity changes ≥ 2 levels.
   */
  async invalidateToday(userId: string): Promise<void> {
    const today = dateKey(new Date());
    await this.diaryRepo.delete({ userId, dateKey: today });
  }

  /**
   * Cleanup helper: drop diary rows older than `keepDays` (default 90).
   * Used by a future cron; not wired yet.
   */
  async pruneOlderThan(keepDays: number = 90): Promise<number> {
    const cutoff = new Date(Date.now() - keepDays * 86_400_000);
    const cutoffKey = dateKey(cutoff);
    const r = await this.diaryRepo.delete({
      dateKey: LessThanOrEqual(cutoffKey),
    });
    return r.affected ?? 0;
  }
}
