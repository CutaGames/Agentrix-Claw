import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  ReadOnlyFetcher,
  ReadOnlyFetchRequest,
  ReadOnlyFetchResponse,
} from './data-source-plugin.types';
import {
  BROWSER_ACTION_EXECUTOR,
  BrowserActionExecutor,
  BrowserActionResult,
  OrchestratorFailureReason,
} from './task-orchestrator.types';

/**
 * BrowserReadOnlyFetcher — 默认只读采集器:经只读浏览器操作采集数据源。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C4 / 需求 8.3:尽调任务默认仅使用**只读**浏览器操作。
 *
 * 流程(均为只读,read 风险档):
 *   1. `navigate` 到目标 URL(只读打开页面);
 *   2. `browser_eval` 在页面上下文求值只读提取表达式(读取 DOM,不点击/不输入/不提交)。
 *
 * 复用 {@link BrowserActionExecutor}(默认经 desktop-sync 下发到桌面端本地 Chrome,
 * 隔离 profile)。本采集器**不执行任何写操作**;任一步失败 → 归一为结构化失败回执
 * (由插件据此标「未获取」,绝不编造)。
 */
@Injectable()
export class BrowserReadOnlyFetcher implements ReadOnlyFetcher {
  private readonly logger = new Logger(BrowserReadOnlyFetcher.name);

  constructor(
    @Inject(BROWSER_ACTION_EXECUTOR)
    private readonly executor: BrowserActionExecutor,
  ) {}

  async fetch(req: ReadOnlyFetchRequest): Promise<ReadOnlyFetchResponse> {
    const url = String(req.url ?? '').trim();
    if (!url) {
      return { success: false, failureReason: 'unknown', error: 'EMPTY_URL' };
    }

    // 1. 只读导航。
    const nav = await this.safeExecute({
      userId: req.userId,
      agentId: req.agentId,
      action: { kind: 'navigate', url, target: url },
      deviceId: req.deviceId,
      sessionId: req.sessionId,
    });
    if (!nav.success) {
      return {
        success: false,
        failureReason: nav.failureReason ?? 'unknown',
        error: nav.error ?? 'NAVIGATE_FAILED',
      };
    }

    // 2. 只读 DOM 提取。
    const read = await this.safeExecute({
      userId: req.userId,
      agentId: req.agentId,
      action: {
        kind: 'browser_eval',
        expression: req.extract,
        target: `read:${url}`,
      },
      deviceId: req.deviceId,
      sessionId: req.sessionId,
    });
    if (!read.success) {
      return {
        success: false,
        failureReason: read.failureReason ?? 'unknown',
        error: read.error ?? 'EXTRACT_FAILED',
      };
    }

    return { success: true, data: read.data };
  }

  /** 调用执行器并把抛错归一为结构化失败回执。 */
  private async safeExecute(
    params: Parameters<BrowserActionExecutor['execute']>[0],
  ): Promise<BrowserActionResult> {
    try {
      return await this.executor.execute(params);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const failureReason: OrchestratorFailureReason = /timeout|timed out/i.test(msg)
        ? 'timeout'
        : 'unknown';
      return { success: false, failureReason, error: msg };
    }
  }
}
