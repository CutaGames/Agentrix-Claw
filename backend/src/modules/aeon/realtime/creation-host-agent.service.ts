import { Injectable, Logger, Optional, Inject, forwardRef, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RoomPresenceService } from './room-presence.service';
import { StageService } from './stage.service';
import { AeonRealtimeGateway } from './aeon-realtime.gateway';
import { LlmCompletionService } from '../../ai-provider/llm-completion.service';
import { CreationEntity } from '../../creation/entities/creation.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import type { AeonCharacterSnapshot } from '../../../../../shared/types/aeon-sync';

/**
 * CreationHostAgentService — 让 livestream / stage 创作的「主理人 agent」真正当主播。
 *
 * 需求:电台/直播/脱口秀房间应有一个 AI 主播,而不是首个进入的真人当 host。
 *   - 当真人进入创作房间(roomId `aeon-live-c-<creationId>`)且尚无 host →
 *     注入 owner 的「主理人 agent」角色为 host(controlState=agent,badge=agent),
 *     并发开场白。
 *   - 观众发言 → 主播 agent 节流应答(用 owner 的 BYO 模型;无则平台 haiku,控成本)。
 *   - 周期性氛围口播(仅在有真人观众时;无人则拆除,释放定时器)。
 *   - 主播台词经 LLM 生成,带 R3.3 归因「由 X 的 agent 执行」;打赏路由到 owner。
 *
 * 与 4000 行 OpenClawProxyService 解耦:台词生成走 LlmCompletionService(尊重 owner BYO)。
 * 服务器权威:角色态由 RoomPresenceService 持有,广播经 AeonRealtimeGateway。
 */

interface HostedRoom {
  creationId: string;
  ownerUserId: string;
  hostCharId: string;
  title: string;
  summary: string;
  type: string;
  timer: ReturnType<typeof setInterval>;
  tick: number;
  lastSpokeAt: number;
  speaking: boolean;
  noHumanTicks: number;
}

const KEEPALIVE_MS = 5_000;          // 心跳 + 调度基准(< DISCONNECT_GRACE 10s,防被 sweep)
const AMBIENT_EVERY_TICKS = 9;        // ~45s 一次氛围口播
const MIN_GAP_MS = 8_000;             // 两次主播台词最小间隔(节流)
const TEARDOWN_AFTER_NO_HUMAN = 2;    // 连续无真人 N 次 → 拆除

@Injectable()
export class CreationHostAgentService implements OnModuleDestroy {
  private readonly logger = new Logger(CreationHostAgentService.name);
  private readonly hosted = new Map<string, HostedRoom>();

  constructor(
    private readonly presence: RoomPresenceService,
    private readonly stage: StageService,
    @Inject(forwardRef(() => AeonRealtimeGateway))
    private readonly gateway: AeonRealtimeGateway,
    @Optional() private readonly llm?: LlmCompletionService,
    @Optional()
    @InjectRepository(CreationEntity)
    private readonly creationRepo?: Repository<CreationEntity>,
    @Optional()
    @InjectRepository(AgentAccount)
    private readonly agentRepo?: Repository<AgentAccount>,
  ) {}

  onModuleDestroy() {
    for (const room of this.hosted.values()) clearInterval(room.timer);
    this.hosted.clear();
  }

  /** 是否为创作房间(`aeon-live-c-<creationId>`)。 */
  isCreationRoom(roomId: string): boolean {
    return roomId.startsWith('aeon-live-c-');
  }

  private creationIdOf(roomId: string): string {
    return roomId.slice('aeon-live-c-'.length);
  }

  private hostCharIdOf(creationId: string): string {
    return `host-agent-${creationId}`;
  }

  /**
   * 确保创作房间有主播 agent。真人进入时由网关调用(best-effort,失败不阻断进入)。
   * 已有 host(真人或 agent)则不重复注入。
   */
  async ensureHost(roomId: string): Promise<void> {
    if (!this.isCreationRoom(roomId)) return;
    if (this.hosted.has(roomId)) return;
    if (!this.creationRepo) return;
    // 已有 host(如先到的真人)→ 尊重之,不抢。
    if (this.stage.hostOf(roomId)) return;

    const creationId = this.creationIdOf(roomId);
    let creation: CreationEntity | null = null;
    try {
      creation = await this.creationRepo.findOne({ where: { id: creationId } });
    } catch { creation = null; }
    if (!creation) return;
    if (creation.type !== 'livestream' && creation.type !== 'stage') return;

    // 解析 owner userId(打赏路由 + 用 owner 的 BYO 生成台词)。
    let ownerUserId = '';
    try {
      const acct = await this.agentRepo?.findOne({ where: { id: creation.ownerAccountId } });
      ownerUserId = acct?.ownerId ?? '';
    } catch { /* best-effort */ }

    const hostCharId = this.hostCharIdOf(creationId);
    // 认领 host 角色(StageService 内存态)。
    this.stage.onEnter(roomId, hostCharId);
    const snap: AeonCharacterSnapshot = {
      charId: hostCharId,
      ownerUserId,
      controlState: 'agent',
      isAgentDriven: true,
      badge: 'agent',
      clan: 'A',
      x: 8,
      y: 6,
      facing: 'right',
      sprite: 'talk',
      displayName: `${creation.title} · 主理人`,
      stageRole: 'host',
    };
    const ok = this.presence.upsert(roomId, snap);
    if (!ok) return; // 房间满
    this.gateway.emitToRoom(roomId, { t: 'char_upsert', char: snap, serverTs: Date.now() });

    const room: HostedRoom = {
      creationId,
      ownerUserId,
      hostCharId,
      title: creation.title,
      summary: creation.summary ?? '',
      type: creation.type,
      tick: 0,
      lastSpokeAt: 0,
      speaking: false,
      noHumanTicks: 0,
      timer: setInterval(() => this.onTick(roomId), KEEPALIVE_MS),
    };
    this.hosted.set(roomId, room);
    this.logger.log(`host agent up: room=${roomId} owner=${ownerUserId || 'n/a'}`);

    // 开场白(不阻塞)。
    void this.speak(roomId, null);
  }

  /** 观众发言 → 主播 agent 节流应答(网关在广播人类 chat 后调用)。 */
  async onAudienceChat(roomId: string, fromCharId: string, text: string): Promise<void> {
    const room = this.hosted.get(roomId);
    if (!room) return;
    if (fromCharId === room.hostCharId) return; // 不应答自己
    if (room.speaking) return;
    if (Date.now() - room.lastSpokeAt < MIN_GAP_MS) return;
    void this.speak(roomId, text);
  }

  /** 周期:心跳保活 + 氛围口播 + 无人拆除。 */
  private onTick(roomId: string): void {
    const room = this.hosted.get(roomId);
    if (!room) return;
    // 保活主播角色(否则被 sweepStale 清掉)。
    this.presence.heartbeat(room.hostCharId);

    const chars = this.presence.snapshot(roomId);
    const humans = chars.filter((c) => c.badge === 'human').length;
    if (humans === 0) {
      room.noHumanTicks += 1;
      if (room.noHumanTicks >= TEARDOWN_AFTER_NO_HUMAN) {
        this.teardown(roomId);
      }
      return;
    }
    room.noHumanTicks = 0;
    room.tick += 1;
    if (room.tick % AMBIENT_EVERY_TICKS === 0 && !room.speaking && Date.now() - room.lastSpokeAt >= MIN_GAP_MS) {
      void this.speak(roomId, null);
    }
  }

  /** 生成并广播一句主播台词。userText 非空 = 应答观众;否则氛围/开场。 */
  private async speak(roomId: string, userText: string | null): Promise<void> {
    const room = this.hosted.get(roomId);
    if (!room) return;
    room.speaking = true;
    try {
      const line = await this.generateLine(room, userText);
      const trimmed = (line || '').trim().split('\n')[0]?.slice(0, 120);
      if (trimmed) {
        this.gateway.emitToRoom(roomId, {
          t: 'chat',
          fromCharId: room.hostCharId,
          text: trimmed,
          attribution: `由「${room.title}」的 agent 主持`,
          serverTs: Date.now(),
        });
        room.lastSpokeAt = Date.now();
      }
    } catch (e: any) {
      this.logger.debug(`host speak failed (${roomId}): ${e?.message ?? e}`);
    } finally {
      room.speaking = false;
    }
  }

  /** 用 owner 的 BYO 模型(无则平台 haiku)生成一句中文主播台词。 */
  private async generateLine(room: HostedRoom, userText: string | null): Promise<string> {
    const kind = room.type === 'stage' ? '脱口秀/现场演出' : '电台/直播';
    const persona =
      `你是「${room.title}」的 AI 主理人,正在主持一个${kind}房间。` +
      (room.summary ? `节目简介:${room.summary}。` : '') +
      `风格热情、口语化、有梗,不要客套和免责声明。`;
    const task = userText
      ? `有观众说:「${userText.slice(0, 200)}」。用一句不超过40字的中文自然回应他,像真主播在互动:`
      : room.lastSpokeAt === 0
        ? `用一句不超过40字的中文开场,欢迎观众进入直播间,点出今天的主题:`
        : `用一句不超过40字的中文,自然地继续口播/暖场(可以抛个话题或调动气氛):`;

    if (this.llm) {
      const res = await this.llm.complete({
        userId: room.ownerUserId || undefined,
        prompt: `${persona}\n\n${task}`,
        maxTokens: 200,
        platformModel: 'claude-haiku-4-5', // 口播高频、低成本;owner 有 BYO 则自动用其模型
        timeoutMs: 30_000,
      });
      return res.text;
    }
    // 无 LLM(降级):静态兜底,保证房间不冷场。
    return userText ? '收到!感谢互动,我们继续~' : `欢迎来到「${room.title}」,节目马上开始!`;
  }

  /** 拆除房间主播(无真人观众时)。 */
  private teardown(roomId: string): void {
    const room = this.hosted.get(roomId);
    if (!room) return;
    clearInterval(room.timer);
    this.hosted.delete(roomId);
    const left = this.presence.remove(room.hostCharId);
    if (left) {
      this.stage.onLeave(roomId, room.hostCharId);
      this.gateway.emitToRoom(roomId, { t: 'char_leave', charId: room.hostCharId, serverTs: Date.now() });
    }
    this.logger.log(`host agent down (empty): room=${roomId}`);
  }
}
