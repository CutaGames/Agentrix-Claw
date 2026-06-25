import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BuildService } from './build.service';
import type { AeonBuildPlacement } from '../../../../../shared/types/aeon-world';

/**
 * BuildController — 共建建造系统 API(Task 4.1 / 4.2 / R10)。`v1/aeon/plots/:plotId/build`。
 */
@ApiTags('aeon/build')
@Controller('v1/aeon')
export class BuildController {
  constructor(private readonly build: BuildService) {}

  private uid(req: any): string {
    return req.user?.id || req.user?.sub;
  }

  /** 建筑目录(拖拽面板;无需登录即可浏览)。 */
  @Get('build/catalog')
  @ApiOperation({ summary: '模块化建筑目录' })
  catalog() {
    return { items: this.build.catalog() };
  }

  /** 我的可用建材(自有 World_Assets 中标为建材/装饰的;?all=1 返回全部以便转为建材)。 */
  @Get('build/my-assets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的可放置素材(自有资产)' })
  async myAssets(@Request() req: any, @Query('all') all?: string) {
    return { items: await this.build.listMyBuildableAssets(this.uid(req), all === '1' || all === 'true') };
  }

  /** 把某自有资产标记为建材/装饰/角色。 */
  @Post('build/my-assets/:assetId/usage')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '设置资产用途(转为建材)' })
  async setUsage(
    @Request() req: any,
    @Param('assetId') assetId: string,
    @Body() body: { usageKind: 'character' | 'build_material' | 'decor' },
  ) {
    const k = body?.usageKind;
    if (k !== 'character' && k !== 'build_material' && k !== 'decor') {
      throw new BadRequestException('usageKind 取值无效');
    }
    return this.build.setAssetUsageKind(this.uid(req), assetId, k);
  }

  /** 直接用一张照片创建建材资产(自己准备素材建造)。 */
  @Post('build/my-assets/from-photo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '用照片创建建材' })
  async fromPhoto(
    @Request() req: any,
    @Body() body: { name?: string; imageUrl: string; usageKind?: 'build_material' | 'decor' },
  ) {
    if (!body?.imageUrl) throw new BadRequestException('imageUrl 必填');
    return this.build.createBuildMaterialFromPhoto(this.uid(req), body);
  }

  /** 地块当前布局(重进还原;公开可见,逛别人地块)。 */
  @Get('plots/:plotId/build')
  @ApiOperation({ summary: '地块建造布局' })
  async list(@Param('plotId') plotId: string) {
    return { items: await this.build.listByPlot(plotId) };
  }

  @Post('plots/:plotId/build')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '放置建造物' })
  async place(@Request() req: any, @Param('plotId') plotId: string, @Body() body: AeonBuildPlacement) {
    if (body?.x == null || body?.y == null) throw new BadRequestException('x/y 必填');
    return this.build.place(plotId, this.uid(req), body);
  }

  @Patch('plots/:plotId/build/:itemId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '移动/旋转建造物' })
  async move(
    @Request() req: any,
    @Param('plotId') plotId: string,
    @Param('itemId') itemId: string,
    @Body() body: { x?: number; y?: number; rotation?: number },
  ) {
    return this.build.move(plotId, this.uid(req), itemId, body ?? {});
  }

  @Delete('plots/:plotId/build/:itemId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '移除建造物' })
  async remove(@Request() req: any, @Param('plotId') plotId: string, @Param('itemId') itemId: string) {
    await this.build.remove(plotId, this.uid(req), itemId);
    return { ok: true };
  }

  @Post('plots/:plotId/build/grantees')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '授权他人在地块共建' })
  async grantees(@Request() req: any, @Param('plotId') plotId: string, @Body() body: { grantees: string[] }) {
    const grantees = await this.build.setGrantees(plotId, this.uid(req), body?.grantees ?? []);
    return { grantees };
  }
}
