import { Injectable, Logger } from '@nestjs/common';

import { DesktopSyncService } from '../desktop-sync/desktop-sync.service';
import { DesktopCommandStatus } from '../desktop-sync/dto/desktop-sync.dto';
import {
  BrowserAction,
  BrowserActionExecutor,
  BrowserActionResult,
  OrchestratorFailureReason,
} from './task-orchestrator.types';

/** 命令终态集合。 */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  DesktopCommandStatus.COMPLETED,
  DesktopCommandStatus.FAILED,
  DesktopCommandStatus.REJECTED,
]);

const DEFAULT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;

/**
 * DesktopBrowserActionExecutor — 经 desktop-sync 命令通道下发 CDP 浏览器动作的默认执行器。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C2:执行落点在桌面端(用户本地 Chrome,隔离 profile),后端只下发任务计划 + 收集结果。
 *   - 复用既有桌面↔后端通道(参见 openclaw-proxy.service.ts executeDesktopTool 模式)。
 *
 * 把单步 {@link BrowserAction} 映射为 `computer_use_browser_*` 桌面命令:
 *   - browser_eval   → computer-use-browser-eval(JS 读取 DOM,锚定首选)
 *   - click_selector → computer-use-browser-click-selector(选择器点击)
 *   - navigate       → computer-use-browser-navigate
 *   - pixel_click    → computer-use-click(P1 像素降级)
 *
 * 桌面客户端轮询取命令、执行、回填结果;本执行器轮询命令终态并把回执归一为
 * {@link BrowserActionResult}(含结构化失败原因)。
 */
@Injectable()
export class DesktopBrowserActionExecutor implements BrowserActionExecutor {
  private readonly logger = new Logger(DesktopBrowserActionExecutor.name);

  constructor(private readonly desktopSync: DesktopSyncService) {}

  async execute(params: {
    userId: string;
    agentId: string;
    action: BrowserAction;
    deviceId?: string;
    sessionId?: string;
  }): Promise<BrowserActionResult> {
    const mapped = this.mapAction(params.action);
    if (!mapped) {
      return {
        success: false,
        failureReason: 'unknown',
        error: `Unsupported action kind: ${params.action.kind}`,
      };
    }

    const created = await this.desktopSync.createCommand(params.userId, {
      title: mapped.title,
      kind: mapped.kind as any,
      payload: mapped.payload,
      targetDeviceId: params.deviceId,
      sessionId: params.sessionId,
    });

    const commandId: string | undefined = created?.command?.commandId;
    if (!commandId) {
      return {
        success: false,
        failureReason: 'unknown',
        error: 'Failed to create desktop command',
      };
    }

    const cmd = await this.waitForTerminal(
      params.userId,
      commandId,
      params.deviceId,
    );
    return this.normalizeResult(cmd);
  }

  /** 轮询命令直至终态或超时。 */
  private async waitForTerminal(
    userId: string,
    commandId: string,
    deviceId?: string,
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < DEFAULT_TIMEOUT_MS) {
      const commands = await this.desktopSync.listCommands(userId, deviceId);
      const cmd = commands.find((c: any) => c.commandId === commandId);
      if (cmd && TERMINAL_STATUSES.has(cmd.status)) {
        return cmd;
      }
      await this.sleep(POLL_INTERVAL_MS);
    }
    return { status: 'timeout' };
  }

  /** 把桌面命令终态回执归一为结构化结果。 */
  private normalizeResult(cmd: any): BrowserActionResult {
    if (!cmd || cmd.status === 'timeout') {
      return { success: false, failureReason: 'timeout', error: 'Desktop command timed out' };
    }
    if (cmd.status === DesktopCommandStatus.COMPLETED) {
      const result = cmd.result ?? {};
      // 桌面回执可能在 result.error 携带失败(命令完成但工具内部失败)。
      if (result && result.error) {
        return {
          success: false,
          failureReason: this.classifyError(String(result.error)),
          error: String(result.error),
          raw: result,
        };
      }
      return { success: true, data: result, raw: result };
    }
    if (cmd.status === DesktopCommandStatus.REJECTED) {
      return { success: false, failureReason: 'blocked', error: 'Command rejected by user', raw: cmd };
    }
    // FAILED 或其它
    const errMsg = String(cmd.error ?? 'Desktop command failed');
    return {
      success: false,
      failureReason: this.classifyError(errMsg),
      error: errMsg,
      raw: cmd,
    };
  }

  /** 从错误文本推断结构化失败原因。 */
  private classifyError(message: string): OrchestratorFailureReason {
    const m = message.toLowerCase();
    if (/selector|not found|no element|no such element/.test(m)) {
      return 'selector_miss';
    }
    if (/timeout|timed out/.test(m)) {
      return 'timeout';
    }
    if (/detached|stale|dom|navigation|changed/.test(m)) {
      return 'dom_changed';
    }
    if (/blocked|forbidden|denied|captcha|rejected|403|429/.test(m)) {
      return 'blocked';
    }
    return 'unknown';
  }

  /** BrowserAction → desktop-sync 命令(kind/payload/title)。 */
  private mapAction(
    action: BrowserAction,
  ): { kind: string; payload: Record<string, unknown>; title: string } | null {
    switch (action.kind) {
      case 'browser_eval': {
        const expression = String(action.expression ?? '').trim();
        return {
          kind: 'computer-use-browser-eval',
          payload: {
            ...(action.targetId ? { targetId: action.targetId } : {}),
            expression,
          },
          title: `Browser eval: ${expression.slice(0, 80)}`,
        };
      }
      case 'click_selector': {
        const selector = String(action.selector ?? '').trim();
        return {
          kind: 'computer-use-browser-click-selector',
          payload: {
            ...(action.targetId ? { targetId: action.targetId } : {}),
            selector,
          },
          title: `Browser click: ${selector}`,
        };
      }
      case 'navigate': {
        const url = String(action.url ?? '').trim();
        return {
          kind: 'computer-use-browser-navigate',
          payload: { url },
          title: `Open in browser: ${url.slice(0, 80)}`,
        };
      }
      case 'pixel_click': {
        return {
          kind: 'computer-use-click',
          payload: { x: Number(action.x), y: Number(action.y) },
          title: `Click at (${action.x}, ${action.y})`,
        };
      }
      default:
        return null;
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
