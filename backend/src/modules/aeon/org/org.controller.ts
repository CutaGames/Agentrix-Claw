import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OrgService } from './org.service';
import { ClockInService } from './clock-in.service';
import type { ComplianceContext } from '../economy/compliance-gate.service';

/**
 * OrgController — 虚拟公司 + 招聘发薪 API(Task 3.4 / 3.7 / R6 / R8)。`v1/aeon/orgs`。
 */
@ApiTags('aeon/orgs')
@Controller('v1/aeon/orgs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrgController {
  constructor(
    private readonly orgs: OrgService,
    private readonly clockIn: ClockInService,
  ) {}

  private uid(req: any): string {
    return req.user?.id || req.user?.sub;
  }
  private compliance(req: any): ComplianceContext {
    return {
      userId: this.uid(req),
      region: req.user?.region,
      isMinor: req.user?.isMinor === true,
      kycPassed: req.user?.kycPassed === true,
      amlFlagged: req.user?.amlFlagged === true,
    };
  }

  @Post()
  @ApiOperation({ summary: '创建虚拟公司' })
  async create(@Request() req: any, @Body() body: { name: string; plotId: string }) {
    if (!body?.name || !body?.plotId) throw new BadRequestException('name/plotId 必填');
    return this.orgs.createCompany(this.uid(req), body);
  }

  @Get('mine')
  @ApiOperation({ summary: '我的公司' })
  async mine(@Request() req: any) {
    return { items: await this.orgs.listMyCompanies(this.uid(req)) };
  }

  @Get(':id')
  @ApiOperation({ summary: '公司详情' })
  async get(@Param('id') id: string) {
    return this.orgs.get(id);
  }

  @Get(':id/members')
  @ApiOperation({ summary: '公司成员名册' })
  async members(@Param('id') id: string) {
    return { items: await this.orgs.listMembers(id) };
  }

  @Post(':id/fund')
  @ApiOperation({ summary: '注资公司账本' })
  async fund(@Request() req: any, @Param('id') id: string, @Body() body: { amount: number }) {
    if (!(body?.amount > 0)) throw new BadRequestException('amount 必须为正');
    return this.orgs.fund(id, this.uid(req), body.amount);
  }

  @Post(':id/employees')
  @ApiOperation({ summary: '分配/雇佣 agent 员工到工位' })
  async assign(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      memberUserId: string;
      agentInstanceId: string;
      wageAxpPerPeriod?: number;
      schedule?: Record<string, unknown>;
    },
  ) {
    if (!body?.agentInstanceId) throw new BadRequestException('agentInstanceId 必填');
    // memberUserId 缺省/空串都回退为当前用户(雇自己的 agent)。`??` 不拦空串,这里显式处理,
    // 否则空串会被当成 uuid 写库导致雇佣失败(移动端历史传 '')。
    const memberUserId =
      typeof body.memberUserId === 'string' && body.memberUserId.trim()
        ? body.memberUserId.trim()
        : this.uid(req);
    return this.orgs.assignAgentEmployee(id, this.uid(req), {
      memberUserId,
      agentInstanceId: body.agentInstanceId,
      wageAxpPerPeriod: body.wageAxpPerPeriod,
      schedule: body.schedule,
    });
  }

  @Post(':id/members/human')
  @ApiOperation({ summary: '添加 human 成员(团队升级)' })
  async addHuman(@Request() req: any, @Param('id') id: string, @Body() body: { memberUserId: string }) {
    if (!body?.memberUserId) throw new BadRequestException('memberUserId 必填');
    return this.orgs.addHumanMember(id, this.uid(req), body.memberUserId);
  }

  @Post(':id/members/:memberId/pay')
  @ApiOperation({ summary: '发薪' })
  async pay(@Request() req: any, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.orgs.payWage(id, this.uid(req), memberId, this.compliance(req));
  }

  @Post(':id/members/:memberId/withdraw')
  @ApiOperation({ summary: 'agent owner 撤回员工' })
  async withdraw(@Request() req: any, @Param('id') id: string, @Param('memberId') memberId: string) {
    await this.orgs.withdrawAgent(id, this.uid(req), memberId);
    return { ok: true };
  }

  @Post(':id/members/:memberId/clock-in')
  @ApiOperation({ summary: 'agent 员工打卡上岗' })
  async clockInMember(@Param('id') id: string, @Param('memberId') memberId: string) {
    return this.clockIn.clockIn(id, memberId);
  }

  @Post(':id/members/:memberId/clock-out')
  @ApiOperation({ summary: 'agent 员工下岗' })
  async clockOutMember(@Param('id') id: string, @Param('memberId') memberId: string) {
    await this.clockIn.clockOut(id, memberId);
    return { ok: true };
  }

  @Post(':id/members/:memberId/settle')
  @ApiOperation({ summary: '周期结算(产出达标发薪)' })
  async settle(@Request() req: any, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.clockIn.settlePeriod(id, this.uid(req), memberId, this.compliance(req));
  }
}
