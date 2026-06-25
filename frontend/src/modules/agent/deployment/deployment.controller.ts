import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DeploymentService, CreateDeploymentDto } from './deployment.service';
import { AgentDeployment } from '../../../entities/agent-deployment.entity';

@ApiTags('agent-deployment')
@Controller('agent/deploy')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DeploymentController {
  constructor(private readonly deploymentService: DeploymentService) {}

  @Post()
  @ApiOperation({ summary: '部署 Agent 到 SaaS 平台' })
  @ApiResponse({ status: 201, description: '部署已创建', type: AgentDeployment })
  async deploy(@Request() req: any, @Body() dto: CreateDeploymentDto): Promise<AgentDeployment> {
    return this.deploymentService.createDeployment(req.user.id, dto);
  }

  @Get(':deploymentId')
  @ApiOperation({ summary: '获取部署状态' })
  @ApiResponse({ status: 200, description: '部署状态', type: AgentDeployment })
  async getDeploymentStatus(
    @Request() req: any,
    @Param('deploymentId') deploymentId: string,
  ): Promise<AgentDeployment> {
    return this.deploymentService.getDeploymentStatus(deploymentId, req.user.id);
  }

  @Get('agent/:agentId')
  @ApiOperation({ summary: '获取 Agent 的所有部署' })
  @ApiResponse({ status: 200, description: '部署列表', type: [AgentDeployment] })
  async getAgentDeployments(
    @Request() req: any,
    @Param('agentId') agentId: string,
  ): Promise<AgentDeployment[]> {
    return this.deploymentService.getAgentDeployments(agentId, req.user.id);
  }

  @Post(':deploymentId/pause')
  @ApiOperation({ summary: '暂停部署' })
  @ApiResponse({ status: 200, description: '部署已暂停', type: AgentDeployment })
  async pauseDeployment(
    @Request() req: any,
    @Param('deploymentId') deploymentId: string,
  ): Promise<AgentDeployment> {
    return this.deploymentService.pauseDeployment(deploymentId, req.user.id);
  }

  @Post(':deploymentId/resume')
  @ApiOperation({ summary: '恢复部署' })
  @ApiResponse({ status: 200, description: '部署已恢复', type: AgentDeployment })
  async resumeDeployment(
    @Request() req: any,
    @Param('deploymentId') deploymentId: string,
  ): Promise<AgentDeployment> {
    return this.deploymentService.resumeDeployment(deploymentId, req.user.id);
  }

  @Delete(':deploymentId')
  @ApiOperation({ summary: '删除部署' })
  @ApiResponse({ status: 200, description: '部署已删除' })
  async deleteDeployment(
    @Request() req: any,
    @Param('deploymentId') deploymentId: string,
  ): Promise<void> {
    return this.deploymentService.deleteDeployment(deploymentId, req.user.id);
  }
}

