import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FamilyAccountService } from './family-account.service';

/**
 * 顿领 §3.9 + §12 家庭账号 (P3-5 backend)
 *   POST /api/v1/family                          create family
 *   GET  /api/v1/family                          list my families
 *   GET  /api/v1/family/:id
 *   POST /api/v1/family/:id/invite               { email|user_id, role }
 *   POST /api/v1/family/invitations/accept       { code }
 *   GET  /api/v1/family/:id/members
 *   POST /api/v1/family/:id/pet                  setup family pet
 *   GET  /api/v1/family/:id/pet
 *   POST /api/v1/family/:id/pet/emotion
 *   POST /api/v1/family/:id/agents               create household agent
 *   GET  /api/v1/family/:id/agents
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/family')
export class FamilyAccountController {
  constructor(private readonly service: FamilyAccountService) {}

  private uid(req: any) {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.service.createFamily(this.uid(req), body);
  }

  @Get()
  list(@Req() req: any) {
    return this.service.listMyFamilies(this.uid(req));
  }

  @Post('invitations/accept')
  acceptInvitation(@Req() req: any, @Body() body: { code: string }) {
    return this.service.acceptInvitation(this.uid(req), body.code);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.service.getFamily(id, this.uid(req));
  }

  @Post(':id/invite')
  invite(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.service.invite(this.uid(req), id, body);
  }

  @Get(':id/members')
  members(@Req() req: any, @Param('id') id: string) {
    return this.service.listMembers(id, this.uid(req));
  }

  @Post(':id/pet')
  setupPet(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.service.setupFamilyPet(this.uid(req), id, body);
  }

  @Get(':id/pet')
  getPet(@Req() req: any, @Param('id') id: string) {
    return this.service.getFamilyPet(id, this.uid(req));
  }

  @Post(':id/pet/emotion')
  setPetEmotion(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.service.setFamilyPetEmotion(this.uid(req), id, body);
  }

  @Post(':id/agents')
  createAgent(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.service.createHouseholdAgent(this.uid(req), id, body);
  }

  @Get(':id/agents')
  listAgents(@Req() req: any, @Param('id') id: string) {
    return this.service.listHouseholdAgents(id, this.uid(req));
  }
}
