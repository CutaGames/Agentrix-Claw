import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AeonOrgMember } from '../entities/aeon-org-member.entity';
import { AeonOrg } from '../entities/aeon-org.entity';
import { AeonTaskContract } from '../entities/aeon-task-contract.entity';
import { RoomPresenceService } from '../realtime/room-presence.service';
import { AgentDriverService } from '../realtime/agent-driver.service';
import { AeonAgentWorkerService } from '../realtime/aeon-agent-worker.service';
import { OrgService } from './org.service';
import { identityFromControl, type AeonCharacterSnapshot } from '../../../../../shared/types/aeon-sync';
import type { ComplianceContext } from '../economy/compliance-gate.service';

/**
 * ClockInService — agent 员工打卡 + 产出计量(Task 3.5 / R6.3/6.4/6.5)。
 *
 * 打卡:把 agent 员工以 agent 控制态置入公司房间,在排定时段自主执行其工位 KPI 任务
 * (任务由 TaskContractService 管理,执行决策来源是 OpenClaw SSE — 在 wiring 接入)。
 * 产出计量:统计该 agent 完成/验收的 KPI 任务数;周期结束验收通过触发发薪(经 OrgService)。
 */
@Injectable()
export class ClockInService {
  private readonly logger = new Logger(ClockInService.name);

  constructor(
    @InjectRepository(AeonOrgMember)
    private readonly memberRepo: Repository<AeonOrgMember>,
    @InjectRepository(AeonOrg)
    private readonly orgRepo: Repository<AeonOrg>,
    @InjectRepository(AeonTaskContract)
    private readonly taskRepo: Repository<AeonTaskContract>,
    private readonly presence: RoomPresenceService,
    private readonly agentDriver: AgentDriverService,
    private readonly worker: AeonAgentWorkerService,
    private readonly orgs: OrgService,
  ) {}

  /**
   * 打卡上岗(R6.3):把 agent 员工以 agent 态置入公司房间。
   * 真实自主执行(OpenClaw 决策 → AgentDriverService.applyDecision)在 wiring 接入;
   * 这里建立在场态 + agent 身份,使其"在岗可见"。
   */
  async clockIn(orgId: string, memberId: string): Promise<{ ok: boolean; roomId: string | null }> {
    const member = await this.memberRepo.findOne({ where: { id: memberId, orgId } });
    if (!member) throw new NotFoundException('员工不存在');
    if (member.role !== 'agent_employee' || member.status !== 'active') {
      return { ok: false, roomId: null };
    }
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org?.roomId) return { ok: false, roomId: null };

    const identity = identityFromControl('agent');
    const snap: AeonCharacterSnapshot = {
      charId: member.agentInstanceId ?? member.id,
      ownerUserId: member.memberUserId,
      controlState: 'agent',
      isAgentDriven: identity.isAgentDriven,
      badge: identity.badge,
      clan: 'A',
      x: 4,
      y: 4,
      facing: 'right',
      sprite: 'pro-typing',
      displayName: '员工',
    };
    this.presence.upsert(org.roomId, snap);
    this.agentDriver.applyDecision({
      charId: snap.charId,
      roomId: org.roomId,
      kind: 'move',
      x: snap.x,
      y: snap.y,
      facing: 'right',
      sprite: 'pro-typing',
    });
    // B5:登记进自主回合循环,并立刻跑一回合(接单/干活),让"在岗 = 真在干活"。
    this.worker.register(memberId, {
      orgId,
      roomId: org.roomId,
      charId: snap.charId,
      ownerUserId: member.memberUserId,
    });
    void this.worker.runOneTurn(memberId).catch(() => {});
    this.logger.log(`clock-in: member=${memberId} org=${orgId} room=${org.roomId}`);
    return { ok: true, roomId: org.roomId };
  }

  /** 下岗:移除在场态。 */
  async clockOut(orgId: string, memberId: string): Promise<void> {
    const member = await this.memberRepo.findOne({ where: { id: memberId, orgId } });
    if (!member) return;
    this.worker.unregister(memberId);
    this.presence.remove(member.agentInstanceId ?? member.id);
  }

  /** 产出计量(R6.4):统计该员工承接并验收完成的 KPI 任务数。 */
  async measureOutput(orgId: string, memberId: string): Promise<{ attempted: number; completed: number }> {
    const member = await this.memberRepo.findOne({ where: { id: memberId, orgId } });
    if (!member) return { attempted: 0, completed: 0 };
    const acceptorId = member.memberUserId;
    const attempted = await this.taskRepo.count({
      where: { orgId, kind: 'kpi', acceptorUserId: acceptorId },
    });
    const completed = await this.taskRepo.count({
      where: { orgId, kind: 'kpi', acceptorUserId: acceptorId, state: 'completed' },
    });
    return { attempted, completed };
  }

  /** 周期结算(R6.5):产出达标则发薪(委托 OrgService,账本不足会自动停止+通知)。 */
  async settlePeriod(
    orgId: string,
    ownerUserId: string,
    memberId: string,
    compliance: ComplianceContext,
  ): Promise<{ paid: number; output: { attempted: number; completed: number } }> {
    const output = await this.measureOutput(orgId, memberId);
    let paid = 0;
    if (output.completed > 0) {
      const res = await this.orgs.payWage(orgId, ownerUserId, memberId, compliance);
      paid = res.paid;
    }
    return { paid, output };
  }
}
