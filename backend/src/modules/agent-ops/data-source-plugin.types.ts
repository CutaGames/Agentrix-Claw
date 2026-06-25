import type { OrchestratorFailureReason } from './task-orchestrator.types';

/**
 * 尽调数据源插件框架 — 公共类型与可注入契约(crypto-native-agent-ops 任务 12)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C4「尽调报告引擎」:`DataSourcePlugin` 接口(name / fetch(target) / sourceUrl);
 *     均**只读**;失败跳过并标「未获取」,**禁止编造**(LLM prompt + 校验层双保险)。
 *   - 需求 8.1:跨预设数据源采集并产出结构化报告(含来源链接)。
 *   - 需求 8.3:此类任务默认仅使用只读浏览器操作。
 *   - 需求 8.5 / Property 7:某数据源不可达 → 跳过并标注缺失,**不得编造数据**。
 *
 * 设计要点:
 *   - 每个插件只读(read-only):经可注入的 {@link ReadOnlyFetcher} 走只读浏览器操作
 *     (navigate + browser_eval),抽象在接口后便于测试注入 mock。
 *   - 任何采集失败 → 返回 `status:'not_fetched'` + `data:null`(绝不杜撰数值);
 *     `sourceUrl` 始终保留以提供可核来源链接(即便未获取也保留引用)。
 */

/** 尽调标的类型(需求 8:token / 钱包 / 合约 / 项目)。 */
export type DueDiligenceTargetType = 'token' | 'wallet' | 'contract' | 'project';

/** 尽调标的描述。 */
export interface DueDiligenceTarget {
  type: DueDiligenceTargetType;
  /** 链标识(slug),如 'ethereum' / 'bsc' / 'base' / 'arbitrum' / 'polygon'。 */
  chain?: string;
  /** 合约 / token / 钱包地址。 */
  address?: string;
  /** 人类可读名称 / symbol。 */
  name?: string;
  /** 项目标识(官网域名 / 项目 slug,供官方/审计源使用)。 */
  project?: string;
}

/** 采集状态:已获取 / 未获取(对应需求 8.5「跳过并标注缺失」)。 */
export type DataSourceFetchStatus = 'fetched' | 'not_fetched';

/**
 * 单个数据源的采集结果。
 *
 * - `status='fetched'`:`data` 为该源采集到的结构化数据(可含部分 null 字段,
 *   表示该源未提供该字段 —— 仍为「未编造」)。
 * - `status='not_fetched'`:`data` 必为 `null`(绝不杜撰),`failureReason` 给出结构化原因。
 * - `sourceUrl` 始终保留(即便 not_fetched),作为可核来源链接(需求 8.1 / Property 7)。
 */
export interface DataSourceFetchResult {
  /** 产出该结果的插件名(`DataSourcePlugin.name`)。 */
  source: string;
  /** 该源+标的的可核来源链接(始终存在;无法构造时为空串)。 */
  sourceUrl: string;
  /** 采集状态。 */
  status: DataSourceFetchStatus;
  /** 已获取时的结构化数据;未获取时必为 null(不编造)。 */
  data: Record<string, any> | null;
  /** 数据采集时间(ISO 8601,需求 8.2 / 8.8 标注采集时间)。 */
  collectedAt: string;
  /** 未获取时的结构化失败原因。 */
  failureReason?: OrchestratorFailureReason;
  /** 人类可读备注(如未获取原因)。 */
  note?: string;
}

/** 插件执行上下文(用户 / Agent / 桌面设备路由)。 */
export interface DataSourceFetchContext {
  userId: string;
  agentId: string;
  deviceId?: string;
  sessionId?: string;
}

/**
 * 尽调数据源插件接口(design §C4:name / fetch(target) / sourceUrl;均只读)。
 *
 * 实现约束(硬):
 *   1. `fetch` **绝不抛出**:任何失败都归一为 `status:'not_fetched'` + `data:null`。
 *   2. `fetch` **绝不编造**:无法核实的数值一律不写入 data(留 null 或不写)。
 *   3. 只读:仅经 {@link ReadOnlyFetcher} 做 navigate + browser_eval,不做任何写操作。
 */
export interface DataSourcePlugin {
  /** 稳定的源标识(如 'block_explorer' / 'dex' / 'audit_source')。 */
  readonly name: string;

  /** 该插件能否处理此标的。 */
  supports(target: DueDiligenceTarget): boolean;

  /** 该标的在本源的可核来源链接(无法构造时返回空串)。 */
  sourceUrl(target: DueDiligenceTarget): string;

  /**
   * 只读采集。失败时返回 `status:'not_fetched'`(data:null),**不抛出、不编造**。
   */
  fetch(
    target: DueDiligenceTarget,
    ctx: DataSourceFetchContext,
  ): Promise<DataSourceFetchResult>;
}

/** 数据源插件集合注入令牌(multi-provider 聚合)。 */
export const DATA_SOURCE_PLUGINS = Symbol('DATA_SOURCE_PLUGINS');

// ───────────────────────── 只读采集边界(可注入 / 可 mock) ─────────────────────────

/** 只读采集请求:导航到 url,再用只读 JS 表达式从 DOM 提取数据。 */
export interface ReadOnlyFetchRequest {
  userId: string;
  agentId: string;
  /** 要导航并读取的目标 URL。 */
  url: string;
  /** 只读 JS 提取表达式(在页面上下文求值,返回可序列化结果)。 */
  extract: string;
  deviceId?: string;
  sessionId?: string;
}

/** 只读采集回执。 */
export interface ReadOnlyFetchResponse {
  success: boolean;
  /** 成功时的提取结果(原始数据,由插件归一)。 */
  data?: any;
  /** 失败时的结构化原因。 */
  failureReason?: OrchestratorFailureReason;
  /** 原始错误信息。 */
  error?: string;
}

/**
 * 只读采集器(可注入,测试可 mock)。
 *
 * 抽象「导航 + 只读 DOM 提取」:把网络/浏览器调用置于可 mock 边界后,
 * 使插件单测无需真实网络(design「Keep network calls behind an injectable boundary」)。
 * 默认实现经只读浏览器操作(navigate + browser_eval)执行。
 */
export interface ReadOnlyFetcher {
  fetch(req: ReadOnlyFetchRequest): Promise<ReadOnlyFetchResponse>;
}

/** 只读采集器注入令牌。 */
export const READ_ONLY_FETCHER = Symbol('READ_ONLY_FETCHER');
