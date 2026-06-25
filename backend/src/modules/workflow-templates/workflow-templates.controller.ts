import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkflowTemplatesService } from './workflow-templates.service';

/**
 * 顿领 §10.3 联合工作流模板 (P2-8 part 2)
 *   POST /api/v1/workflow/templates              create
 *   GET  /api/v1/workflow/templates?category=&visibility=
 *   GET  /api/v1/workflow/templates/:id
 *   POST /api/v1/workflow/templates/:id/install  install -> instance, auto-run
 *   GET  /api/v1/workflow/instances/:id
 *   GET  /api/v1/workflow/instances              my instances
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/workflow')
export class WorkflowTemplatesController {
  constructor(private readonly service: WorkflowTemplatesService) {}

  private uid(req: any) {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Post('templates')
  create(@Req() req: any, @Body() body: any) {
    return this.service.createTemplate(this.uid(req), body);
  }

  @Get('templates')
  list(@Req() req: any, @Query('category') category?: string, @Query('visibility') visibility?: string) {
    return this.service.listTemplates(this.uid(req), { category, visibility });
  }

  @Get('templates/:id')
  get(@Param('id') id: string) {
    return this.service.getTemplate(id);
  }

  @Post('templates/:id/install')
  install(@Req() req: any, @Param('id') id: string) {
    return this.service.install(this.uid(req), id);
  }

  @Get('instances/:id')
  getInstance(@Param('id') id: string) {
    return this.service.getInstance(id);
  }

  @Get('instances')
  listInstances(@Req() req: any) {
    return this.service.listInstances(this.uid(req));
  }
}
