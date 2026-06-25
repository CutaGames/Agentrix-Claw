/**
 * PlotSalesStore — `state.kv:sales` (scope=plot) 销售聚合抽象 (design §6 / §11.3, R15.5)。
 *
 * Plot 体验（旗舰：超市）每笔成功结账把一条 **权威** 销售记录 append 进 `state.kv`
 * (scope=plot, key="sales")。平台据此向 Plot owner 呈现**每日销售报表**
 * （{@link EconomyBridgeService.getSalesReport}）。
 *
 * 关键不变量：销售记录里的金额是 Economy_Bridge **服务端权威重算**的结果
 * (Property 2)，不是沙箱传入值；本 store 仅负责持久化/读取这些权威记录，
 * 不做任何金额计算。
 *
 * 本接口把"向 state.kv:sales 追加/读取销售记录"抽象为一个**可注入的 KV store**，
 * 使 Economy_Bridge 既能在生产经真实 state.kv/Redis 聚合，也能在单元/集成测试用
 * 内存实现直接驱动。默认提供 {@link InMemoryPlotSalesStore}；生产可替换为接
 * state.kv/Redis 的实现并绑定到 {@link PLOT_SALES_STORE} 令牌。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §6 Economy_Bridge
 */

/** DI 令牌：注入一个 {@link PlotSalesStore} 实现。 */
export const PLOT_SALES_STORE = Symbol('PLOT_SALES_STORE');

/** 一条销售明细：商品 id + 数量 + 该明细的权威 AXP 小计。 */
export interface PlotSaleLineItem {
  /** 商品 ECS entity id。 */
  goodId: string;
  /** 售出数量。 */
  units: number;
  /** 该明细的权威 AXP 小计（服务端重算，Property 2）。 */
  axp: number;
}

/**
 * 一条权威销售记录，append 进 `state.kv:sales`。金额均来自 Economy_Bridge
 * 服务端权威结算结果（非沙箱计算）。
 */
export interface PlotSaleRecord {
  /** 销售归属的 Plot id。 */
  plotId: string;
  /** 付款访客账户 id。 */
  visitorAccountId: string;
  /** 本次销售明细。 */
  lineItems: PlotSaleLineItem[];
  /** 本次销售权威总额（AXP，= 各明细 axp 之和）。 */
  totalAxp: number;
  /** 销售发生时间（Unix epoch millis）。 */
  ts: number;
}

/**
 * `state.kv:sales` 销售记录存储抽象。实现负责把销售记录持久化/读取。
 * 实现可以是同步或异步（返回值统一以 await 兼容）。
 */
export interface PlotSalesStore {
  /** 向某 Plot 的 `state.kv:sales` 追加一条权威销售记录。 */
  appendSale(plotId: string, sale: PlotSaleRecord): Promise<void> | void;

  /** 读取某 Plot 当前 `state.kv:sales` 全部销售记录（按追加顺序）。 */
  getSales(plotId: string): Promise<PlotSaleRecord[]> | PlotSaleRecord[];
}

/**
 * 内存实现：按 plotId 维护一个追加序的销售记录列表。用于开发/测试与无外部依赖
 * 运行；生产应替换为接 state.kv/Redis 的实现（同样绑定到 {@link PLOT_SALES_STORE}）。
 */
export class InMemoryPlotSalesStore implements PlotSalesStore {
  private readonly salesByPlot = new Map<string, PlotSaleRecord[]>();

  appendSale(plotId: string, sale: PlotSaleRecord): void {
    const existing = this.salesByPlot.get(plotId) ?? [];
    existing.push(sale);
    this.salesByPlot.set(plotId, existing);
  }

  getSales(plotId: string): PlotSaleRecord[] {
    return [...(this.salesByPlot.get(plotId) ?? [])];
  }
}
