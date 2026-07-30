/**
 * growthEvents — 移动端统一增长归因事件上报（unified-growth-attribution-layer）。
 *
 * fire-and-forget:失败绝不阻断分享/系统分享主流程。走公开端点 `POST /v1/growth/event`
 * (activation 为服务端专属,不在此上报)。与 buildShareIntent 配套:分享成功回调里发 `share`。
 */
import { apiFetch } from './api';
import type { ShareSourceType } from './shareIntent';

export type GrowthClientEvent =
  | 'share'
  | 'landing_view'
  | 'conversion'
  | 'reshare'
  // ── world-growth-mobile-experience task 6.3 · R4.6:Tap_Through 埋点 ──
  // Tap_Through_Success_Rate = enter_success / enter_attempt。两者均 fire-and-forget
  // 上报到统一漏斗端点(sourceType='creation', sourceEntityId=creationId),供 task 10.1
  // 计算点进成功率;不阻断进入主流程。
  | 'enter_attempt'
  | 'enter_success'
  // ── world-growth-mobile-experience task 7.3 · R5.6:Order_Success 埋点 ──
  // Order_Success_Rate = order_success / order_attempt。两者均 fire-and-forget
  // 上报到统一漏斗端点(sourceType='creation', sourceEntityId=creationId),供 task 10.1
  // 计算下单成功率;绝不阻断/抛错进入下单主流程。
  //   - `order_attempt`:用户在详情/体验内确认购买,发起服务端权威结算;
  //   - `order_success`:服务端权威结算成功(purchaseCreation 返回 ok)。
  | 'order_attempt'
  | 'order_success';

export interface RecordGrowthArgs {
  eventType: GrowthClientEvent;
  attributionRef?: string;
  sourceType?: ShareSourceType;
  sourceEntityId?: string;
  channel?: string;
  /** 附带的自由元数据(后端 `/v1/growth/event` 透传落库)。 */
  metadata?: Record<string, unknown>;
}

/** 上报一次增长事件(fire-and-forget)。 */
export function recordGrowthEvent(args: RecordGrowthArgs): void {
  try {
    void apiFetch('/v1/growth/event', {
      method: 'POST',
      body: JSON.stringify(args),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * recordTapThrough — Tap_Through 埋点(task 6.3 · R4.6)。
 *
 * 在两个时点各发一次 fire-and-forget 事件,供 Tap_Through_Success_Rate 计算:
 *   - `attempt`:用户在详情页点击「进入/进去逛逛」;
 *   - `success`:Creation_Experience 成功打开会话(enterCreation 返回有效 session)。
 *
 * 绝不阻断/抛错进入主流程(委托 {@link recordGrowthEvent} 的 fire-and-forget 语义)。
 */
export function recordTapThrough(phase: 'attempt' | 'success', creationId: string): void {
  recordGrowthEvent({
    eventType: phase === 'attempt' ? 'enter_attempt' : 'enter_success',
    sourceType: 'creation',
    sourceEntityId: creationId,
    channel: 'tap_through',
  });
}

/**
 * recordOrderOutcome — Order_Success 埋点(task 7.3 · R5.6)。
 *
 * 在两个时点各发一次 fire-and-forget 事件,供 Order_Success_Rate 计算:
 *   - `attempt`:用户在详情/体验内确认购买,发起服务端权威结算(purchaseCreation 调用前);
 *   - `success`:服务端权威结算成功(purchaseCreation 返回 ok)。
 *
 * Order_Success_Rate = order_success / order_attempt。可选携带 offeringId/qty/amount
 * 元数据供后端归因。绝不阻断/抛错进入下单主流程(委托 {@link recordGrowthEvent} 的
 * fire-and-forget 语义)。
 */
export function recordOrderOutcome(
  phase: 'attempt' | 'success',
  creationId: string,
  meta?: { offeringId?: string; qty?: number; amount?: number },
): void {
  recordGrowthEvent({
    eventType: phase === 'attempt' ? 'order_attempt' : 'order_success',
    sourceType: 'creation',
    sourceEntityId: creationId,
    channel: 'order',
    metadata: meta && Object.keys(meta).length > 0 ? meta : undefined,
  });
}
