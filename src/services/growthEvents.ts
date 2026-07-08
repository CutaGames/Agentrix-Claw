/**
 * growthEvents — 移动端统一增长归因事件上报（unified-growth-attribution-layer）。
 *
 * fire-and-forget:失败绝不阻断分享/系统分享主流程。走公开端点 `POST /v1/growth/event`
 * (activation 为服务端专属,不在此上报)。与 buildShareIntent 配套:分享成功回调里发 `share`。
 */
import { apiFetch } from './api';
import type { ShareSourceType } from './shareIntent';

export type GrowthClientEvent = 'share' | 'landing_view' | 'conversion' | 'reshare';

export interface RecordGrowthArgs {
  eventType: GrowthClientEvent;
  attributionRef?: string;
  sourceType?: ShareSourceType;
  sourceEntityId?: string;
  channel?: string;
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
