/**
 * A weekly plan on the phone (`shared/types/twin-huddle-series.ts`): the same get-together with the same friends every
 * week. Start one, end it or renew it; when invited, join or not, leave, skip next week, and set "same as usual, no need
 * to ask me". Each week's plan is an ordinary twin huddle (twinHuddle.ts) and shows up in that list. Only in builds with
 * `EXPO_PUBLIC_TWIN_HUDDLE_SERIES=1` on top of `EXPO_PUBLIC_TWIN_HUDDLE=1`; the routes answer 404 while either server
 * switch is off. No React Native import: the transport and token are injected (twinHuddleSeriesSession.ts binds them).
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  TWIN_HUDDLE_SERIES_ID_PATTERN_V0,
  TWIN_HUDDLE_SERIES_LIMITS_V0,
  decodeTwinHuddleSeriesGoneV0,
  decodeTwinHuddleSeriesListV0,
  decodeTwinHuddleSeriesStartOutcomeV0,
  decodeTwinHuddleSeriesViewV0,
  type TwinHuddleSeriesInitiatorViewV0,
  type TwinHuddleSeriesListItemV0,
  type TwinHuddleSeriesMemberViewV0,
  type TwinHuddleSeriesMineV0,
  type TwinHuddleSeriesRefusalCodeV0,
  type TwinHuddleSeriesRequestV0,
  type TwinHuddleSeriesStartOutcomeV0,
} from '../../shared/types/twin-huddle-series';
import { TWIN_HUDDLE_ENABLED, TWIN_HUDDLE_REFUSAL_COPY, TwinHuddleError, isTwinHuddleMobileEnabled, twinHuddleFailureOf, twinHuddleInvalidReason } from './twinHuddle';

// Read as a literal member expression so the Expo build inlines it.
export const TWIN_HUDDLE_SERIES_ENABLED = TWIN_HUDDLE_ENABLED && isTwinHuddleMobileEnabled(process.env.EXPO_PUBLIC_TWIN_HUDDLE_SERIES);

/** Why the server would not start a weekly plan (`{ started: false, code }`). Not an error: the form stays as it was. */
export const TWIN_HUDDLE_SERIES_REFUSAL_COPY: Record<TwinHuddleSeriesRefusalCodeV0, { en: string; zh: string }> = {
  initiator_not_opted_in: TWIN_HUDDLE_REFUSAL_COPY.initiator_not_opted_in,
  active_limit: {
    en: `You already have ${TWIN_HUDDLE_SERIES_LIMITS_V0.activePerInitiatorMax} weekly plans running. End one first.`,
    zh: `你已经有 ${TWIN_HUDDLE_SERIES_LIMITS_V0.activePerInitiatorMax} 个每周固定在进行，先结束一个。`,
  },
  none_available: { en: 'None of the people you picked can be invited right now.', zh: '选的人现在都邀请不了。' },
};

export type TwinHuddleSeriesView = TwinHuddleSeriesInitiatorViewV0 | TwinHuddleSeriesMemberViewV0;

export interface MobileTwinHuddleSeriesClient {
  start(request: TwinHuddleSeriesRequestV0): Promise<TwinHuddleSeriesStartOutcomeV0>;
  /** Everything that is still mine: started by me, or that I was invited to and have not turned down or left. */
  list(): Promise<TwinHuddleSeriesListItemV0[]>;
  get(id: string): Promise<TwinHuddleSeriesView>;
  end(id: string): Promise<TwinHuddleSeriesInitiatorViewV0>;
  renew(id: string): Promise<TwinHuddleSeriesInitiatorViewV0>;
  join(id: string, auto: boolean): Promise<TwinHuddleSeriesMemberViewV0>;
  /** After declining or leaving the plan is no longer mine: there is nothing left to show. */
  decline(id: string): Promise<void>;
  leave(id: string): Promise<void>;
  setMine(id: string, mine: TwinHuddleSeriesMineV0): Promise<TwinHuddleSeriesView>;
}

const SERIES_PATH = '/twin-huddle/series';

export function createMobileTwinHuddleSeriesClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileTwinHuddleSeriesClient {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new TwinHuddleError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${SERIES_PATH}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(method === 'GET' ? {} : { body: body ?? {} }),
      });
    } catch {
      throw new TwinHuddleError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) {
      const failure = twinHuddleFailureOf(response.status);
      throw new TwinHuddleError(failure, failure === 'invalid' ? twinHuddleInvalidReason(response.body) : undefined);
    }
    return response.body;
  };
  const read = <T>(decoded: T | null): T => {
    if (decoded === null) throw new TwinHuddleError('unreadable');
    return decoded;
  };
  const checked = (id: string): string => {
    if (!TWIN_HUDDLE_SERIES_ID_PATTERN_V0.test(id)) throw new TwinHuddleError('not_found');
    return id;
  };
  const view = async (id: string, method: 'GET' | 'POST' | 'PUT', action?: string, body?: unknown): Promise<TwinHuddleSeriesView> => {
    const decoded = read(decodeTwinHuddleSeriesViewV0(await call(method, action === undefined ? `/${checked(id)}` : `/${checked(id)}/${action}`, body)));
    if (decoded.id !== id) throw new TwinHuddleError('unreadable');
    return decoded;
  };
  const asInitiator = (decoded: TwinHuddleSeriesView): TwinHuddleSeriesInitiatorViewV0 => {
    if (decoded.role !== 'initiator') throw new TwinHuddleError('unreadable');
    return decoded;
  };
  const asMember = (decoded: TwinHuddleSeriesView): TwinHuddleSeriesMemberViewV0 => {
    if (decoded.role !== 'member') throw new TwinHuddleError('unreadable');
    return decoded;
  };
  const gone = async (id: string, action: 'decline' | 'leave'): Promise<void> => {
    read(decodeTwinHuddleSeriesGoneV0(await call('POST', `/${checked(id)}/${action}`)));
  };

  return {
    async start(request) {
      return read(decodeTwinHuddleSeriesStartOutcomeV0(await call('POST', '', request)));
    },
    async list() {
      return read(decodeTwinHuddleSeriesListV0(await call('GET', '')));
    },
    get: (id) => view(id, 'GET'),
    async end(id) {
      return asInitiator(await view(id, 'POST', 'end'));
    },
    async renew(id) {
      return asInitiator(await view(id, 'POST', 'renew'));
    },
    async join(id, auto) {
      return asMember(await view(id, 'POST', 'join', { auto }));
    },
    decline: (id) => gone(id, 'decline'),
    leave: (id) => gone(id, 'leave'),
    setMine: (id, mine) => view(id, 'PUT', 'me', mine),
  };
}
