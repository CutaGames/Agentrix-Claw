import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PluginService, CreatePluginDto, UpdatePluginDto } from './plugin.service';
import { Plugin } from '../../entities/plugin.entity';
import { UserPlugin } from '../../entities/user-plugin.entity';
import { PluginCategory } from '../../entities/plugin.entity';

@ApiTags('plugins')
@Controller('plugins')
export class PluginController {
  constructor(private readonly pluginService: PluginService) {}

  @Get()
  @ApiOperation({ summary: '获取插件列表' })
  @ApiResponse({ status: 200, description: '插件列表', type: [Plugin] })
  async getPlugins(
    @Query('category') category?: PluginCategory,
    @Query('search') search?: string,
    @Query('role') role?: 'user' | 'merchant' | 'developer',
  ): Promise<Plugin[]> {
    return this.pluginService.getPlugins({ category, search, role });
  }

  @Get(':pluginId')
  @ApiOperation({ summary: '获取插件详情' })
  @ApiResponse({ status: 200, description: '插件详情', type: Plugin })
  async getPlugin(@Param('pluginId') pluginId: string): Promise<Plugin> {
    return this.pluginService.getPlugin(pluginId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建插件' })
  @ApiResponse({ status: 201, description: '插件已创建', type: Plugin })
  async createPlugin(@Request() req: any, @Body() dto: CreatePluginDto): Promise<Plugin> {
    return this.pluginService.createPlugin(req.user.id, dto);
  }

  @Put(':pluginId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新插件' })
  @ApiResponse({ status: 200, description: '插件已更新', type: Plugin })
  async updatePlugin(
    @Request() req: any,
    @Param('pluginId') pluginId: string,
    @Body() dto: UpdatePluginDto,
  ): Promise<Plugin> {
    return this.pluginService.updatePlugin(pluginId, req.user.id, dto);
  }

  @Post(':pluginId/install')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '安装插件' })
  @ApiResponse({ status: 201, description: '插件已安装', type: UserPlugin })
  async installPlugin(
    @Request() req: any,
    @Param('pluginId') pluginId: string,
    @Body() config?: Record<string, any>,
  ): Promise<UserPlugin> {
    return this.pluginService.installPlugin(req.user.id, pluginId, config);
  }

  @Delete(':pluginId/install')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '卸载插件' })
  @ApiResponse({ status: 200, description: '插件已卸载' })
  async uninstallPlugin(@Request() req: any, @Param('pluginId') pluginId: string): Promise<void> {
    return this.pluginService.uninstallPlugin(req.user.id, pluginId);
  }

  @Get('user/installed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取用户已安装的插件' })
  @ApiResponse({ status: 200, description: '已安装插件列表', type: [UserPlugin] })
  async getUserPlugins(@Request() req: any): Promise<UserPlugin[]> {
    return this.pluginService.getUserPlugins(req.user.id);
  }

  @Post(':pluginId/update-version')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新插件版本' })
  @ApiResponse({ status: 200, description: '插件版本已更新', type: UserPlugin })
  async updatePluginVersion(
    @Request() req: any,
    @Param('pluginId') pluginId: string,
    @Body('version') version: string,
  ): Promise<UserPlugin> {
    return this.pluginService.updatePluginVersion(req.user.id, pluginId, version);
  }

  @Post(':pluginId/purchase')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '购买插件' })
  @ApiResponse({ status: 200, description: '插件购买成功' })
  async purchasePlugin(
    @Request() req: any,
    @Param('pluginId') pluginId: string,
    @Body('paymentMethod') paymentMethod?: string,
  ): Promise<{ success: boolean; userPlugin?: UserPlugin; message: string }> {
    return this.pluginService.purchasePlugin(req.user.id, pluginId, paymentMethod);
  }

  @Post(':pluginId/activate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '激活插件（注册 hooks/MCP/tools）' })
  @ApiResponse({ status: 200, description: '插件已激活' })
  async activatePlugin(
    @Request() req: any,
    @Param('pluginId') pluginId: string,
  ): Promise<{ activatedHooks: number; activatedMcpServers: number; activatedTools: number }> {
    return this.pluginService.activatePlugin(req.user.id, pluginId);
  }

  @Post(':pluginId/deactivate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '停用插件' })
  @ApiResponse({ status: 200, description: '插件已停用' })
  async deactivatePlugin(
    @Request() req: any,
    @Param('pluginId') pluginId: string,
  ): Promise<{ deactivated: boolean }> {
    await this.pluginService.deactivatePlugin(req.user.id, pluginId);
    return { deactivated: true };
  }

  @Get(':pluginId/permissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取插件所需权限' })
  @ApiResponse({ status: 200, description: '插件权限信息' })
  async getPluginPermissions(
    @Param('pluginId') pluginId: string,
  ): Promise<{ requiredPermissions: string[]; sandboxLevel: string; securityPolicy: any }> {
    const plugin = await this.pluginService.getPlugin(pluginId);
    return {
      requiredPermissions: plugin.requiredPermissions || [],
      sandboxLevel: plugin.sandboxLevel || 'none',
      securityPolicy: plugin.securityPolicy || {},
    };
  }
}

