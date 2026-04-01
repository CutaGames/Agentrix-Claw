import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentTeamService, ProvisionTeamDto, CreateTeamTemplateDto } from './agent-team.service';

@ApiTags('Agent Teams')
@Controller('agent-teams')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgentTeamController {
  constructor(private readonly agentTeamService: AgentTeamService) {}

  // ========== 模板 ==========

  @Get('templates')
  @ApiOperation({ summary: '获取可用团队模板列表' })
  @ApiResponse({ status: 200, description: '返回模板列表' })
  async listTemplates() {
    const templates = await this.agentTeamService.listTemplates();
    return {
      success: true,
      data: templates,
    };
  }

  @Get('templates/:slug')
  @ApiOperation({ summary: '获取模板详情' })
  @ApiResponse({ status: 200, description: '返回模板详情（含角色列表）' })
  async getTemplate(@Param('slug') slug: string) {
    const template = await this.agentTeamService.getTemplate(slug);
    return {
      success: true,
      data: template,
    };
  }

  @Post('templates')
  @ApiOperation({ summary: '创建自定义团队模板' })
  @ApiResponse({ status: 201, description: '模板创建成功' })
  async createTemplate(@Request() req, @Body() dto: CreateTeamTemplateDto) {
    const template = await this.agentTeamService.createTemplate(dto, req.user.id);
    return {
      success: true,
      data: template,
      message: '模板创建成功',
    };
  }

  // ========== 团队创建 ==========

  @Post('provision')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '从模板一键创建 Agent 团队' })
  @ApiResponse({ status: 201, description: '团队创建成功' })
  async provisionTeam(@Request() req, @Body() dto: ProvisionTeamDto) {
    const result = await this.agentTeamService.provisionTeam(req.user.id, dto);
    return {
      success: true,
      data: result,
      message: `团队 "${result.templateName}" 创建成功，共 ${result.teamSize} 个 Agent 已激活。`,
    };
  }

  // ========== 我的团队 ==========

  @Get('my-teams')
  @ApiOperation({ summary: '获取我已创建的团队列表' })
  @ApiResponse({ status: 200, description: '返回团队列表' })
  async getMyTeams(@Request() req) {
    const teams = await this.agentTeamService.getMyTeams(req.user.id);
    return {
      success: true,
      data: teams,
    };
  }

  @Delete('my-teams/:slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '解散指定模板创建的团队' })
  @ApiResponse({ status: 200, description: '团队已解散' })
  async disbandTeam(@Request() req, @Param('slug') slug: string) {
    const result = await this.agentTeamService.disbandTeam(req.user.id, slug);
    return {
      success: true,
      data: result,
      message: `团队已解散，${result.disbanded} 个 Agent 已撤销。`,
    };
  }

  @Post('my-teams/:slug/roles/:codename/bind-instance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '绑定已有 OpenClaw 实例到团队角色' })
  @ApiResponse({ status: 200, description: '绑定成功' })
  async bindInstanceToRole(
    @Request() req,
    @Param('slug') slug: string,
    @Param('codename') codename: string,
    @Body() body: { instanceId: string },
  ) {
    const result = await this.agentTeamService.bindInstanceToRole(
      req.user.id, slug, codename, body.instanceId,
    );
    return {
      success: true,
      data: result,
      message: `实例已绑定到 ${codename} 角色。`,
    };
  }
}
