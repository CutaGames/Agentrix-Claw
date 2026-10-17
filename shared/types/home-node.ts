/**
 * Home always-on node, v0 contract only (L7-3): a Raspberry Pi or mini PC as the family Agent's home, offering local
 * inference, a Home Assistant bridge where every appliance is granted on its own, and a home network tunnel. There is
 * never a shell. It waits for the desktop N0 work to be reused as the Linux package, so nothing reads this in v0.
 */

/** Future server switch; nothing reads it in v0. */
export const HOME_NODE_V0_FLAG = 'HOME_NODE_V0_ENABLED';

export const HOME_NODE_KINDS_V0 = ['raspberry_pi', 'mini_pc'] as const;
export type HomeNodeKindV0 = (typeof HOME_NODE_KINDS_V0)[number];

export const HOME_NODE_SERVICES_V0 = ['local_inference', 'home_assistant_bridge', 'home_tunnel'] as const;
export type HomeNodeServiceV0 = (typeof HOME_NODE_SERVICES_V0)[number];

export const HOME_APPLIANCE_ACTIONS_V0 = ['read', 'turn_on', 'turn_off', 'set'] as const;
export type HomeApplianceActionV0 = (typeof HOME_APPLIANCE_ACTIONS_V0)[number];

/** Home Assistant domains where every change needs the owner's confirmation, even with a grant. */
export const HOME_CONFIRM_EACH_TIME_DOMAINS_V0 = ['lock', 'alarm_control_panel', 'cover', 'valve'] as const;

export interface HomeApplianceGrantV0 {
  /** Home Assistant entity id, for example light.kitchen; no wildcards. */
  entityId: string;
  actions: HomeApplianceActionV0[];
  /** Family member who granted it. */
  grantedBy: string;
  /** ISO time; null means until revoked. */
  expiresAt: string | null;
}

const ENTITY = /^[a-z_]{2,32}\.[a-z0-9_]{1,64}$/;
const MEMBER = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;

/** Only the three listed services; a shell, SSH or remote desktop is never offered. */
export function homeNodeServiceAllowedV0(service: string): boolean {
  return (HOME_NODE_SERVICES_V0 as readonly string[]).includes(service);
}

/** True only when a grant names exactly this entity and action and has not expired. */
export function homeApplianceActionAllowedV0(grants: readonly HomeApplianceGrantV0[], entityId: string, action: HomeApplianceActionV0, nowMs: number): boolean {
  return grants.some((g) => g.entityId === entityId && g.actions.includes(action) && (g.expiresAt === null || Date.parse(g.expiresAt) > nowMs));
}

/** Reads never ask; any change in a sensitive domain always asks. */
export function homeApplianceNeedsConfirmV0(entityId: string, action: HomeApplianceActionV0): boolean {
  if (action === 'read') return false;
  return (HOME_CONFIRM_EACH_TIME_DOMAINS_V0 as readonly string[]).includes(entityId.split('.')[0]);
}

export function decodeHomeApplianceGrantV0(value: unknown): HomeApplianceGrantV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { entityId, actions, grantedBy, expiresAt } = raw;
  if (typeof entityId !== 'string' || !ENTITY.test(entityId) || typeof grantedBy !== 'string' || !MEMBER.test(grantedBy)) return null;
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > HOME_APPLIANCE_ACTIONS_V0.length) return null;
  const kept: HomeApplianceActionV0[] = [];
  for (const action of actions) {
    if (typeof action !== 'string' || !(HOME_APPLIANCE_ACTIONS_V0 as readonly string[]).includes(action) || (kept as string[]).includes(action)) return null;
    kept.push(action as HomeApplianceActionV0);
  }
  let until: string | null = null;
  if (expiresAt !== null && expiresAt !== undefined) {
    if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return null;
    until = expiresAt;
  }
  return { entityId, actions: kept, grantedBy, expiresAt: until };
}
