import { Logger } from '@nestjs/common';

import {
  DataSourceFetchContext,
  DataSourceFetchResult,
  DataSourcePlugin,
  DueDiligenceTarget,
  ReadOnlyFetcher,
} from '../data-source-plugin.types';
import type { OrchestratorFailureReason } from '../task-orchestrator.types';

/**
 * BaseDataSourcePlugin — 数据源插件抽象基类,统一兜住「失败跳过标未获取 + 不编造」契约。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C4 / 需求 8.5 / Property 7。
 *
 * 子类只需实现:
 *   - `name` / `supports` / `sourceUrl`;
 *   - `buildExtractExpression(target)`:只读 DOM 提取表达式;
 *   - `normalize(raw, target)`:把原始提取结果归一为结构化字段(**只搬运、不编造**)。
 *
 * 基类 `fetch` 负责:
 *   - 无法构造来源链接 / 不支持的标的 → 直接标「未获取」;
 *   - 经只读采集器取数,任一失败 → 标「未获取」(data:null);
 *   - normalize 抛错或返回空 → 标「未获取」;
 *   - **绝不抛出**(异常一律转 not_fetched),**绝不杜撰数值**。
 */
export abstract class BaseDataSourcePlugin implements DataSourcePlugin {
  abstract readonly name: string;
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly fetcher: ReadOnlyFetcher) {}

  abstract supports(target: DueDiligenceTarget): boolean;
  abstract sourceUrl(target: DueDiligenceTarget): string;

  /** 只读 DOM 提取表达式(在页面上下文求值)。 */
  protected abstract buildExtractExpression(target: DueDiligenceTarget): string;

  /**
   * 把只读采集到的原始数据归一为结构化字段。
   * 约束:**只搬运可核实的字段**;无法核实者留空(null / 不写),绝不编造。
   * 若原始数据完全无可用字段,应返回 `null`(基类据此标「未获取」)。
   */
  protected abstract normalize(
    raw: any,
    target: DueDiligenceTarget,
  ): Record<string, any> | null;

  async fetch(
    target: DueDiligenceTarget,
    ctx: DataSourceFetchContext,
  ): Promise<DataSourceFetchResult> {
    const sourceUrl = this.safeSourceUrl(target);

    // 无法构造来源链接(标的信息不足)→ 未获取。
    if (!sourceUrl) {
      return this.notFetched('', 'unknown', 'NO_SOURCE_URL: 标的信息不足以构造来源链接');
    }

    let raw: any;
    try {
      const res = await this.fetcher.fetch({
        userId: ctx.userId,
        agentId: ctx.agentId,
        url: sourceUrl,
        extract: this.buildExtractExpression(target),
        deviceId: ctx.deviceId,
        sessionId: ctx.sessionId,
      });
      if (!res.success) {
        return this.notFetched(
          sourceUrl,
          res.failureReason ?? 'unknown',
          res.error ?? 'FETCH_FAILED',
        );
      }
      raw = res.data;
    } catch (err: any) {
      // 采集器意外抛错:保守标未获取(绝不编造)。
      return this.notFetched(sourceUrl, 'unknown', String(err?.message ?? err));
    }

    // 归一:只搬运可核实字段;无可用数据 → 未获取。
    let normalized: Record<string, any> | null;
    try {
      normalized = this.normalize(raw, target);
    } catch (err: any) {
      return this.notFetched(sourceUrl, 'unknown', `NORMALIZE_ERROR: ${err?.message ?? err}`);
    }

    if (normalized == null || Object.keys(normalized).length === 0) {
      return this.notFetched(sourceUrl, 'unknown', 'EMPTY_DATA: 源未返回可用数据');
    }

    return {
      source: this.name,
      sourceUrl,
      status: 'fetched',
      data: normalized,
      collectedAt: this.now(),
    };
  }

  /** 构造「未获取」结果:data 必为 null(不编造),保留 sourceUrl 作为可核引用。 */
  protected notFetched(
    sourceUrl: string,
    failureReason: OrchestratorFailureReason,
    note: string,
  ): DataSourceFetchResult {
    return {
      source: this.name,
      sourceUrl,
      status: 'not_fetched',
      data: null,
      collectedAt: this.now(),
      failureReason,
      note,
    };
  }

  /** sourceUrl 计算异常也不抛出。 */
  private safeSourceUrl(target: DueDiligenceTarget): string {
    try {
      return this.sourceUrl(target) || '';
    } catch {
      return '';
    }
  }

  /** 采集时间(可被测试覆盖)。 */
  protected now(): string {
    return new Date().toISOString();
  }
}
