import { Inject, Injectable, Logger } from '@nestjs/common';

import type { WorldCreationError } from '../../../../shared/types/world-creation';
import type {
  EconomyBridgeResponse,
  PlotSalesReportResponse,
} from '../../../../shared/types/world-creation-api';

import {
  PLOT_SALES_STORE,
  type PlotSaleLineItem,
  type PlotSaleRecord,
  type PlotSalesStore,
} from '../economy/plot-sales.store';
import {
  SUPERMARKET_CART_STORE,
  type SupermarketCartStore,
} from './supermarket-cart.store';
import { SupermarketEconomyBridgeService } from './supermarket-economy-bridge.service';

// ============================================================
// Checkout input / output
// ============================================================

/** {@link SupermarketService.checkout} 的输入。 */
export interface SupermarketCheckoutInput {
  /** 超市 Plot id。 */
  plotId: string;
  /** 经认证的访客用户 id（付款方）—— 绝不取自沙箱。 */
  visitorUserId: string;
  /** 访客 visitor 账户 id（购物车归属 + 扣款主体）。 */
  visitorAccountId: string;
  /** Trust_Level 3 签名确认（Marketplace 购买门控，R15.4/R7.4）。 */
  signedConfirmation?: string;
}

/** 成功结账的闭环结果。 */
export interface SupermarketCheckoutOk {
  ok: true;
  /** 服务端权威总额（AXP）。 */
  authoritativeAmount: number;
  /** 扣除的平台抽成（AXP）。 */
  platformCut: number;
  /** append 进 `state.kv:sales` 的权威销售记录（R15.5）。 */
  sale: PlotSaleRecord;
}

/** 结账失败：购买未完成，余额不变（R15.6）。 */
export interface SupermarketCheckoutFailed {
  ok: false;
  /** 结构化经济错误（来自 Economy_Bridge）。 */
  error: WorldCreationError;
  /** 面向访客的提示：购买未完成，余额未变动。 */
  message: string;
}

/** 结账结果：成功闭环或失败（余额不变）。 */
export type SupermarketCheckoutResult =
  | SupermarketCheckoutOk
  | SupermarketCheckoutFailed;

/**
 * SupermarketService — 超市结账经济闭环编排 (design §6 / §11.3, R15.3/R15.4/R15.5/R15.6)。
 *
 * 服务端编排层（host 侧执行 Substrate_DSL 结账规则的受控落地），**绝不重写经济逻辑**：
 *
 *   1. **加购**（host 执行 `state.kv` append cart）：访客拾取商品 → 经注入的
 *      {@link SupermarketCartStore} 把商品 append 进 `state.kv:cart`（scope=visitor）。
 *      购物车只存"买了什么/几个",绝不存金额 (Property 2)。
 *   2. **结账**（host 执行 `economy.requestCharge`）：经
 *      {@link SupermarketEconomyBridgeService} 服务端在 Trust_Level 3 签名下重算权威
 *      总额、入超市 owner AgentAccount（扣平台抽成）、写 `agent_cost_records`（R15.4）。
 *      金额由服务端按权威 `price` 组件重算 —— **绝不在沙箱/编排层计算** (R15.3)。
 *   3. **销售聚合**（host 执行 `state.kv` append sales）：结账成功后把一条**权威**销售
 *      记录 append 进 `state.kv:sales`（scope=plot），平台据此呈现每日报表（R15.5）。
 *   4. **失败处理**：结账服务端校验失败（Trust/签名/余额/空购物车）→ 拒绝且告知访客
 *      购买未完成,**余额不变**（由 Economy_Bridge 保证，R15.6）；购物车不清空、不写销售。
 *
 * 每日销售报表由 {@link SupermarketEconomyBridgeService}（基类 `getSalesReport`）从
 * 同一个 {@link PLOT_SALES_STORE} 读取聚合，形成闭环。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §6 Economy_Bridge, §11.3 超市
 */
@Injectable()
export class SupermarketService {
  private readonly logger = new Logger(SupermarketService.name);

  constructor(
    private readonly economyBridge: SupermarketEconomyBridgeService,
    @Inject(SUPERMARKET_CART_STORE)
    private readonly cartStore: SupermarketCartStore,
    @Inject(PLOT_SALES_STORE)
    private readonly salesStore: PlotSalesStore,
  ) {}

  /**
   * 加购：把一个商品 append 进访客购物车（host 执行 `state.kv` append cart）。
   * 不计算任何金额（Property 2）—— 仅记录 goodId + quantity。
   */
  async addToCart(
    plotId: string,
    visitorAccountId: string,
    goodId: string,
    quantity = 1,
  ): Promise<void> {
    await this.cartStore.addToCart(plotId, visitorAccountId, goodId, quantity);
  }

  /**
   * 结账经济闭环 (R15.3/R15.4/R15.5/R15.6)。
   *
   * 顺序（保证经济不变量）：
   *   (1) 经 Economy_Bridge 服务端 `requestCharge`：金额由服务端按权威 `price` 组件
   *       聚合购物车重算（沙箱不可达），Trust 门控，入 owner（扣抽成），写成本记录。
   *   (2) 失败 → 返回失败：购买未完成,余额不变（购物车保留，不写销售）。
   *   (3) 成功 → 把权威销售记录 append 进 `state.kv:sales` + 清空购物车。
   *
   * @returns 成功闭环（含权威总额/抽成/销售记录）或失败（余额不变）。
   */
  async checkout(input: SupermarketCheckoutInput): Promise<SupermarketCheckoutResult> {
    const { plotId, visitorUserId, visitorAccountId, signedConfirmation } = input;

    // (1) 服务端权威扣款（金额由服务端按权威定价聚合购物车重算 — Property 2）。
    const charge: EconomyBridgeResponse = await this.economyBridge.requestCharge(
      visitorUserId,
      {
        plotId,
        visitorAccountId,
        // amountRef 仅引用沙箱购物车状态；金额由服务端重算（绝不取此值）。
        amountRef: 'cart.total',
        signedConfirmation,
      },
    );

    // (2) 失败：购买未完成,余额不变（Economy_Bridge 保证）。购物车保留，不写销售。
    if (!charge.ok) {
      return {
        ok: false,
        error: charge.error ?? {
          error: 'ECONOMY_REJECTED',
          detail: 'Checkout charge failed',
        },
        message: '购买未完成，余额未发生变动',
      };
    }

    // (3) 成功：把权威销售记录 append 进 state.kv:sales（R15.5）+ 清空购物车。
    const lineItems: PlotSaleLineItem[] = (charge.lineItems ?? []).map((li) => ({
      goodId: li.entityId,
      units: li.quantity,
      axp: li.lineAxp,
    }));
    const sale: PlotSaleRecord = {
      plotId,
      visitorAccountId,
      lineItems,
      totalAxp: charge.authoritativeAmount ?? 0,
      ts: Date.now(),
    };

    try {
      await this.salesStore.appendSale(plotId, sale);
    } catch (err) {
      // 销售聚合写入失败不回滚已提交的经济动作（余额已正确），仅告警。
      this.logger.warn(
        `appendSale failed for plot ${plotId}: ${this.toDetail(err)} (charge already committed)`,
      );
    }

    try {
      await this.cartStore.clearCart(plotId, visitorAccountId);
    } catch (err) {
      this.logger.warn(`clearCart failed for plot ${plotId}: ${this.toDetail(err)}`);
    }

    return {
      ok: true,
      authoritativeAmount: charge.authoritativeAmount ?? 0,
      platformCut: charge.platformCut ?? 0,
      sale,
    };
  }

  /**
   * 每日销售报表 (R15.5)：从 `state.kv:sales` 聚合（委派给 Economy_Bridge 基类的
   * `getSalesReport`，二者共享同一个 {@link PLOT_SALES_STORE}）。
   */
  async getDailySalesReport(
    ownerUserId: string,
    plotId: string,
    day?: string,
  ): Promise<PlotSalesReportResponse> {
    return this.economyBridge.getSalesReport(ownerUserId, plotId, day);
  }

  private toDetail(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return 'unknown error';
  }
}
