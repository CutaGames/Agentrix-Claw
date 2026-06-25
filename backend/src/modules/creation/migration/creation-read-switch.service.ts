import { Injectable, Logger } from '@nestjs/common';

/**
 * 读切换阶段(world-creation-feed task 12.4)。
 *  - legacy:   读仍走旧 A/B 路径(默认,迁移未切流)。
 *  - canary:   灰度——命中 cohort 的用户读统一 Creation,其余走旧路径。
 *  - unified:  全量读统一 Creation。
 */
export type ReadSwitchStage = 'legacy' | 'canary' | 'unified';

/**
 * CreationReadSwitchService — 深合并"读切换灰度 + 一键回滚"(world-creation-feed task 12.4)。
 *
 * spec: 需求 12.4 —— 读切换按 cohort 灰度放量;出问题可一键切回旧读路径(回滚点)。
 *
 * 运维侧通过 `setStage`/`setCohortPercent` 控制;`shouldReadUnified(userId)` 给读路径
 * 在分流点判定走统一还是旧路径。灰度命中用 userId 稳定散列(同一用户判定稳定,
 * 不抖动),保证灰度期内用户体验一致。一键回滚 = `setStage('legacy')`。
 *
 * 默认 `legacy`:现网行为完全不变(与 `creationApi.USE_UNIFIED_CREATION_BACKEND=false`
 * 对齐),迁移就绪后由运维逐步 `canary`(调百分比)→ `unified`。
 */
@Injectable()
export class CreationReadSwitchService {
  private readonly logger = new Logger(CreationReadSwitchService.name);

  private stage: ReadSwitchStage = 'legacy';
  /** canary 阶段命中百分比 [0,100]。 */
  private cohortPercent = 0;

  getStage(): ReadSwitchStage {
    return this.stage;
  }

  getCohortPercent(): number {
    return this.cohortPercent;
  }

  /** 设置阶段;`legacy` 即一键回滚(需求 12.4)。 */
  setStage(stage: ReadSwitchStage): void {
    this.stage = stage;
    this.logger.warn(`read-switch stage → ${stage} (cohort=${this.cohortPercent}%)`);
  }

  /** 设置 canary 命中百分比(夹取 [0,100])。 */
  setCohortPercent(percent: number): void {
    this.cohortPercent = Math.min(100, Math.max(0, Math.floor(percent)));
  }

  /** 一键回滚到旧读路径。 */
  rollback(): void {
    this.setStage('legacy');
  }

  /** 读路径分流判定:该用户是否读统一 Creation。 */
  shouldReadUnified(userId?: string): boolean {
    if (this.stage === 'unified') return true;
    if (this.stage === 'legacy') return false;
    // canary:按 userId 稳定散列命中 cohortPercent。
    if (!userId) return false;
    return this.stableBucket(userId) < this.cohortPercent;
  }

  /** userId → [0,100) 稳定桶(确定性散列,避免灰度抖动)。 */
  private stableBucket(userId: string): number {
    let h = 0;
    for (let i = 0; i < userId.length; i++) {
      h = (h * 31 + userId.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % 100;
  }
}
