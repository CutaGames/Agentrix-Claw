import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { AxpService } from '../../axp/axp.service';
import { AEON_SYNC } from '../../../../../shared/types/aeon-sync';

/**
 * StageService — Aeon 舞台原语(现场活动/脱口秀)瞬时状态 + 打赏结算(Step 2 / R22 落地)。
 *
 * 设计沿用 RoomPresenceService 的"实时态放内存"理念:
 *   - 每个舞台房间维护 host / speakers / 举手队列 / 本场累计打赏。
 *   - 打赏走真实价值流转(R11):观众用户 AXP `spend('aeon_stage_tip')`,
 *     台上发言者用户 AXP `earn('aeon_stage_tip')`,两步在 AxpService 各自原子事务内完成。
 *     (跨用户转账无单一事务;先扣后加,扣失败则不加,符合"先校验余额再发生效果"。)
 *
 * 身份/权限:
 *   - 第一个进入舞台房间的真人自动成为 host(MVP 简化;Phase 后续可由活动主办方 Org 指派)。
 *   - 仅 host 可 invite/强制下台;observer 可举手、可打赏。
 *
 * 注意:本服务只管"谁在台上 + 打赏账"。角色 stageRole 字段的权威写入仍由
 * RoomPresenceService 持有的 snapshot 承载,网关在变更时同周期广播 char_upsert(R3.4)。
 */
@Injectable()
export class StageService {
  private readonly logger = new Logger(StageService.name);

  /** roomId -> host charId */
  private readonly hostByRoom = new Map<string, string>();
  /** roomId -> Set<speaker charId> */
  private readonly speakersByRoom = new Map<string, Set<string>>();
  /** roomId -> Set<raised-hand charId> */
  private readonly handsByRoom = new Map<string, Set<string>>();
  /** roomId -> (targetCharId -> 本场累计被打赏 AXP) */
  private readonly tipTotals = new Map<string, Map<string, number>>();

  constructor(private readonly axp: AxpService) {}

  /** 该 roomId 是否被当作舞台房间(约定:'aeon-live-' 前缀)。 */
  isStageRoom(roomId: string): boolean {
    return roomId.startsWith('aeon-live-');
  }

  /** 当前 host charId(无则 null)。 */
  hostOf(roomId: string): string | null {
    return this.hostByRoom.get(roomId) ?? null;
  }

  isHost(roomId: string, charId: string): boolean {
    return this.hostByRoom.get(roomId) === charId;
  }

  isSpeaker(roomId: string, charId: string): boolean {
    return this.speakersByRoom.get(roomId)?.has(charId) ?? false;
  }

  /** 进场时确定角色:无 host 则本人成为 host,否则为 audience。返回分配的角色。 */
  onEnter(roomId: string, charId: string): 'host' | 'audience' {
    if (!this.hostByRoom.has(roomId)) {
      this.hostByRoom.set(roomId, charId);
      return 'host';
    }
    return 'audience';
  }

  /** 离场清理:host 走了则把舞台 host 让给任意一名 speaker(否则置空)。返回受影响需重广播的 charId。 */
  onLeave(roomId: string, charId: string): { newHost?: string } {
    this.speakersByRoom.get(roomId)?.delete(charId);
    this.handsByRoom.get(roomId)?.delete(charId);
    if (this.hostByRoom.get(roomId) === charId) {
      this.hostByRoom.delete(roomId);
      const speakers = this.speakersByRoom.get(roomId);
      const next = speakers && speakers.size > 0 ? Array.from(speakers)[0] : undefined;
      if (next) {
        this.speakersByRoom.get(roomId)?.delete(next);
        this.hostByRoom.set(roomId, next);
        return { newHost: next };
      }
    }
    // 房间空了则清账
    return {};
  }

  /** 观众举手。返回 false 表示已是台上(host/speaker)无需举手。 */
  raiseHand(roomId: string, charId: string): boolean {
    if (this.isHost(roomId, charId) || this.isSpeaker(roomId, charId)) return false;
    let hands = this.handsByRoom.get(roomId);
    if (!hands) {
      hands = new Set();
      this.handsByRoom.set(roomId, hands);
    }
    hands.add(charId);
    return true;
  }

  /** host 批准某观众上台。校验:操作者是 host、目标在举手队列或在场、未超员。 */
  invite(roomId: string, hostCharId: string, targetCharId: string): void {
    if (!this.isHost(roomId, hostCharId)) {
      throw new BadRequestException('仅主持人可邀请上台');
    }
    if (this.isSpeaker(roomId, targetCharId) || this.isHost(roomId, targetCharId)) return;
    let speakers = this.speakersByRoom.get(roomId);
    if (!speakers) {
      speakers = new Set();
      this.speakersByRoom.set(roomId, speakers);
    }
    if (speakers.size >= AEON_SYNC.STAGE_MAX_SPEAKERS) {
      throw new BadRequestException(`台上发言者已满(${AEON_SYNC.STAGE_MAX_SPEAKERS})`);
    }
    speakers.add(targetCharId);
    this.handsByRoom.get(roomId)?.delete(targetCharId);
  }

  /** speaker 下台(自己),或 host 请某 speaker 下台。 */
  leaveStage(roomId: string, actorCharId: string, targetCharId: string | undefined): string {
    const target = targetCharId ?? actorCharId;
    if (target !== actorCharId && !this.isHost(roomId, actorCharId)) {
      throw new BadRequestException('仅主持人可请他人下台');
    }
    this.speakersByRoom.get(roomId)?.delete(target);
    return target;
  }

  /** 本场某 speaker 累计被打赏。 */
  tipTotal(roomId: string, targetCharId: string): number {
    return this.tipTotals.get(roomId)?.get(targetCharId) ?? 0;
  }

  /**
   * 打赏结算(R11 真实价值流转)。先从打赏者用户 AXP 扣款,成功后给发言者用户入账。
   * 两步分别原子;扣款失败(余额不足)直接抛错,不入账。返回累计被打赏额。
   *
   * @param fromUserId 打赏者用户 id(网关从鉴权 socket.userId 取,不信客户端)
   * @param toUserId   发言者用户 id(从在场快照 ownerUserId 取)
   */
  async settleTip(params: {
    roomId: string;
    fromUserId: string;
    toUserId: string;
    targetCharId: string;
    amount: number;
    refId: string;
  }): Promise<number> {
    const { roomId, fromUserId, toUserId, targetCharId, amount, refId } = params;
    if (!Number.isInteger(amount) || amount < AEON_SYNC.STAGE_TIP_MIN || amount > AEON_SYNC.STAGE_TIP_MAX) {
      throw new BadRequestException(`打赏额需为 ${AEON_SYNC.STAGE_TIP_MIN}~${AEON_SYNC.STAGE_TIP_MAX} 的整数 AXP`);
    }
    if (fromUserId === toUserId) {
      throw new BadRequestException('不能给自己打赏');
    }

    // 1) 扣打赏者(余额不足由 AxpService 抛 BadRequest)。
    await this.axp.spend({
      userId: fromUserId,
      source: 'aeon_stage_tip',
      amount,
      refId,
      note: '永曜城现场打赏',
      metadata: { roomId, targetCharId },
    });
    // 2) 入账发言者。若此步异常,打赏者已扣 —— 记录补偿日志(MVP 容忍极端情况,实际 earn 几乎不失败)。
    try {
      await this.axp.earn({
        userId: toUserId,
        source: 'aeon_stage_tip',
        amount,
        refId,
        note: '现场打赏收入',
        metadata: { roomId, fromUserId },
      });
    } catch (e: any) {
      this.logger.error(`stage tip earn failed after spend (refId=${refId}): ${e?.message}`);
      throw new BadRequestException('打赏入账失败,请稍后重试');
    }

    const room = this.tipTotals.get(roomId) ?? new Map<string, number>();
    const total = (room.get(targetCharId) ?? 0) + amount;
    room.set(targetCharId, total);
    this.tipTotals.set(roomId, room);
    return total;
  }
}
