import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LivingPet } from '../../entities/living-pet.entity';
import { desktopSyncEventBus, DESKTOP_SYNC_EVENT } from '../desktop-sync/desktop-sync.events';

/**
 * 顿领 §3.4 主宠 6 表情状态机契约
 *
 * 6 基础表情衰减规则（§3.4.1）：
 *   happy     30 min
 *   focused   任务结束后 15 min
 *   concerned 心率回落 / 风险解除（默认 10 min）
 *   tired     建议休息 + 1h 冷却
 *   excited   10 min
 *   calm      默认态（永不衰减）
 */
const EMOTION_DECAY_MS: Record<string, number> = {
  happy: 30 * 60 * 1000,
  focused: 15 * 60 * 1000,
  concerned: 10 * 60 * 1000,
  tired: 60 * 60 * 1000,
  excited: 10 * 60 * 1000,
  calm: 0,
  love: 60 * 60 * 1000,
  sad: 30 * 60 * 1000,
  angry: 15 * 60 * 1000,
  sleepy: 8 * 60 * 60 * 1000,
};

export type PetEmotion =
  | 'happy'
  | 'focused'
  | 'concerned'
  | 'tired'
  | 'excited'
  | 'calm'
  | 'love'
  | 'sad'
  | 'angry'
  | 'sleepy';

export interface SetEmotionInput {
  emotion: PetEmotion;
  intensity?: 0 | 1 | 2 | 3;
  /** 主宠首次创建时可指定 primary agent */
  primaryAgentId?: string;
}

@Injectable()
export class LivingPetService {
  private readonly logger = new Logger(LivingPetService.name);

  constructor(
    @InjectRepository(LivingPet)
    private readonly petRepo: Repository<LivingPet>,
  ) {}

  /** 获取或自动创建（1 user = 1 主宠） */
  async getOrCreate(userId: string, primaryAgentId?: string): Promise<LivingPet> {
    let pet = await this.petRepo.findOne({ where: { userId } });
    if (!pet) {
      const now = Date.now();
      pet = this.petRepo.create({
        userId,
        name: 'Aira',
        species: 'aira',
        emotion: 'calm',
        emotionIntensity: 0,
        emotionSince: String(now),
        emotionDecayAt: String(0),
        intimacyLevel: 0,
        intimacyXp: 0,
        recentMemorySnippets: [],
        primaryAgentId,
        engineSwitching: false,
      });
      pet = await this.petRepo.save(pet);
      this.logger.log(`LivingPet created for user ${userId} (pet=${pet.id})`);
      this.broadcast(pet);
    }
    return pet;
  }

  async getState(userId: string): Promise<LivingPet> {
    const pet = await this.petRepo.findOne({ where: { userId } });
    if (!pet) throw new NotFoundException('living-pet not found; call getOrCreate');
    // 自动衰减（懒计算）
    return this.maybeDecay(pet);
  }

  /** 设置情绪（带衰减时间） */
  async setEmotion(userId: string, input: SetEmotionInput): Promise<LivingPet> {
    const pet = await this.getOrCreate(userId, input.primaryAgentId);
    const now = Date.now();
    pet.emotion = input.emotion;
    pet.emotionIntensity = input.intensity ?? 1;
    pet.emotionSince = String(now);
    const decayMs = EMOTION_DECAY_MS[input.emotion] ?? 0;
    pet.emotionDecayAt = String(decayMs > 0 ? now + decayMs : 0);
    pet.lastInteractionAt = String(now);
    const saved = await this.petRepo.save(pet);
    this.broadcast(saved);
    return saved;
  }

  /** 增加亲密度 xp（每 lv 指数增长） */
  async addIntimacyXp(userId: string, xp: number): Promise<LivingPet> {
    const pet = await this.getOrCreate(userId);
    pet.intimacyXp = Math.max(0, pet.intimacyXp + xp);
    // lv 公式：lv n 需要 100 * 2^n xp
    let lv = 0;
    let need = 100;
    let pool = pet.intimacyXp;
    while (lv < 10 && pool >= need) {
      pool -= need;
      lv += 1;
      need = 100 * Math.pow(2, lv);
    }
    pet.intimacyLevel = lv;
    pet.lastInteractionAt = String(Date.now());
    const saved = await this.petRepo.save(pet);
    this.broadcast(saved);
    return saved;
  }

  /** §3.8 切换驱动引擎：保留情绪/亲密度/记忆，仅打开换装动画窗口 */
  async switchPrimaryAgent(userId: string, newAgentId: string): Promise<LivingPet> {
    const pet = await this.getOrCreate(userId);
    if (pet.primaryAgentId === newAgentId) return pet;
    pet.primaryAgentId = newAgentId;
    pet.engineSwitching = true;
    const saved = await this.petRepo.save(pet);
    this.broadcast(saved);
    // 2s 后关闭换装窗口
    setTimeout(async () => {
      try {
        const fresh = await this.petRepo.findOne({ where: { userId } });
        if (fresh && fresh.engineSwitching) {
          fresh.engineSwitching = false;
          const reset = await this.petRepo.save(fresh);
          this.broadcast(reset);
        }
      } catch (err) {
        this.logger.warn(`switchPrimaryAgent reset failed: ${(err as Error).message}`);
      }
    }, 2000);
    return saved;
  }

  /** 主动追加最近记忆片段（最多保留 5 条） */
  async pushMemorySnippet(userId: string, snippet: string): Promise<LivingPet> {
    const pet = await this.getOrCreate(userId);
    const list = Array.isArray(pet.recentMemorySnippets) ? pet.recentMemorySnippets : [];
    list.unshift(snippet);
    pet.recentMemorySnippets = list.slice(0, 5);
    return this.petRepo.save(pet);
  }

  // -------------------- internals --------------------

  private async maybeDecay(pet: LivingPet): Promise<LivingPet> {
    const decayAt = Number(pet.emotionDecayAt || 0);
    if (decayAt > 0 && Date.now() >= decayAt && pet.emotion !== 'calm') {
      pet.emotion = 'calm';
      pet.emotionIntensity = 0;
      pet.emotionSince = String(Date.now());
      pet.emotionDecayAt = String(0);
      const saved = await this.petRepo.save(pet);
      this.broadcast(saved);
      return saved;
    }
    return pet;
  }

  /** 走 desktopSyncEventBus 由 PresenceGateway 转发到 user:{userId} 房间 */
  private broadcast(pet: LivingPet) {
    desktopSyncEventBus.emit(DESKTOP_SYNC_EVENT, {
      userId: pet.userId,
      event: 'presence:pet.state',
      payload: this.toDto(pet),
    });
  }

  toDto(pet: LivingPet) {
    return {
      pet_id: pet.id,
      user_id: pet.userId,
      emotion: pet.emotion,
      emotion_intensity: pet.emotionIntensity,
      emotion_since: Number(pet.emotionSince || 0),
      emotion_decay_at: Number(pet.emotionDecayAt || 0),
      intimacy_level: pet.intimacyLevel,
      intimacy_xp: pet.intimacyXp,
      recent_memory_snippets: pet.recentMemorySnippets || [],
      primary_agent_id: pet.primaryAgentId || null,
      engine_switching: pet.engineSwitching,
      updated_at: pet.updatedAt ? pet.updatedAt.getTime() : Date.now(),
    };
  }
}
