import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceService } from './workspace.service';
import { 
  WorkspaceType, 
  WorkspacePlan, 
  WorkspaceMemberRole 
} from '../../entities/workspace.entity';

@ApiTags('工作空间')
@Controller('workspaces')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  @ApiOperation({ summary: '创建工作空间' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async create(
    @Request() req,
    @Body() body: {
      name: string;
      slug?: string;
      description?: string;
      type?: WorkspaceType;
    },
  ) {
    return this.workspaceService.create(req.user.id, body);
  }

  @Get()
  @ApiOperation({ summary: '获取我的工作空间列表' })
  async getMyWorkspaces(@Request() req) {
    return this.workspaceService.getUserWorkspaces(req.user.id);
  }

  @Get('owned')
  @ApiOperation({ summary: '获取我拥有的工作空间' })
  async getOwnedWorkspaces(@Request() req) {
    return this.workspaceService.getOwnedWorkspaces(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取工作空间详情' })
  async getWorkspace(@Param('id') id: string) {
    return this.workspaceService.findById(id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: '通过 slug 获取工作空间' })
  async getWorkspaceBySlug(@Param('slug') slug: string) {
    return this.workspaceService.findBySlug(slug);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新工作空间' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() body: {
      name?: string;
      description?: string;
      iconUrl?: string;
      settings?: any;
    },
  ) {
    return this.workspaceService.update(id, req.user.id, body);
  }

  @Post(':id/members')
  @ApiOperation({ summary: '邀请成员' })
  async inviteMember(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { userId: string; role?: WorkspaceMemberRole },
  ) {
    return this.workspaceService.addMember(
      id,
      body.userId,
      body.role || WorkspaceMemberRole.MEMBER,
      req.user.id,
    );
  }

  @Post(':id/accept-invitation')
  @ApiOperation({ summary: '接受邀请' })
  async acceptInvitation(@Request() req, @Param('id') id: string) {
    return this.workspaceService.acceptInvitation(id, req.user.id);
  }

  @Get(':id/members')
  @ApiOperation({ summary: '获取成员列表' })
  async getMembers(@Param('id') id: string) {
    return this.workspaceService.getMembers(id);
  }

  @Put(':id/members/:userId/role')
  @ApiOperation({ summary: '更新成员角色' })
  async updateMemberRole(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { role: WorkspaceMemberRole },
  ) {
    return this.workspaceService.updateMemberRole(id, userId, body.role, req.user.id);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '移除成员' })
  async removeMember(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.workspaceService.removeMember(id, userId, req.user.id);
  }

  @Post(':id/upgrade')
  @ApiOperation({ summary: '升级计划' })
  async upgradePlan(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { plan: WorkspacePlan },
  ) {
    return this.workspaceService.upgradePlan(id, req.user.id, body.plan);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: '归档工作空间' })
  async archive(@Request() req, @Param('id') id: string) {
    return this.workspaceService.archive(id, req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除工作空间' })
  async delete(@Request() req, @Param('id') id: string) {
    await this.workspaceService.delete(id, req.user.id);
  }

  @Get(':id/check-permission')
  @ApiOperation({ summary: '检查用户权限' })
  async checkPermission(
    @Request() req,
    @Param('id') id: string,
    @Query('roles') roles: string,
  ) {
    const allowedRoles = roles ? roles.split(',') : ['owner', 'admin', 'member'];
    const member = await this.workspaceService.checkPermission(id, req.user.id, allowedRoles);
    return { hasPermission: true, role: member.role };
  }
}
