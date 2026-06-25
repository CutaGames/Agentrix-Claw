import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { DesktopAnalyticsEventEntity } from '../../entities/desktop-analytics-event.entity';

export interface IncomingAnalyticsEvent {
  deviceId: string;
  userId?: string | null;
  sessionId?: string | null;
  eventName: string;
  eventProps?: Record<string, unknown> | null;
  appVersion: string;
  osPlatform?: string | null;
  occurredAt: number;
}

const ALLOWED_EVENT_NAMES = new Set([
  // Desktop (Sprint G-2)
  'desktop_launch',
  'desktop_login',
  'desktop_onboarding_complete',
  'desktop_first_chat',
  'desktop_first_pet_view',
  'desktop_form_switch',
  // Mobile (Sprint M-P2-2)
  'mobile_launch',
  'mobile_login',
  'mobile_onboarding_complete',
  'mobile_first_chat',
  'mobile_first_pet_view',
  'mobile_first_nfc',
  'mobile_first_toy_pair',
  'mobile_axp_redeem',
  'mobile_subscribe_open',
  'mobile_iap_purchase',
]);

@Injectable()
export class DesktopAnalyticsService {
  constructor(
    @InjectRepository(DesktopAnalyticsEventEntity)
    private readonly eventsRepo: Repository<DesktopAnalyticsEventEntity>,
  ) {}

  async ingest(events: IncomingAnalyticsEvent[]): Promise<{ accepted: number; rejected: number }> {
    let accepted = 0;
    let rejected = 0;
    const rows: Partial<DesktopAnalyticsEventEntity>[] = [];

    for (const e of events.slice(0, 200)) {
      if (!isAllowed(e)) {
        rejected += 1;
        continue;
      }
      rows.push({
        deviceIdHash: sha256(e.deviceId),
        userId: e.userId || null,
        sessionId: e.sessionId || null,
        eventName: e.eventName,
        eventProps: sanitizeProps(e.eventProps),
        appVersion: e.appVersion,
        osPlatform: e.osPlatform || null,
        occurredAt: new Date(e.occurredAt),
      });
      accepted += 1;
    }

    if (rows.length > 0) {
      await this.eventsRepo.insert(rows as DesktopAnalyticsEventEntity[]);
    }

    return { accepted, rejected };
  }
}

function isAllowed(e: any): boolean {
  if (!e || typeof e !== 'object') return false;
  if (typeof e.deviceId !== 'string' || e.deviceId.length === 0) return false;
  if (typeof e.eventName !== 'string') return false;
  if (!ALLOWED_EVENT_NAMES.has(e.eventName)) return false;
  if (typeof e.appVersion !== 'string') return false;
  if (typeof e.occurredAt !== 'number' || !Number.isFinite(e.occurredAt)) return false;
  return true;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Strip anything that smells like raw user content. Whitelist primitive
 * keys we actually care about.
 */
const PROP_KEY_WHITELIST = new Set([
  'method',     // login method
  'mode',       // chat mode (ask/agent/plan)
  'from',       // form transition
  'to',
  'platform',
  'is_first_run',
  'instance_count',
  'session_seconds',
  // Mobile-specific keys (Sprint M-P2-2)
  'os_version',     // android_14 / ios_17 (already truncated)
  'tier',           // subscription tier on subscribe_open
  'iap_product',    // axp_pack_100 etc.
  'item_id',        // axp redeem item
  'soul_id',        // mobile_pet first switch
]);

function sanitizeProps(props: unknown): Record<string, unknown> | null {
  if (!props || typeof props !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
    if (!PROP_KEY_WHITELIST.has(k)) continue;
    if (typeof v === 'string') {
      out[k] = v.slice(0, 64);
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    } else if (typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return Object.keys(out).length === 0 ? null : out;
}
