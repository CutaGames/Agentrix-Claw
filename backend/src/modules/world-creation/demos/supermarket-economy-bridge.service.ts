import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { EcsWorld } from '../../../../shared/types/world-creation';
import type { RequestChargeRequest } from '../../../../shared/types/world-creation-api';

import { WorldPlot } from '../entities/world-plot.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { AgentCostRecord } from '../../../entities/agent-cost-record.entity';
import { EcsWorldService } from '../services/ecs-world.service';
import { AxpService } from '../../axp/axp.service';
import { TrustGateService } from '../economy/trust-gate.service';
import {
  PLOT_SALES_STORE,
  type PlotSalesStore,
} from '../economy/plot-sales.store';
import type { ProposedLineItem } from '../economy/authoritative-pricing';
import { EconomyBridgeService } from '../services/economy-bridge.service';
import {
  SUPERMARKET_CART_STORE,
  type SupermarketCartStore,
} from './supermarket-cart.store';

/**
 * SupermarketEconomyBridgeService — 超市结账的 server-authoritative 经济桥
 * (design §6, R15.3/R15.4)。
 *
 * 继承 {@link EconomyBridgeService} 并**仅** override 一个扩展点
 * {@link resolveProposedLineItems}：把访客的 `state.kv:cart`（多商品购物车）聚合为
 * line items（entityId + quantity）。其余权威逻辑（Trust 门控、按 ECS_World 的
 * 声明式 `price` 组件重算金额、入 owner AgentAccount 扣平台抽成、写
 * `agent_cost_records`、失败不改余额）全部复用基类，**绝不重写经济不变量**。
 *
 * 不可协商不变量 (Property 2, R15.3)：override 只决定 *买什么/几个*；*多少钱* 永远
 * 由基类 `priceLineItems` 按权威定价重算。购物车里不存任何金额，沙箱传入的
 * `displayHintAmount` 仅作 hint 留痕，绝不参与记账。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §6 Economy_Bridge
 */
@Injectable()
export class SupermarketEconomyBridgeService extends EconomyBridgeService {
  constructor(
    @InjectRepository(WorldPlot)
    plotRepo: Repository<WorldPlot>,
    @InjectRepository(AgentAccount)
    agentAccountRepo: Repository<AgentAccount>,
    @InjectRepository(AgentCostRecord)
    costRecordRepo: Repository<AgentCostRecord>,
    ecsWorldService: EcsWorldService,
    axpService: AxpService,
    trustGate: TrustGateService,
    @Inject(SUPERMARKET_CART_STORE)
    private readonly cartStore: SupermarketCartStore,
    @Optional()
    @Inject(PLOT_SALES_STORE)
    salesStore?: PlotSalesStore,
  ) {
    super(
      plotRepo,
      agentAccountRepo,
      costRecordRepo,
      ecsWorldService,
      axpService,
      trustGate,
      salesStore,
    );
  }

  /**
   * 超市购物车聚合 (R15.3)：把访客的 `state.kv:cart` 聚合成 *提议的* line items。
   *
   * **绝不读取价格** —— 仅返回 `goodId`（= 权威 ECS_World 中带 `price` 组件的商品
   * entity id）+ quantity；基类随后用 `priceLineItems` 按权威 `price.axp` 重算金额。
   *
   * 同步读取访客购物车（购物车存于实例内存，design "实例内存 + state.kv 落库"）。
   * 空购物车 → 返回 `[]` → 基类 `priceLineItems` 返回 null → charge 被拒
   * （ECONOMY_REJECTED），不改动任何余额 (R15.6)。
   */
  protected override resolveProposedLineItems(
    _world: EcsWorld,
    req: RequestChargeRequest,
  ): ProposedLineItem[] {
    const cart = this.cartStore.getCart(req.plotId, req.visitorAccountId);
    return cart.map((line) => ({ entityId: line.goodId, quantity: line.quantity }));
  }
}
