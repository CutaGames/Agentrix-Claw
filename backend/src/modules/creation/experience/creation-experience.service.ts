import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { CreationRepository } from '../creation.repository';
import { CreationStateMachine } from '../creation-state-machine';
import { CreationEntity } from '../entities/creation.entity';
import { EcsWorldVersion } from '../../world-creation/entities/ecs-world-version.entity';

import type {
  EnterCreationRequest,
  EnterCreationResponse,
} from '../../../../shared/types/creation-api';
import type {
  EcsWorld,
  SandboxIsolationLevel,
  SubstrateTier,
} from '../../../../shared/types/world-creation';
import { ECS_VERSION } from '../../../../shared/types/world-creation';

/** 基底层级 → 沙箱隔离级(需求 6.6 deny-by-default 的承载)。 */
const TIER_TO_ISOLATION: Record<SubstrateTier, SandboxIsolationLevel> = {
  A: 'L0',
  B: 'L1',
  C: 'L2',
};

/**
 * CreationExperienceService — 统一进入体验(world-creation-feed task 5.1 / 5.2)。
 *
 * spec: 需求 6.1/6.3/6.4/6.6/6.7。
 *   - 解析 Creation 当前 ECS_World 快照 + 由 substrateTier 决定的沙箱隔离级。
 *   - 纯地理创作(无 ecsVersionId)返回最小可漫游空 ECS_World(可后续生成内容)。
 *   - 仅可发现状态可进入(与发现面同源,Property 4);否则结构化错误。
 *   - 能力白名单 deny-by-default 在体验内 World_API 调用处生效(隔离级随会话下发);
 *     本服务负责会话实例化与隔离级裁决。
 *
 * 进入超时(LOAD_TIMEOUT,10s)为客户端侧竞速(见 CreationExperienceScreen);
 * 服务端只负责快速解析与裁决。
 */
@Injectable()
export class CreationExperienceService {
  private readonly logger = new Logger(CreationExperienceService.name);

  constructor(
    private readonly repo: CreationRepository,
    private readonly stateMachine: CreationStateMachine,
    @InjectRepository(EcsWorldVersion)
    private readonly versionRepo: Repository<EcsWorldVersion>,
  ) {}

  async enter(
    creationId: string,
    _req: EnterCreationRequest = {},
  ): Promise<EnterCreationResponse> {
    const creation = await this.getOrThrow(creationId);

    // 仅可发现(已发布/已上架)的创作可进入(与发现面同源,Property 4)。
    if (!this.stateMachine.isDiscoverable(creation.status)) {
      return this.fail(creationId, 'CAP_DENIED', `creation not enterable (status=${creation.status})`);
    }

    const isolationLevel = TIER_TO_ISOLATION[creation.substrateTier] ?? 'L0';
    const ecsWorld = await this.loadEcsWorld(creation);

    this.logger.log(
      `Enter creation=${creationId} tier=${creation.substrateTier} iso=${isolationLevel} ` +
        `ecs=${creation.ecsVersionId ? 'snapshot' : 'empty(geo)'}`,
    );

    return {
      sessionId: randomUUID(),
      ecsWorld,
      isolationLevel,
      // 只读资产句柄:bringAssetIds 的所有权校验/注入复用 v6 identity-resolver,
      // 当前统一 enter 暂返回空集(携带资产入场为后续增强,需求 6.7)。
      readonlyAssetHandles: [],
      // shop 下单用:投影该创作的供给项(数量夹取/价格权威仍由网关 invoke 服务端裁决)。
      offerings: creation.offerings ?? [],
    };
  }

  // ── Helpers ──────────────────────────────────────────────────

  private async getOrThrow(creationId: string): Promise<CreationEntity> {
    const c = await this.repo.findById(creationId);
    if (!c) throw new NotFoundException(`Creation not found: ${creationId}`);
    return c;
  }

  /** 加载当前 ECS_World 快照;纯地理创作返回最小空世界(可漫游,后续可生成)。 */
  private async loadEcsWorld(creation: CreationEntity): Promise<EcsWorld> {
    if (creation.ecsVersionId) {
      const version = await this.versionRepo.findOne({
        where: { id: creation.ecsVersionId },
      });
      if (version?.snapshotJson) {
        return version.snapshotJson;
      }
    }
    return {
      ecsVersion: ECS_VERSION,
      plotId: creation.id,
      substrateTier: creation.substrateTier,
      entities: [],
      meta: { title: creation.title },
    };
  }

  private fail(creationId: string, code: 'CAP_DENIED' | 'LOAD_TIMEOUT', detail: string): EnterCreationResponse {
    return {
      sessionId: '',
      ecsWorld: { ecsVersion: ECS_VERSION, plotId: creationId, substrateTier: 'A', entities: [] },
      isolationLevel: 'L0',
      readonlyAssetHandles: [],
      error: { error: code, detail },
    };
  }
}
