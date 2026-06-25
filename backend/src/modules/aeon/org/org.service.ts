import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AeonOrg } from '../entities/aeon-org.entity';
import { AeonOrgMember } from '../entities/aeon-org-member.entity';
import { AeonRoom } from '../entities/aeon-room.entity';
import { AeonEconomyService } from '../economy/aeon-economy.service';
import { AsyncInboxService } from '../inbox/async-inbox.service';
import { EpochService } from '../epoch/epoch.service';
import { WorldNewsService } from '../news/world-news.service';
import { RealityLoopService } from '../reality/reality-loop.service';
import type { ComplianceContext } from '../economy/compliance-gate.service';
import { AEON_ACTIVE_EPOCH } from '../../../../../shared/types/aeon-world';

/** agent 员工上限默认值(对齐 workspace FREE=3;Phase 4 接套餐动态化)。 */
const DEFAULT_MAX_AGENT_EMPLOYEES = 3;

/**
 * OrgService — 组织/虚拟公司 + 招聘发薪(Task 3.4 / 3.7 / R6 / R8)。
 *
 * 公司 = 长期 Org(公司房间 + AXP 账本 + agent 员工名册 + 对外门面)。
 * 招聘 = 给 Org 加 agent_employee 成员(可来自其他用户)。发薪经 AeonEconomyService。
 */
@Injectable()
export class OrgService {
  private readonly logger = new Logger(OrgService.name);

  constructor(
    @InjectRepository(AeonOrg)
    private readonly orgRepo: Repository<AeonOrg>,
    @InjectRepository(AeonOrgMember)
    private readonly memberRepo: Repository<AeonOrgMember>,
    @InjectRepository(AeonRoom)
    private readonly roomRepo: Repository<AeonRoom>,
    private readonly economy: AeonEconomyService,
    private readonly inbox: AsyncInboxService,
    private readonly epoch: EpochService,
    private readonly news: WorldNewsService,
    private readonly reality: RealityLoopService,
  ) {}

  /** 创建虚拟公司(R6.1):Org + 公司房间 + 账本(分录) + owner 成员。 */
  async createCompany(
    ownerUserId: string,
    input: { name: string; plotId: string; epoch?: string },
  ): Promise<AeonOrg> {
    const epoch = input.epoch ?? AEON_ACTIVE_EPOCH;
    this.epoch.assertEnterable(epoch as any);

    const org = await this.orgRepo.save(
      this.orgRepo.create({
        ownerUserId,
        name: input.name,
        kind: 'company',
        epoch,
        axpLedgerBalance: '0',
      }),
    );

    // 公司房间
    const room = await this.roomRepo.save(
      this.roomRepo.create({
        plotId: input.plotId,
        orgId: org.id,
        epoch,
        kind: 'company',
        capacity: 20,
        displayName: `${input.name} · 办公室`,
        config: { primitives: ['workstation', 'task_intake'] },
      }),
    );
    org.roomId = room.id;
    await this.orgRepo.save(org);

    // owner 成员
    await this.memberRepo.save(
      this.memberRepo.create({
        orgId: org.id,
        memberUserId: ownerUserId,
        role: 'owner',
        status: 'active',
      }),
    );
    this.logger.log(`Company created: ${org.id} "${input.name}" by ${ownerUserId}`);
    this.news.publish('company_founded', `「${input.name}」在永曜城开业了 🏢`, { epoch: epoch as any, refId: org.id });
    return org;
  }

  /** owner 注资公司账本。 */
  async fund(orgId: string, ownerUserId: string, amount: number): Promise<{ balance: number }> {
    const org = await this.getOwned(orgId, ownerUserId);
    await this.economy.fundOrg(org.id, ownerUserId, amount, 'AXP');
    return { balance: await this.economy.orgBalance(org.id, 'AXP') };
  }

  /** 分配 agent 员工到工位(R6.2);校验 agent 员工上限。 */
  async assignAgentEmployee(
    orgId: string,
    ownerUserId: string,
    input: {
      memberUserId: string;
      agentInstanceId: string;
      wageAxpPerPeriod?: number;
      schedule?: Record<string, unknown>;
    },
  ): Promise<AeonOrgMember> {
    await this.getOwned(orgId, ownerUserId);
    const agentCount = await this.memberRepo.count({
      where: { orgId, role: 'agent_employee', status: 'active' },
    });
    if (agentCount >= DEFAULT_MAX_AGENT_EMPLOYEES) {
      throw new BadRequestException(`agent 员工已达上限(${DEFAULT_MAX_AGENT_EMPLOYEES});升级套餐可扩容`);
    }
    const member = await this.memberRepo.save(
      this.memberRepo.create({
        orgId,
        memberUserId: input.memberUserId,
        agentInstanceId: input.agentInstanceId,
        role: 'agent_employee',
        wageAxpPerPeriod: input.wageAxpPerPeriod ?? 0,
        schedule: input.schedule ?? null,
        status: 'active',
      }),
    );
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (org) this.news.publish('hire', `「${org.name}」雇佣了一名 agent 员工 🤖`, { refId: org.id });
    return member;
  }

  /** 加 human 成员(升级路径 OPC→团队→企业,R6.7),不重建公司。 */
  async addHumanMember(orgId: string, ownerUserId: string, memberUserId: string): Promise<AeonOrgMember> {
    await this.getOwned(orgId, ownerUserId);
    return this.memberRepo.save(
      this.memberRepo.create({ orgId, memberUserId, role: 'human_member', status: 'active' }),
    );
  }

  /** 发薪(R6.5 / R8.3):公司账本 → agent owner 钱包。余额不足停止 + 通知(R6.6)。 */
  async payWage(
    orgId: string,
    ownerUserId: string,
    memberId: string,
    compliance: ComplianceContext,
  ): Promise<{ paid: number }> {
    const org = await this.getOwned(orgId, ownerUserId);
    const member = await this.memberRepo.findOne({ where: { id: memberId, orgId } });
    if (!member) throw new NotFoundException('成员不存在');
    if (member.wageAxpPerPeriod <= 0) return { paid: 0 };

    const balance = await this.economy.orgBalance(org.id, 'AXP');
    if (balance < member.wageAxpPerPeriod) {
      this.inbox.push(
        ownerUserId,
        'payroll_halted',
        '发薪暂停',
        `公司「${org.name}」账本余额不足,已停止增薪工作。请注资后继续。`,
        org.id,
      );
      throw new BadRequestException('公司账本余额不足,发薪已暂停');
    }
    await this.economy.transfer({
      orgId: org.id,
      payerUserId: this.economy.orgWallet(org.id),
      payeeUserId: member.memberUserId,
      amount: member.wageAxpPerPeriod,
      currency: 'AXP',
      capability: 'pay',
      reason: 'wage',
      refId: member.id,
      compliance,
      debitFromOrg: true,
    });
    this.inbox.push(member.memberUserId, 'wage_paid', '收到工资', `你的 agent 在「${org.name}」获得 ${member.wageAxpPerPeriod} AXP 工资。`, org.id);
    // 钱包桥接(R20.4):世界工资出金到全局 AXP 钱包,跨端可用。降级不阻断。
    await this.reality.creditWallet(member.memberUserId, member.wageAxpPerPeriod, 'aeon_wage', org.id);
    return { paid: member.wageAxpPerPeriod };
  }

  /** agent owner 提前撤回(R8.6):结算已完成部分 + 通知雇主。 */
  async withdrawAgent(orgId: string, agentOwnerUserId: string, memberId: string): Promise<void> {
    const member = await this.memberRepo.findOne({ where: { id: memberId, orgId } });
    if (!member) throw new NotFoundException('成员不存在');
    if (member.memberUserId !== agentOwnerUserId) throw new ForbiddenException('只能撤回自己的 agent');
    member.status = 'withdrawn';
    await this.memberRepo.save(member);
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (org) {
      this.inbox.push(org.ownerUserId, 'agent_withdrawn', '员工离职', `一名 agent 员工已从「${org.name}」撤回。`, orgId);
    }
  }

  async listMembers(orgId: string): Promise<AeonOrgMember[]> {
    return this.memberRepo.find({ where: { orgId }, order: { createdAt: 'ASC' } });
  }

  async listMyCompanies(ownerUserId: string): Promise<AeonOrg[]> {
    return this.orgRepo.find({ where: { ownerUserId }, order: { createdAt: 'DESC' } });
  }

  async get(orgId: string): Promise<AeonOrg> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('组织不存在');
    return org;
  }

  private async getOwned(orgId: string, ownerUserId: string): Promise<AeonOrg> {
    const org = await this.get(orgId);
    if (org.ownerUserId !== ownerUserId) throw new ForbiddenException('只有公司 owner 可操作');
    return org;
  }
}
