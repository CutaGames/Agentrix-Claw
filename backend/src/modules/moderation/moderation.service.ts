import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ModerationLog } from '../../entities/moderation-log.entity';

export type ModerationKind = 'prompt' | 'image' | 'glb' | 'vrm' | 'rive';
export type ModerationDecision = 'allow' | 'deny' | 'review';

export interface ModerationResult {
  decision: ModerationDecision;
  score: number;
  reason: string | null;
}

/**
 * Phase 2 W1 关键词 stopword（最小集，覆盖通用 NSFW 与暴力）。
 * 100 词测试集（BE-T2.6）将在 Phase 2 W2 落地为 fixture，本骨架先列示意。
 */
const NSFW_KEYWORDS_LOWER = [
  'porn', 'pornographic', 'nude', 'naked', 'nsfw',
  'sex', 'sexual', 'rape', 'incest', 'fetish',
  'loli', 'shota', 'pedophil',
  'gore', 'snuff', 'beheading', 'self_harm',
  'kill yourself', 'suicide method',
];

/**
 * ModerationService — Phase 2 W1 内容审核（骨架）
 *
 * BE-T2.6 / 2.7 入口。
 *
 * 当前实现：
 *  - prompt：关键词命中 → deny
 *  - image：占位（返回 'allow' + reason='not_implemented'，待 W2 接 CLIP 服务）
 *  - 所有调用都落 ModerationLog
 *
 * Phase 2 W2 接入：
 *  - CLIP / Replicate NSFW classifier
 *  - DMCA hash 库（perceptual hash）
 *  - 误判申诉队列
 */
@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(ModerationLog)
    private readonly logRepo: Repository<ModerationLog>,
  ) {}

  static sha256(input: string | Buffer): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  /** 关键词审核 — 同步、纯函数；测试用例直接调用此静态版本 */
  static checkPromptSync(prompt: string): ModerationResult {
    const text = (prompt || '').toLowerCase();
    for (const kw of NSFW_KEYWORDS_LOWER) {
      if (text.includes(kw)) {
        return { decision: 'deny', score: 1.0, reason: 'nsfw_keyword' };
      }
    }
    return { decision: 'allow', score: 0, reason: null };
  }

  async checkPrompt(opts: {
    userId: string | null;
    prompt: string;
    refId?: string | null;
  }): Promise<ModerationResult> {
    const result = ModerationService.checkPromptSync(opts.prompt);
    await this.log({
      userId: opts.userId,
      kind: 'prompt',
      decision: result.decision,
      score: result.score,
      reason: result.reason,
      inputHash: ModerationService.sha256(opts.prompt || ''),
      refId: opts.refId ?? null,
    });
    return result;
  }

  /**
   * Phase 2 W1：image 审核占位。返回 'allow' + reason 'not_implemented'。
   * Phase 2 W2：替换为 CLIP NSFW 分类器（Replicate / 自托管）。
   */
  async checkImage(opts: {
    userId: string | null;
    imageBuffer?: Buffer;
    imageHash?: string;
    refId?: string | null;
  }): Promise<ModerationResult> {
    const hash = opts.imageHash || (opts.imageBuffer ? ModerationService.sha256(opts.imageBuffer) : null);
    const result: ModerationResult = { decision: 'allow', score: 0, reason: 'not_implemented' };
    await this.log({
      userId: opts.userId,
      kind: 'image',
      decision: result.decision,
      score: result.score,
      reason: result.reason,
      inputHash: hash,
      refId: opts.refId ?? null,
    });
    return result;
  }

  private async log(row: {
    userId: string | null;
    kind: ModerationKind;
    decision: ModerationDecision;
    score: number;
    reason: string | null;
    inputHash: string | null;
    refId: string | null;
    detail?: Record<string, unknown>;
  }) {
    await this.logRepo.save(
      this.logRepo.create({
        userId: row.userId,
        kind: row.kind,
        decision: row.decision,
        score: row.score.toFixed(3) as any,
        reason: row.reason,
        inputHash: row.inputHash,
        refId: row.refId,
        detail: row.detail ?? {},
      }),
    );
  }
}
