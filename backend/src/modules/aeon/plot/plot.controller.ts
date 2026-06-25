import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PlotService } from './plot.service';
import { PlotMessageService } from './plot-message.service';
import { EpochService } from '../epoch/epoch.service';
import { AEON_ACTIVE_EPOCH, type AeonEpoch } from '../../../../../shared/types/aeon-world';

/**
 * PlotController — 地块选址圈地 API(Task 1.3 / R4)。
 *
 * 不使用设备 GPS 限制圈地(R4.7):claim 接收客户端在地图上点选的 lat/lng,
 * 与设备实时定位解耦。
 */
@ApiTags('aeon/plots')
@Controller('v1/aeon/plots')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PlotController {
  constructor(
    private readonly plots: PlotService,
    private readonly epoch: EpochService,
    private readonly plotMessages: PlotMessageService,
  ) {}

  /** 列出纪元(含锁定预览),供地图导航。 */
  @Get('epochs')
  @ApiOperation({ summary: '列出纪元 + 解锁状态' })
  listEpochs() {
    return { items: this.epoch.listEpochs(), active: this.epoch.getActiveEpoch() };
  }

  /** 圈地(R4.2/4.3)。 */
  @Post('claim')
  @ApiOperation({ summary: '在地图上圈定一块地' })
  async claim(
    @Request() req: any,
    @Body() body: { lat: number; lng: number; epoch?: AeonEpoch; displayName?: string },
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (typeof body?.lat !== 'number' || typeof body?.lng !== 'number') {
      throw new BadRequestException('lat/lng 必填且为数字');
    }
    return this.plots.claim(userId, body.lat, body.lng, {
      epoch: body.epoch,
      displayName: body.displayName,
    });
  }

  /** 地图 markers:列出某纪元已圈地块(R4.5)。 */
  @Get()
  @ApiOperation({ summary: '列出已圈地块(地图 markers)' })
  async listMarkers(@Query('epoch') epoch?: AeonEpoch) {
    const items = await this.plots.listMarkers(epoch ?? AEON_ACTIVE_EPOCH);
    return { items };
  }

  /** 我的地块。 */
  @Get('mine')
  @ApiOperation({ summary: '我的地块' })
  async listMine(@Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return { items: await this.plots.listMine(userId) };
  }

  /** 附近的地块(基于实时 GPS 的地理社交)。?lat=&lng=&radiusM=。 */
  @Get('nearby')
  @ApiOperation({ summary: '附近的领地(基于 GPS)' })
  async nearby(
    @Request() req: any,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radiusM') radiusM?: string,
    @Query('epoch') epoch?: AeonEpoch,
  ) {
    const userId = req.user?.id || req.user?.sub;
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      throw new BadRequestException('lat/lng 必填且为数字');
    }
    const r = radiusM ? parseInt(radiusM, 10) : undefined;
    return { items: await this.plots.findNearby(userId, la, ln, r, epoch ?? AEON_ACTIVE_EPOCH) };
  }

  /** 附近的人(在场玩家按 GPS 聚合)+ 顺便上报我的位置。?lat=&lng=&radiusM=。 */
  @Post('nearby-people')
  @ApiOperation({ summary: '附近的人(上报我的位置 + 查附近在线玩家)' })
  async nearbyPeople(
    @Request() req: any,
    @Body() body: { lat: number; lng: number; radiusM?: number; clan?: string; plotId?: string | null },
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (typeof body?.lat !== 'number' || typeof body?.lng !== 'number') {
      throw new BadRequestException('lat/lng 必填且为数字(你的实时位置)');
    }
    const name = req.user?.nickname || req.user?.name || req.user?.email || '居民';
    const items = this.plots.reportAndFindPeople(userId, name, body.lat, body.lng, body.radiusM ?? 5000, {
      clan: body.clan,
      plotId: body.plotId,
    });
    return { items };
  }

  /** 退出地图:清除我的位置(不再出现在别人"附近的人"里)。 */
  @Post('presence/clear')
  @ApiOperation({ summary: '退出地图(清除实时位置)' })
  async clearPresence(@Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    this.plots.clearPresence(userId);
    return { ok: true };
  }

  /** 签到打卡排行(近 N 天)。 */
  @Get('checkin/leaderboard')
  @ApiOperation({ summary: '签到打卡排行' })
  async checkinLeaderboard(@Query('days') days?: string, @Query('limit') limit?: string) {
    const items = await this.plots.checkinLeaderboard(
      days ? parseInt(days, 10) : 30,
      limit ? parseInt(limit, 10) : 20,
    );
    return { items };
  }

  // ── 地块留言板(地图社交)──────────────────────────────────────
  // ⚠️ messages/inbox 字面路由必须在 :id 通配之前声明,否则被 @Get(':id') 吃掉。
  /** 我收到的留言(我所有地块上的访客留言)。 */
  @Get('messages/inbox')
  @ApiOperation({ summary: '我收到的领地留言' })
  async messageInbox(@Request() req: any, @Query('limit') limit?: string) {
    const userId = req.user?.id || req.user?.sub;
    return { items: await this.plotMessages.inbox(userId, limit ? parseInt(limit, 10) : 50) };
  }

  /** 列出某地块的留言。 */
  @Get(':id/messages')
  @ApiOperation({ summary: '地块留言板' })
  async listMessages(@Param('id') id: string, @Query('limit') limit?: string) {
    return { items: await this.plotMessages.list(id, limit ? parseInt(limit, 10) : 50) };
  }

  /** 在地块留言。 */
  @Post(':id/messages')
  @ApiOperation({ summary: '在地块留言' })
  async postMessage(@Request() req: any, @Param('id') id: string, @Body() body: { body: string }) {
    const userId = req.user?.id || req.user?.sub;
    return this.plotMessages.post(id, userId, body?.body ?? '');
  }

  /** 取单个地块。 */
  @Get(':id')
  @ApiOperation({ summary: '地块详情' })
  async getById(@Param('id') id: string) {
    return this.plots.getById(id);
  }

  /** 进入地块(刷新活动时间,防休眠)。 */
  @Post(':id/enter')
  @ApiOperation({ summary: '进入地块(刷新活动)' })
  async enter(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id || req.user?.sub;
    await this.plots.touchActivity(id, userId);
    return { ok: true };
  }

  /** 地理签到(到访真实地点的领地 → 奖励 AXP)。需实测 GPS 坐标。 */
  @Post(':id/checkin')
  @ApiOperation({ summary: '地理签到(到访领地得 AXP)' })
  async checkin(@Request() req: any, @Param('id') id: string, @Body() body: { lat: number; lng: number }) {
    const userId = req.user?.id || req.user?.sub;
    if (typeof body?.lat !== 'number' || typeof body?.lng !== 'number') {
      throw new BadRequestException('lat/lng 必填且为数字(你的实时位置)');
    }
    return this.plots.checkIn(userId, id, body.lat, body.lng);
  }

  /** 商家入驻:把自己的地块绑定真实 POI(店名/类目/门店入口)。 */
  @Post(':id/poi')
  @ApiOperation({ summary: '商家入驻(地块绑定真实 POI)' })
  async bindPoi(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { name: string; category?: string; externalPoiId?: string | null; storeUrl?: string | null; address?: string | null },
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!body?.name) throw new BadRequestException('店名(name)必填');
    return this.plots.bindPoi(id, userId, body);
  }
}
