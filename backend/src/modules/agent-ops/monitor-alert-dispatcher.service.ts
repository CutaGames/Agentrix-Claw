import { Injectable, Logger } from '@nestjs/common';

import { OutputDispatcherService } from '../voice/output-dispatcher.service';
import { SessionFabricService } from '../voice/session-fabric.service';
import {
  MONITOR_ALERT_EVENT,
  MonitorAlert,
  MonitorAlertDeliveryResult,
} from './monitor.types';

/**
 * MonitorAlertDispatcher — 监控告警多端分发(crypto-native-agent-ops 任务 16)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C5:命中条件 → 多端推送(**复用 voice `output-dispatcher` 多端分发**)。
 *   - 需求 9.3:告警经多端(至少桌面 + 移动)送达 Agent 所有者。
 *
 * 复用 voice 的 {@link SessionFabricService}(查用户所有活跃会话 + 设备能力)与
 * {@link OutputDispatcherService}(按设备路由分发)。告警用 `notification` 输出类型,
 * 由 output-dispatcher 广播到会话内所有已连接设备(桌面 + 移动 + …),实现多端送达。
 *
 * 返回 {@link MonitorAlertDeliveryResult} 汇总实际触达的会话/设备(供需求 9.3 多端覆盖校验)。
 */
@Injectable()
export class MonitorAlertDispatcher {
  private readonly logger = new Logger(MonitorAlertDispatcher.name);

  constructor(
    private readonly fabric: SessionFabricService,
    private readonly outputDispatcher: OutputDispatcherService,
  ) {}

  /**
   * 把告警推送到 Agent 所有者的所有在线设备(多端)。
   *
   * 对该用户的每个活跃会话,经 output-dispatcher 以 `notification` 类型分发到会话内全部设备。
   */
  async deliverAlert(
    ownerId: string,
    alert: MonitorAlert,
  ): Promise<MonitorAlertDeliveryResult> {
    const sessionIds = await this.fabric.getUserSessions(ownerId);

    if (sessionIds.length === 0) {
      this.logger.debug(
        `monitor alert ${alert.subscriptionId}: owner ${ownerId} has no active device session`,
      );
      return {
        delivered: false,
        sessionsReached: 0,
        deviceTypes: [],
        deviceCount: 0,
      };
    }

    const deviceTypes = new Set<string>();
    let deviceCount = 0;
    let sessionsReached = 0;

    const data = this.buildPayload(alert);

    for (const sessionId of sessionIds) {
      const devices = await this.fabric.getSessionDevices(sessionId);
      if (devices.length === 0) continue;

      sessionsReached += 1;
      for (const d of devices) {
        deviceTypes.add(d.deviceType);
        deviceCount += 1;
      }

      // 复用 voice output-dispatcher:notification 类型 → 广播会话内全部设备(多端)。
      await this.outputDispatcher.dispatch({
        sessionId,
        event: MONITOR_ALERT_EVENT,
        data,
        kind: 'notification',
      });
    }

    const delivered = deviceCount > 0;
    this.logger.log(
      `monitor alert ${alert.subscriptionId} → owner ${ownerId}: sessions=${sessionsReached} devices=${deviceCount} types=[${[...deviceTypes].join(',')}]`,
    );

    return {
      delivered,
      sessionsReached,
      deviceTypes: [...deviceTypes],
      deviceCount,
    };
  }

  private buildPayload(alert: MonitorAlert): Record<string, any> {
    return {
      type: 'monitor_alert',
      subscriptionId: alert.subscriptionId,
      agentId: alert.agentId,
      monitorType: alert.monitorType,
      title: alert.title,
      body: alert.body,
      observations: alert.observations ?? null,
      triggeredAt: alert.triggeredAt,
    };
  }
}
