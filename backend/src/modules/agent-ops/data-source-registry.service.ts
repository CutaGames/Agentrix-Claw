import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  DATA_SOURCE_PLUGINS,
  DataSourceFetchContext,
  DataSourceFetchResult,
  DataSourcePlugin,
  DueDiligenceTarget,
} from './data-source-plugin.types';

/**
 * DataSourceRegistry — 尽调数据源插件注册表 / 聚合采集器(crypto-native-agent-ops 任务 12)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C4:`DueDiligenceEngine` 输入标的 → 数据源采集插件集(均只读)→ 归一。
 *   - 需求 8.1:跨预设数据源采集(含来源链接)。
 *   - 需求 8.5 / Property 7:某数据源不可达 → **跳过并标注「未获取」,不得编造**。
 *
 * 职责:对一个标的,挑出 `supports(target)` 的插件并行采集,聚合每源结果。
 * 任一插件失败 / 抛错 → 该源结果标 `not_fetched`(data:null),不影响其它源,绝不编造。
 * 由任务 13 `DueDiligenceEngine` 消费本聚合结果生成结构化报告。
 */
@Injectable()
export class DataSourceRegistry {
  private readonly logger = new Logger(DataSourceRegistry.name);

  constructor(
    @Inject(DATA_SOURCE_PLUGINS)
    private readonly plugins: DataSourcePlugin[],
  ) {}

  /** 已注册的全部插件名。 */
  listSources(): string[] {
    return this.plugins.map((p) => p.name);
  }

  /** 对该标的可处理的插件名(supports=true)。 */
  supportedSources(target: DueDiligenceTarget): string[] {
    return this.plugins.filter((p) => this.safeSupports(p, target)).map((p) => p.name);
  }

  /**
   * 跨所有支持该标的的数据源并行采集。
   * 失败的源被标「未获取」(不抛出、不编造),始终为每个被尝试的源产出一条结果。
   */
  async fetchAll(
    target: DueDiligenceTarget,
    ctx: DataSourceFetchContext,
  ): Promise<DataSourceFetchResult[]> {
    const supported = this.plugins.filter((p) => this.safeSupports(p, target));
    if (supported.length === 0) {
      this.logger.warn(
        `No data source supports target type=${target.type} chain=${target.chain ?? '-'}`,
      );
      return [];
    }

    return Promise.all(supported.map((p) => this.fetchOne(p, target, ctx)));
  }

  /** 单源采集:插件内部已兜底 not_fetched;此处再兜一层意外抛错。 */
  private async fetchOne(
    plugin: DataSourcePlugin,
    target: DueDiligenceTarget,
    ctx: DataSourceFetchContext,
  ): Promise<DataSourceFetchResult> {
    try {
      const result = await plugin.fetch(target, ctx);
      // 防御:即便插件违约返回了 data,但 status=not_fetched,也强制 data=null(不编造)。
      if (result.status === 'not_fetched' && result.data != null) {
        return { ...result, data: null };
      }
      return result;
    } catch (err: any) {
      this.logger.warn(
        `Data source ${plugin.name} threw for target ${target.type}: ${err?.message ?? err}`,
      );
      return {
        source: plugin.name,
        sourceUrl: this.safeSourceUrl(plugin, target),
        status: 'not_fetched',
        data: null,
        collectedAt: new Date().toISOString(),
        failureReason: 'unknown',
        note: `PLUGIN_THREW: ${err?.message ?? err}`,
      };
    }
  }

  private safeSupports(plugin: DataSourcePlugin, target: DueDiligenceTarget): boolean {
    try {
      return plugin.supports(target);
    } catch {
      return false;
    }
  }

  private safeSourceUrl(plugin: DataSourcePlugin, target: DueDiligenceTarget): string {
    try {
      return plugin.sourceUrl(target) || '';
    } catch {
      return '';
    }
  }
}
