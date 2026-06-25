import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';
import { UnifiedAuthGuard } from '../auth/guards/unified-auth.guard';

@Controller('ai-providers')
@UseGuards(UnifiedAuthGuard)
export class AiProviderController {
  constructor(private readonly service: AiProviderService) {}

  /** 获取支持的厂商与模型目录 */
  @Get('catalog')
  getCatalog() {
    return this.service.getCatalog();
  }

  /** 获取当前用户已配置的厂商 */
  @Get('configs')
  async getConfigs(@Req() req: any) {
    return this.service.getUserConfigs(req.user.id || req.user.sub);
  }

  /** 新增或更新厂商配置 */
  @Post('configs')
  async upsertConfig(@Req() req: any, @Body() body: {
    providerId: string;
    apiKey: string;
    secretKey?: string;
    baseUrl?: string;
    region?: string;
    selectedModel: string;
  }) {
    return this.service.upsertConfig(req.user.id || req.user.sub, body);
  }

  /** 删除厂商配置 */
  @Delete('configs/:providerId')
  async deleteConfig(@Req() req: any, @Param('providerId') providerId: string) {
    return this.service.deleteConfig(req.user.id || req.user.sub, providerId);
  }

  /** 设置默认厂商 */
  @Post('default')
  async setDefault(@Req() req: any, @Body() body: { providerId: string }) {
    return this.service.setDefaultProvider(req.user.id || req.user.sub, body.providerId);
  }

  /** 获取默认厂商 */
  @Get('default')
  async getDefault(@Req() req: any) {
    const config = await this.service.getDefaultConfig(req.user.id || req.user.sub);
    return config ? { providerId: config.providerId, selectedModel: config.selectedModel } : null;
  }

  /** 获取当前用户可用的模型列表（平台默认 + 已配置厂商的模型） */
  @Get('available-models')
  async getAvailableModels(@Req() req: any) {
    return this.service.getAvailableModels(req.user.id || req.user.sub);
  }

  /** 测试 API Key 连通性 */
  @Post('test')
  async testProvider(@Req() req: any, @Body() body: {
    providerId: string;
    apiKey: string;
    secretKey?: string;
    baseUrl?: string;
    region?: string;
    model: string;
  }) {
    return this.service.testProvider(req.user.id || req.user.sub, body);
  }
}
