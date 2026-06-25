import { Injectable, Logger } from '@nestjs/common';

import type {
  EcsWorld,
  LogicModuleRef,
  WorldCreationError,
} from '../../../../shared/types/world-creation';
import type {
  CreationDispatchDecision,
  CreationSurface,
  CreationTaskDto,
  EconomyBridgeResponse,
  ReadonlyAssetHandle,
} from '../../../../shared/types/world-creation-api';

import { CreationTaskService } from '../services/creation-task.service';
import { SandboxService } from '../services/sandbox.service';
import {
  EconomyBridgeService,
} from '../services/economy-bridge.service';
import {
  IdentityResolverService,
  type AssetImportAuthorization,
} from '../services/identity-resolver.service';
import { resolveCreationRouting } from '../services/creation-routing';
import {
  scanLogicModule,
  computeModuleHash,
  toModerationError,
  type ScanOptions,
} from '../moderation/static-code-scan';
import type {
  ResourceSample,
  SandboxTerminationEvent,
} from '../sandbox/resource-watchdog';
import {
  generateTowerDefense,
  translateTickIntents,
  towerUpgradeEntityId,
  TD_CONTINUE_ENTITY_ID,
  type HostCapabilityCall,
  type TowerDefenseGeneratorOptions,
  type TowerDefenseTickOutput,
} from './tower-defense-generator';
import {
  resolveTowerDefensePlayability,
  type TowerDefenseDeviceProfile,
  type TowerDefensePlayPlan,
} from './tower-defense-playability';

// ============================================================
// Creation (Tier_C dispatch) input / output
// ============================================================

/** {@link TowerDefenseService.createTowerDefense} 的输入。 */
export interface TowerDefenseCreateInput {
  /** 发起创作的用户 id。 */
  userId: string;
  /** 创作发起的端 (mobile/desktop/web)，驱动 Tier_C 派发路由 (R17.1)。 */
  surface: CreationSurface;
  /** 塔防生成选项 (plotId 必填)。 */
  options: TowerDefenseGeneratorOptions;
  /** Mobile Tier_C 被强制派发时的目标偏好 (desktop/agent，默认 desktop)。 */
  dispatchTarget?: 'desktop' | 'agent';
}

/** 创作在本端 (desktop/agent/web) 直接生成 Tier_C 世界。 */
export interface TowerDefenseGeneratedResult {
  outcome: 'generated';
  /** 生成的 Tier_C ECS_World。 */
  ecsWorld: EcsWorld;
  /** 路由决策 (mustDispatch=false)。 */
  dispatch: CreationDispatchDecision;
}

/** Mobile Tier_C 创作被强制派发为 Creation_Task 到 Desktop/Agent (R17.1)。 */
export interface TowerDefenseDispatchedResult {
  outcome: 'dispatched';
  /** 入队的 Creation_Task。 */
  task: CreationTaskDto;
  /** 路由决策 (mustDispatch=true，含目标与原因)。 */
  dispatch: CreationDispatchDecision;
}

/** 塔防创作结果：本端生成或被派发到 Desktop/Agent。 */
export type TowerDefenseCreateResult =
  | TowerDefenseGeneratedResult
  | TowerDefenseDispatchedResult;

// ============================================================
// WASM tick application output (host applies intents — R17.2)
// ============================================================

/** 单条主机受控应用的能力调用结果。 */
export interface TowerDefenseAppliedCall {
  /** 翻译自 WASM 意图的能力调用 (仅 scene.* / ui.*)。 */
  call: HostCapabilityCall;
  /** 该能力经沙箱 deny-by-default 分派是否被授权应用。 */
  ok: boolean;
  /** 被拒时的结构化错误 (CAP_DENIED 等)。 */
  error?: WorldCreationError;
}

// ============================================================
// Economy (R17.4) — AXP tower upgrade / continue
// ============================================================

/** What kind of in-run AXP purchase the player is making (R17.4). */
export type TowerDefensePurchaseKind = 'upgrade' | 'continue';

/** {@link TowerDefenseService.requestUpgradeCharge} 的输入。 */
export interface TowerDefenseUpgradeChargeInput {
  /** 经认证的玩家用户 id（付款方）—— 绝不取自沙箱。 */
  userId: string;
  /** 塔防 Plot id。 */
  plotId: string;
  /** 玩家 visitor 账户 id（扣款主体）。 */
  visitorAccountId: string;
  /** 购买类型：升级塔 or 续关（continue）。 */
  kind: TowerDefensePurchaseKind;
  /** 升级目标塔的 def id（kind='upgrade' 时必填，用于解析权威升级定价实体）。 */
  towerId?: string;
  /** Trust_Level 3 签名确认（Marketplace 购买门控，R17.4/R7.4）。 */
  signedConfirmation?: string;
  /**
   * 沙箱传入的展示金额（仅 hint，服务端忽略记账，Property 2）。透传给
   * Economy_Bridge 仅用于留痕，绝不参与权威金额计算。
   */
  displayHintAmount?: number;
}

// ============================================================
// Publish-time static scan + bytecode hash lock (R17.6)
// ============================================================

/** {@link TowerDefenseService.prepareForPublish} 的选项。 */
export interface TowerDefensePublishScanOptions extends ScanOptions {
  /**
   * 每个 Tier_C 逻辑模块的审核源码，按 `moduleId` 索引。发布流程提供，使
   * `static_code_scan` 阶段能扫描真实字节码并锁定其 hash（design §10.2/§3.3，R17.6）。
   */
  logicModuleSources: Record<string, string>;
}

/** 发布前 C 级静态扫描 + hash 锁定的结果。 */
export type TowerDefensePublishPrep =
  | {
      /** 扫描通过：返回锁定了 hash、reviewStatus=passed 的世界。 */
      passed: true;
      /** 锁定后的 ECS_World（logicModules[].hash 锁定、reviewStatus=passed）。 */
      world: EcsWorld;
    }
  | {
      /** 扫描失败：阻断发布，报具体阶段与原因（R17.6/R10.3）。 */
      passed: false;
      /** 结构化 MODERATION_REJECTED 错误。 */
      error: WorldCreationError;
    };

/**
 * TowerDefenseService — C 级塔防创作派发 + WASM 意图受控应用 + 经济 / 资产英雄 /
 * 发布扫描 / 运行时守卫 / 设备适配编排 (design §11.2, R17)。
 *
 * 服务端编排层，**复用而非重建**：生成走纯 {@link generateTowerDefense}，派发走
 * {@link CreationTaskService}，意图应用与资源守卫走 {@link SandboxService}，经济走
 * server-authoritative {@link EconomyBridgeService}，资产英雄走
 * {@link IdentityResolverService}，发布扫描走 {@link scanLogicModule} +
 * {@link computeModuleHash}。本服务自身不实现经济/沙箱/扫描/身份逻辑。
 *
 *   1. **创作派发 (R17.1)**：复用 {@link resolveCreationRouting} —— Mobile 发起的
 *      Tier_C 创作 **强制** 入队为 Creation_Task 派发到 Desktop/Agent。
 *   2. **WASM 意图受控应用 (R17.2)**：波次/寻路/弹道在 L2 WASM 经 `compute.run`
 *      执行，**仅返回意图**；经 {@link translateTickIntents} 翻译为白名单
 *      `scene.*`/`ui.*` 再经 SandboxService deny-by-default 受控应用。
 *   3. **塔防经济 (R17.4)**：AXP 升级塔 / 续关经 {@link requestUpgradeCharge} 由
 *      Economy_Bridge **服务端** Trust 门控执行；金额由服务端按权威 `price` 组件
 *      重算，沙箱传值仅 hint（Property 2）。
 *   4. **World_Asset 英雄 (R17.5)**：玩家用拥有的 World_Asset 作英雄 / 塔时经
 *      {@link bindHeroAsset} / {@link listAvailableHeroes} 由 Cross_Experience_Identity
 *      提供只读 handle（无所有权凭证）；未拥有即拒。
 *   5. **发布前静态扫描 + hash 锁定 (R17.6)**：{@link prepareForPublish} 对 WASM
 *      逻辑模块跑 C 级静态扫描，过审则锁定 hash、置 reviewStatus=passed；不过则阻断发布。
 *   6. **运行时 Resource_Watchdog (R17.7)**：{@link recordResourceSample} 经
 *      SandboxService 强制 CPU/内存/帧预算，超限终止实例并将玩家返回地图。
 *   7. **Mobile 设备适配 (R17.8)**：{@link resolvePlayability} 受设备档约束决定
 *      可玩 / 降级 / 桌面替代（复用 10.3 语义）。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §11.2 Tower Defense
 */
@Injectable()
export class TowerDefenseService {
  private readonly logger = new Logger(TowerDefenseService.name);

  constructor(
    private readonly creationTasks: CreationTaskService,
    private readonly sandbox: SandboxService,
    private readonly economyBridge: EconomyBridgeService,
    private readonly identityResolver: IdentityResolverService,
  ) {}

  /**
   * 创作一个 Tier_C 塔防游戏 (R17.1)。
   *
   * 复用 {@link resolveCreationRouting} 做派发决策：
   *  - Mobile + Tier_C → `mustDispatch`：入队 Creation_Task 到 Desktop/Agent，
   *    不在 Mobile 执行 Tier_C 创作 (R17.1)。生成选项随 `input` 保留以便目标端执行。
   *  - 其余 (Desktop/Agent/web) → 本端直接经 {@link generateTowerDefense} 生成世界。
   */
  async createTowerDefense(
    input: TowerDefenseCreateInput,
  ): Promise<TowerDefenseCreateResult> {
    const { userId, surface, options, dispatchTarget } = input;
    const decision = resolveCreationRouting(surface, 'C', dispatchTarget);

    if (decision.mustDispatch) {
      // Mobile Tier_C：强制派发为 Creation_Task 到 Desktop/Agent (R17.1)。
      const target = decision.target === 'agent' ? 'agent' : 'desktop';
      const { task } = await this.creationTasks.submit(userId, {
        plotId: options.plotId,
        target,
        substrateTier: 'C',
        input: { kind: 'tower_defense', options },
      });
      this.logger.debug(
        `tower-defense Tier_C creation dispatched to ${target} (task=${task.taskId})`,
      );
      return { outcome: 'dispatched', task, dispatch: decision };
    }

    // Desktop/Agent/web：本端直接生成 Tier_C 世界。
    const ecsWorld = generateTowerDefense(options);
    return { outcome: 'generated', ecsWorld, dispatch: decision };
  }

  /**
   * 受控应用一帧 WASM `tick` 的意图 (R17.2，design §11.2)。
   *
   * WASM 经 `compute.run` 执行后 **只返回意图**；本方法把意图经
   * {@link translateTickIntents} 翻译为白名单 `scene.*`/`ui.*` 调用，再逐条经
   * {@link SandboxService.dispatchCapability} 在 deny-by-default 下受控分派应用。
   * WASM 永不直接触碰场景 —— 每个副作用都流经此主机受控边界。
   *
   * @param sessionId 运行中的沙箱会话 id
   * @param output WASM tick 返回的意图
   * @returns 每条翻译后的能力调用及其受控应用结果 (是否授权 / 拒因)
   */
  async applyTick(
    sessionId: string,
    output: TowerDefenseTickOutput,
  ): Promise<TowerDefenseAppliedCall[]> {
    const calls = translateTickIntents(output);
    const applied: TowerDefenseAppliedCall[] = [];

    for (const call of calls) {
      const result = await this.sandbox.dispatchCapability(
        sessionId,
        call.cap,
        call.args,
      );
      applied.push({ call, ok: result.ok, error: result.error });
    }

    return applied;
  }

  // ============================================================
  // R17.4 — Server-authoritative AXP tower upgrade / continue
  // ============================================================

  /**
   * 塔防经济：AXP 升级塔 / 续关，由 Economy_Bridge **服务端** Trust 门控执行 (R17.4)。
   *
   * 不可协商不变量 (Property 2)：本方法 **不计算任何金额**。它仅把购买映射为一个
   * 权威定价实体引用 (`amountRef`：升级 → `upgrade_<towerId>`，续关 → `continue`)，
   * 转发给 {@link EconomyBridgeService.requestCharge}。Economy_Bridge 在 Trust_Level 3
   * 签名下按塔防世界的声明式 `price` 组件 **重算权威金额**，忽略沙箱传入的
   * `displayHintAmount`，扣款 / 入 owner（扣抽成）/ 写 `agent_cost_records`。失败拒绝
   * 且不改动任何余额。
   *
   * @returns Economy_Bridge 的 server-authoritative 结果（含权威金额 / 抽成 / 错误）
   */
  async requestUpgradeCharge(
    input: TowerDefenseUpgradeChargeInput,
  ): Promise<EconomyBridgeResponse> {
    const { userId, plotId, visitorAccountId, kind, towerId } = input;

    if (kind === 'upgrade' && !towerId) {
      return {
        ok: false,
        error: {
          error: 'ECONOMY_REJECTED',
          detail: 'towerId is required to charge a tower upgrade',
        },
      };
    }

    // 解析权威定价实体引用（绝不取价格 —— 仅引用 *买什么*）。
    const amountRef =
      kind === 'upgrade' ? towerUpgradeEntityId(towerId as string) : TD_CONTINUE_ENTITY_ID;

    this.logger.debug(
      `tower-defense ${kind} charge → Economy_Bridge (plot=${plotId} amountRef=${amountRef}, ` +
        `sandbox hint=${input.displayHintAmount ?? 'n/a'} ignored)`,
    );

    // 服务端权威扣款：金额由 Economy_Bridge 按权威 price 组件重算（Property 2）。
    return this.economyBridge.requestCharge(userId, {
      plotId,
      visitorAccountId,
      amountRef,
      displayHintAmount: input.displayHintAmount,
      signedConfirmation: input.signedConfirmation,
    });
  }

  // ============================================================
  // R17.5 — World_Asset heroes via Cross_Experience_Identity
  // ============================================================

  /**
   * 列出玩家可作英雄 / 塔的拥有 World_Asset（R17.5）。
   *
   * 经 {@link IdentityResolverService.resolveReadonlyHandles} 解析进入者拥有的资产为
   * **只读 handle**（无所有权凭证），并仅保留 `worldAsset` 类（可作英雄塔的资产体系）。
   * 跨 Plot 移动时身份与资产随行，无需重建。
   */
  async listAvailableHeroes(
    userId: string,
    plotId: string,
  ): Promise<ReadonlyAssetHandle[]> {
    const handles = await this.identityResolver.resolveReadonlyHandles(userId, plotId);
    return handles.filter((h) => h.kind === 'worldAsset');
  }

  /**
   * 把玩家拥有的 World_Asset 绑定为英雄 / 塔（R17.5）。
   *
   * 经 {@link IdentityResolverService.authorizeAssetImport} 在 **服务端** 校验所有权：
   * 拥有 → 返回剥离凭证的只读 handle；未拥有 → 结构化 `ASSET_NOT_OWNED` 拒绝，
   * 沙箱无法伪造所有权。
   */
  async bindHeroAsset(
    userId: string,
    assetId: string,
  ): Promise<AssetImportAuthorization> {
    return this.identityResolver.authorizeAssetImport(userId, assetId);
  }

  // ============================================================
  // R17.6 — Pre-publish C-tier static scan + bytecode hash lock
  // ============================================================

  /**
   * 发布前对塔防的 WASM 逻辑模块跑 C 级静态代码扫描，过审则锁定 hash、置
   * reviewStatus=passed（R17.6，design §10.2/§3.3）。
   *
   * 对每个 `logicModules[]`：
   *  - 缺少可审核源码（无法验证）→ 阻断发布。
   *  - {@link scanLogicModule} 命中四类违规（能力滥用 / 动态求值 / 资源炸弹 /
   *    出网白名单外）→ 阻断发布并报具体类别 + 行列 + 原因（R10.3）。
   *  - 通过 → 用 {@link computeModuleHash} 锁定审核源码 hash 并置 reviewStatus=passed，
   *    运行时据此防发布后替换字节码。
   *
   * 纯函数式：深拷贝输入世界，不修改入参。任一模块不过即整体阻断。
   */
  prepareForPublish(
    world: EcsWorld,
    opts: TowerDefensePublishScanOptions,
  ): TowerDefensePublishPrep {
    const sources = opts.logicModuleSources ?? {};
    const scanOpts: ScanOptions = {
      egressAllowedHosts: opts.egressAllowedHosts,
      resourceBombThreshold: opts.resourceBombThreshold,
    };

    const modules = world.logicModules ?? [];
    const lockedModules: LogicModuleRef[] = [];

    for (const mod of modules) {
      const source = sources[mod.moduleId];
      if (typeof source !== 'string') {
        return {
          passed: false,
          error: {
            error: 'MODERATION_REJECTED',
            detail: `[static_code_scan] logic module "${mod.moduleId}": no reviewable source for static scan`,
          },
        };
      }

      const result = scanLogicModule(source, mod.capabilities ?? [], scanOpts);
      if (!result.passed) {
        return { passed: false, error: toModerationError(mod.moduleId, result) };
      }

      // 通过 → 锁定审核源码 hash + reviewStatus=passed（防发布后替换）。
      lockedModules.push({
        ...mod,
        hash: computeModuleHash(source),
        reviewStatus: 'passed',
      });
    }

    const lockedWorld: EcsWorld = {
      ...world,
      entities: world.entities.map((e) => ({ ...e })),
      logicModules: lockedModules,
    };

    this.logger.log(
      `tower-defense pre-publish scan passed: ${lockedModules.length} module(s) hash-locked (plot=${world.plotId})`,
    );
    return { passed: true, world: lockedWorld };
  }

  // ============================================================
  // R17.7 — Runtime Resource_Watchdog enforcement
  // ============================================================

  /**
   * 运行时强制资源预算（R17.7）：把一帧资源样本（L1：frameMs/heartbeat；
   * L2：fuel/epoch + 内存）经 {@link SandboxService.recordResourceSample} 喂给
   * Resource_Watchdog。超出 CPU / 内存 / 帧预算即终止该塔防实例并通知玩家
   * “体验因超出资源被停止”，将玩家返回地图（外层保持可响应，R6.6/R6.7）。
   *
   * @returns 终止事件（已超限）或 null（仍在预算内 / 会话未知）
   */
  async recordResourceSample(
    sessionId: string,
    sample: ResourceSample,
  ): Promise<SandboxTerminationEvent | null> {
    return this.sandbox.recordResourceSample(sessionId, sample);
  }

  // ============================================================
  // R17.8 — Mobile device-profile playability (degrade / desktop)
  // ============================================================

  /**
   * 决定已发布的 Tier_C 塔防在某设备上如何启动（R17.8）。
   *
   * 复用 task 10.3 的设备分档语义（{@link resolveTowerDefensePlayability}）：
   * Desktop/web 总可实例化；Mobile 受设备档约束（high 档 + 支持 3D + 未降级才满档可玩），
   * 否则无法实例化 —— 提供降级模式或桌面替代路径。
   */
  resolvePlayability(profile: TowerDefenseDeviceProfile): TowerDefensePlayPlan {
    return resolveTowerDefensePlayability(profile);
  }
}
