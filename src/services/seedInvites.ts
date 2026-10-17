/**
 * L6-11 limited seed invites on mobile (`shared/types/seed-invites.ts`). Off unless EXPO_PUBLIC_SEED_INVITES=1; while the
 * server switch is off the routes answer 404 and the card shows nothing.
 *
 * No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { parseApiErrorBodyV1 } from '../../shared/types/api-error';
import {
  SEED_INVITES_ERROR_CODES_V0,
  decodeSeedInvitesViewV0,
  normalizeSeedInviteCodeV0,
  type SeedInvitesViewV0,
} from '../../shared/types/seed-invites';

type Copy = { zh: string; en: string };

export function seedInvitesEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const SEED_INVITES_ENABLED = seedInvitesEnabled(process.env.EXPO_PUBLIC_SEED_INVITES);

export type SeedInvitesFailureV0 = 'closed' | 'invalid_code' | 'not_found' | 'already_member' | 'no_session' | 'unreadable' | 'unavailable';

export class SeedInvitesError extends Error {
  readonly failure: SeedInvitesFailureV0;
  constructor(failure: SeedInvitesFailureV0) {
    super(failure);
    this.name = 'SeedInvitesError';
    this.failure = failure;
  }
}

export interface MobileSeedInvitesClientV0 {
  mine(): Promise<SeedInvitesViewV0>;
  redeem(code: string): Promise<void>;
}

function failureOf(response: HttpResponseV1): SeedInvitesFailureV0 {
  if (response.status === 404) {
    return parseApiErrorBodyV1(response.body).code === SEED_INVITES_ERROR_CODES_V0.notFound ? 'not_found' : 'closed';
  }
  const code = parseApiErrorBodyV1(response.body).code;
  if (code === SEED_INVITES_ERROR_CODES_V0.invalidCode) return 'invalid_code';
  if (code === SEED_INVITES_ERROR_CODES_V0.alreadyMember) return 'already_member';
  if (response.status === 401 || response.status === 403) return 'no_session';
  return 'unavailable';
}

export function createMobileSeedInvitesClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileSeedInvitesClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const send = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<HttpResponseV1> => {
    const token = deps.token();
    if (!token) throw new SeedInvitesError('no_session');
    try {
      return await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(body === undefined ? {} : { body }),
      });
    } catch {
      throw new SeedInvitesError('unavailable');
    }
  };
  return {
    mine: async () => {
      const response = await send('GET', '/seed-invites');
      if (response.status !== 200) throw new SeedInvitesError(failureOf(response));
      const view = decodeSeedInvitesViewV0(response.body);
      if (!view) throw new SeedInvitesError('unreadable');
      return view;
    },
    redeem: async (raw) => {
      const code = normalizeSeedInviteCodeV0(raw);
      if (!code) throw new SeedInvitesError('invalid_code');
      const response = await send('POST', '/seed-invites/redeem', { code });
      if (response.status !== 200) throw new SeedInvitesError(failureOf(response));
      if ((response.body as { member?: unknown } | null)?.member !== true) throw new SeedInvitesError('unreadable');
    },
  };
}

export function seedInviteShareLink(code: string): string {
  return `https://agentrix.top/console/settings/profile?invite=${encodeURIComponent(code)}`;
}

export const SEED_INVITES_FAILURE_COPY: Readonly<Record<SeedInvitesFailureV0, Copy>> = {
  closed: { zh: '邀请还没开放。', en: 'Invites are not open yet.' },
  invalid_code: { zh: '邀请码格式不对，是 10 位字母和数字。', en: 'That is not an invite code. Codes have 10 letters and digits.' },
  not_found: { zh: '这个邀请码不存在或已经用过了。', en: 'This invite code does not exist or has been used.' },
  already_member: { zh: '你已经加入了。', en: 'You have already joined.' },
  no_session: { zh: '请先登录。', en: 'Please sign in first.' },
  unreadable: { zh: '暂时读不到邀请信息。', en: 'Invites are unavailable right now.' },
  unavailable: { zh: '网络不稳，请稍后再试。', en: 'Network trouble. Please try again.' },
};
