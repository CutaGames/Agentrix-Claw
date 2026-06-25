import { Injectable, BadRequestException } from '@nestjs/common';
import {
  AEON_EPOCHS,
  AEON_ACTIVE_EPOCH,
  type AeonEpoch,
  type AeonEpochInfo,
} from '../../../../../shared/types/aeon-world';

/**
 * EpochService — Aeon 纪元管理(Task 1.1 / R17)。
 *
 * 有序纪元 earth|mars|galaxy,MVP 仅 earth 激活。Plot/Org/Room 作用域到 epoch,
 * 未发布纪元锁定 + 预览,不可圈地/进入。解锁机制本身 out of MVP(R17.4)。
 */
@Injectable()
export class EpochService {
  /** 当前激活纪元(MVP=earth)。 */
  getActiveEpoch(): AeonEpoch {
    return AEON_ACTIVE_EPOCH;
  }

  /** 纪元是否已发布可进入。MVP 仅 earth。 */
  isUnlocked(epoch: AeonEpoch): boolean {
    return epoch === AEON_ACTIVE_EPOCH;
  }

  /** 列出所有纪元 + 解锁状态(给地图/导航展示锁定预览)。 */
  listEpochs(): AeonEpochInfo[] {
    return AEON_EPOCHS.map((id) => {
      const unlocked = this.isUnlocked(id);
      return {
        id,
        unlocked,
        displayName: this.displayName(id),
        teaser: unlocked ? undefined : this.teaser(id),
      };
    });
  }

  /**
   * 校验某纪元是否可进行圈地/进入。未发布则抛 400(R17.3)。
   * 写操作(claim plot / create room)前调用。
   */
  assertEnterable(epoch: AeonEpoch): void {
    if (!AEON_EPOCHS.includes(epoch)) {
      throw new BadRequestException(`未知纪元: ${epoch}`);
    }
    if (!this.isUnlocked(epoch)) {
      throw new BadRequestException(`纪元「${this.displayName(epoch)}」尚未开放,敬请期待`);
    }
  }

  private displayName(epoch: AeonEpoch): string {
    switch (epoch) {
      case 'earth':
        return '地球';
      case 'mars':
        return '火星';
      case 'galaxy':
        return '银河';
    }
  }

  private teaser(epoch: AeonEpoch): string {
    switch (epoch) {
      case 'mars':
        return '当地球足够繁荣,火星殖民将开启 —— 拓荒、生存、新资源。';
      case 'galaxy':
        return '星际之间,多个星球世界互通贸易与迁徙。遥远但终将抵达。';
      default:
        return '';
    }
  }
}
