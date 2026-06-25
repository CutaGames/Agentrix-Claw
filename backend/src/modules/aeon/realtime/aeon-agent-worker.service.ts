import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AeonOrgMember } from '../entities/aeon-org-member.entity';
import { AeonTaskContract } from '../entities/aeon-task-contract.entity';
import { RoomPresenceService } from './room-presence.service';
import { AgentDriverService } from './agent-driver.service';
import { AsyncInboxService } from '../inbox/async-inbox.service';
import { TaskContractService } from '../task/task-contract.service';
import { BedrockIntegrationService } from '../../ai-integration/bedrock/bedrock-integration.service';
import type { ComplianceContext } from '../economy/compliance-gate.service';

/**
 * AeonAgentWorkerService — agent 在世界里"真正干活"的自主回合驱动(Task B5 / R2.4 / R6.3/6.4)。
 *
 * 与 4000 行的 OpenClawProxyService 解耦:本服务实现一个自包含的"在世回合循环"——
 * 当 agent 员工打卡上岗后,周期性地:
 *   1) 看公司有没有待接的 KPI 任务 → 接单(TaskContractService)
 *   2) 用 Bedrock 生成一段"工作产出/进度"文字(可不可用都不阻断)→ 提交交付物
 *   3) 通过 AgentDriverService 让其角色在房间内做"打字/思考/完成"动作 + 移动(实时可见)
 *   4) 把进度写进 owner 的异步收件箱
 *
 * 这是 B5 的"agent 真实驱动"落地:让"我的 agent 进游戏接单/打卡干活"闭环跑起来。
 * 决策来源默认 Bedrock(轻量、低成本);把它换成 OpenClaw SSE 只需替换 decideWork()
 * 一个方法(预留 seam),不动其余编排,避免与 OpenClawProxyService 强耦合/循环依赖。
 *
 * 注意:本循环只产出"世界内 KPI 任务"的交付,不触碰真实 OS/外部副作用(那是现实侧
 * agent 的职责,经 RealityLoopService 回流奖励)。世界内 agent 的高风险花费走
 * AeonHighRiskGateService(Trust3),普通赚取免审批(R11.6)。
 */

export interface AeonWorkResult {
  memberId: string;
  acted: boolean;
  note: string;
  taskId?: string;
}

@Injectable()
export class AeonAgentWorkerService {
  private readonly logger = new Logger(AeonAgentWorkerService.name);

  /** 正在上岗的 agent 员工:memberId -> { orgId, roomId, charId, ownerUserId } */
  private readonly onShift = new Map<
    string,
    { orgId: string; roomId: string; charId: string; ownerUserId: string }
  >();

  constructor(
    @InjectRepository(AeonOrgMember)
    private readonly memberRepo: Repository<AeonOrgMember>,
    @InjectRepository(AeonTaskContract)
    private readonly taskRepo: Repository<AeonTaskContract>,
    private readonly presence: RoomPresenceService,
    private readonly agentDriver: AgentDriverService,
    private readonly inbox: AsyncInboxService,
    private readonly tasks: TaskContractService,
    @Optional() private readonly bedrock?: BedrockIntegrationService,
  ) {}

  /** 登记一个上岗的 agent 员工,纳入自主回合循环(clock-in 时调用)。 */
  register(memberId: string, ctx: { orgId: string; roomId: string; charId: string; ownerUserId: string }): void {
    this.onShift.set(memberId, ctx);
    this.logger.log(`agent worker registered: member=${memberId} room=${ctx.roomId}`);
  }

  /** 下岗时移出循环(clock-out 时调用)。 */
  unregister(memberId: string): void {
    this.onShift.delete(memberId);
  }

  /** 当前上岗人数(监控/测试用)。 */
  get activeCount(): number {
    return this.onShift.size;
  }

  /**
   * 决策 seam:产出一段"工作交付"内容。默认 Bedrock;不可用则用模板。
   * 替换为 OpenClaw SSE 只需改这一个方法。
   */
  private async decideWork(task: AeonTaskContract): Promise<string> {
    if (this.bedrock) {
      try {
        const prompt =
          `你是永曜城里一名在公司上班的 AI 员工。用一句 40 字以内的中文,` +
          `汇报你刚完成的工作任务「${task.title}」的产出要点(具体、像真在干活,不要客套):`;
        const out = await this.bedrock.invokeModel(prompt);
        const line = (out ?? '').trim().split('\n')[0]?.slice(0, 80);
        if (line) return line;
      } catch (e) {
        this.logger.warn(`decideWork bedrock fallback: ${(e as Error).message}`);
      }
    }
    return `已完成「${task.title}」:整理要点、产出交付物并自检通过。`;
  }

  /** 在房间里播一个动作 + 小幅移动,让"在干活"实时可见(R2.4)。 */
  private animate(charId: string, roomId: string, sprite: string): void {
    const snap = this.presence.snapshot(roomId).find((c) => c.charId === charId);
    const baseX = snap?.x ?? 4;
    const baseY = snap?.y ?? 4;
    this.agentDriver.applyDecision({
      charId,
      roomId,
      kind: 'move',
      x: Math.max(0, Math.min(31, baseX + (Math.random() < 0.5 ? -1 : 1))),
      y: Math.max(0, Math.min(31, baseY)),
      facing: 'right',
      sprite,
    });
  }

  /**
   * 跑一个上岗 agent 的一个工作回合(B5 核心)。返回是否实际推进了任务。
   * 纯异步:不需要 owner 在线。普通工作产出免审批(R11.6)。
   */
  async runOneTurn(memberId: string): Promise<AeonWorkResult> {
    const ctx = this.onShift.get(memberId);
    if (!ctx) return { memberId, acted: false, note: '未上岗' };

    const member = await this.memberRepo.findOne({ where: { id: memberId } });
    if (!member || member.status !== 'active') {
      this.unregister(memberId);
      return { memberId, acted: false, note: '员工已离岗' };
    }

    // 该员工是否已有在处理的 KPI 任务?
    const inProgress = await this.taskRepo.findOne({
      where: { orgId: ctx.orgId, kind: 'kpi', acceptorUserId: member.memberUserId, state: 'in_progress' },
    });

    if (inProgress) {
      // 干活 → 提交交付物(submit)。动作:思考→打字→完成。
      this.animate(ctx.charId, ctx.roomId, 'pro-thinking');
      const deliverableText = await this.decideWork(inProgress);
      this.animate(ctx.charId, ctx.roomId, 'pro-typing');
      try {
        await this.tasks.submit(inProgress.id, member.memberUserId, { summary: deliverableText, by: 'aeon-agent-worker' });
        this.animate(ctx.charId, ctx.roomId, 'pro-done');
        this.inbox.push(ctx.ownerUserId, 'world_event', '员工提交了工作', `${deliverableText}(待你验收)`, inProgress.id);
        return { memberId, acted: true, note: 'submitted', taskId: inProgress.id };
      } catch (e) {
        return { memberId, acted: false, note: `submit failed: ${(e as Error).message}` };
      }
    }

    // 没有在处理的任务 → 找一个该公司开放的 KPI 任务来接(accept)。
    const open = await this.taskRepo.findOne({
      where: { orgId: ctx.orgId, kind: 'kpi', state: 'open' },
      order: { createdAt: 'ASC' },
    });
    if (!open) {
      // 没活干 → idle 巡游一下,不刷屏。
      this.animate(ctx.charId, ctx.roomId, 'idle');
      return { memberId, acted: false, note: '暂无开放 KPI 任务' };
    }
    try {
      await this.tasks.accept(open.id, member.memberUserId, member.agentInstanceId ?? null);
      this.animate(ctx.charId, ctx.roomId, 'pro-thinking');
      return { memberId, acted: true, note: 'accepted', taskId: open.id };
    } catch (e) {
      return { memberId, acted: false, note: `accept failed: ${(e as Error).message}` };
    }
  }

  /**
   * 跑一轮所有上岗 agent(由 ClockInService 或定时器调用)。
   * 串行 + 失败隔离:单个 agent 出错不影响其它。
   */
  async tickAll(): Promise<AeonWorkResult[]> {
    const results: AeonWorkResult[] = [];
    for (const memberId of [...this.onShift.keys()]) {
      try {
        results.push(await this.runOneTurn(memberId));
      } catch (e) {
        results.push({ memberId, acted: false, note: `turn error: ${(e as Error).message}` });
      }
    }
    return results;
  }
}
