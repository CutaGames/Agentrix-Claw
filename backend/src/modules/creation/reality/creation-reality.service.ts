import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { CreationRepository } from '../creation.repository';
import { CreationEntity } from '../entities/creation.entity';
import {
  AEON_GEO,
  haversineMeters,
  type AeonPlotPoi,
} from '../../../../shared/types/aeon-world';
import type {
  BindCreationPoiResponse,
  CheckinCreationResponse,
} from '../../../../shared/types/creation-api';
import type { Creation } from '../../../../shared/types/creation';

/**
 * CreationRealityService — Creation 现实关联(world-creation-feed task 10.2)。
 *
 * spec: 需求 9.1(绑定真实商家 POI)/ 9.2(到访签到奖励)。
 *   - bindPoi:把真实商家 POI 写入 Creation(店名/类目/外部 POI id/认证/门店入口)。
 *   - checkin:用实测 GPS 与 Creation 地理锚点比对,判定半径内则签到成功并给出 AXP 奖励额度。
 *
 * 注:AXP 实际入账复用 Aeon 现实奖励桥(RealityLoopService.rewardFromReality,幂等);
 * 本服务负责绑定与判定 + 给出奖励额度,资金清算在迁移 12.3 与 aeon 桥统一对接
 * (避免跨模块循环依赖)。
 */
@Injectable()
export class CreationRealityService {
  private readonly logger = new Logger(CreationRealityService.name);

  constructor(private readonly repo: CreationRepository) {}

  /** 绑定真实商家 POI(需求 9.1)。绑定后类型归为 shop(若原为 place)。 */
  async bindPoi(creationId: string, poi: AeonPlotPoi): Promise<BindCreationPoiResponse> {
    const creation = await this.getOrThrow(creationId);
    creation.poi = poi;
    if (creation.type === 'place') creation.type = 'shop';
    await this.repo.save(creation);
    return { creation: creation as unknown as Creation };
  }

  /** 到访签到(需求 9.2):距 Creation 地理锚点判定半径内才成功。 */
  async checkin(
    creationId: string,
    location: { lat: number; lng: number },
  ): Promise<CheckinCreationResponse> {
    const creation = await this.getOrThrow(creationId);
    if (!creation.geo) {
      return { checkedIn: false, error: { error: 'CAP_DENIED', detail: 'creation has no geo anchor' } };
    }
    const dist = haversineMeters(location.lat, location.lng, creation.geo.lat, creation.geo.lng);
    if (dist > AEON_GEO.CHECKIN_RADIUS_M) {
      return {
        checkedIn: false,
        error: { error: 'CAP_DENIED', detail: `too far (${Math.round(dist)}m > ${AEON_GEO.CHECKIN_RADIUS_M}m)` },
      };
    }
    // 奖励额度(实际 AXP 入账经 aeon RealityLoopService 幂等发放,见服务注释)。
    return { checkedIn: true, awardedAxp: AEON_GEO.CHECKIN_REWARD_AXP };
  }

  private async getOrThrow(creationId: string): Promise<CreationEntity> {
    const c = await this.repo.findById(creationId);
    if (!c) throw new NotFoundException(`Creation not found: ${creationId}`);
    return c;
  }
}
