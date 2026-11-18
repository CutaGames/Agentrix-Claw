/**
 * Where to go, on the phone (`shared/types/twin-huddle-places.ts`): the candidate places on one twin huddle. The
 * organizer adds up to three and settles on one before choosing the time; an invited person may add one and marks the
 * ones that work for them. Only in builds with `EXPO_PUBLIC_TWIN_HUDDLE_PLACES=1` on top of `EXPO_PUBLIC_TWIN_HUDDLE=1`;
 * the routes answer 404 while either server switch is off. No React Native import: the transport and token are injected
 * (twinHuddlePlacesSession.ts binds them).
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { TWIN_HUDDLE_ID_PATTERN_V0, type TwinHuddlePersonV0 } from '../../shared/types/twin-huddle';
import {
  TWIN_HUDDLE_PLACES_LIMITS_V0,
  TWIN_HUDDLE_PLACE_CONFLICT_CODES_V0,
  decodeTwinHuddlePlaceAddV0,
  decodeTwinHuddlePlacesViewV0,
  type TwinHuddlePlaceConflictCodeV0,
  type TwinHuddlePlaceV0,
  type TwinHuddlePlacesViewV0,
} from '../../shared/types/twin-huddle-places';
import { TWIN_HUDDLE_ENABLED, TWIN_HUDDLE_FAILURE_COPY, TwinHuddleError, isTwinHuddleMobileEnabled, twinHuddleFailureOf, twinHuddleInvalidReason } from './twinHuddle';

// Read as a literal member expression so the Expo build inlines it.
export const TWIN_HUDDLE_PLACES_ENABLED = TWIN_HUDDLE_ENABLED && isTwinHuddleMobileEnabled(process.env.EXPO_PUBLIC_TWIN_HUDDLE_PLACES);

type Words = { en: string; zh: string };

const L = TWIN_HUDDLE_PLACES_LIMITS_V0;

/** What the server says when a change no longer fits (HTTP 409 with `{ code }`). */
export const TWIN_HUDDLE_PLACE_CONFLICT_COPY: Record<TwinHuddlePlaceConflictCodeV0, Words> = {
  places_closed: { en: 'The place can no longer be changed.', zh: '地点现在不能改了。' },
  place_limit: { en: 'You have added as many places as you can.', zh: '你能填的地点已经填满了。' },
  duplicate_place: { en: 'That place is already on the list.', zh: '这个地点已经在列表里了。' },
  place_chosen: { en: 'This place has been settled on, so it cannot be removed.', zh: '这个地点已经定下来了，不能删。' },
  place_gone: { en: 'That place was just removed.', zh: '这个地点刚被删掉了。' },
};

const NAME_RULES: Words = {
  en: 'A place name cannot contain prices, contact details, a street address or a link.',
  zh: '店名里不能有价钱、联系方式、门牌地址或链接。',
};
const NAME_LENGTH: Words = { en: `A place name is ${L.labelMin} to ${L.labelMax} characters.`, zh: `店名要 ${L.labelMin} 到 ${L.labelMax} 个字。` };

/** A failed places call. `conflict` says which rule a 409 applied; null when the server did not say, or for other failures. */
export class TwinHuddlePlaceError extends TwinHuddleError {
  readonly conflict: TwinHuddlePlaceConflictCodeV0 | null;
  constructor(failure: TwinHuddleError['failure'], options: { reason?: ConstructorParameters<typeof TwinHuddleError>[1]; conflict?: TwinHuddlePlaceConflictCodeV0 | null } = {}) {
    super(failure, options.reason);
    this.name = 'TwinHuddlePlaceError';
    this.conflict = options.conflict ?? null;
  }
}

function isConflict(value: unknown): value is TwinHuddlePlaceConflictCodeV0 {
  return typeof value === 'string' && (TWIN_HUDDLE_PLACE_CONFLICT_CODES_V0 as readonly string[]).includes(value);
}

/** Reads the property rather than the class, so it also holds where `instanceof` on a subclass of Error does not. */
export function twinHuddlePlaceConflictOf(error: unknown): TwinHuddlePlaceConflictCodeV0 | null {
  const code = typeof error === 'object' && error !== null ? (error as { conflict?: unknown }).conflict : undefined;
  return isConflict(code) ? code : null;
}

/** What to say about a place name before sending it; null when it would be accepted. The server applies the same rules. */
export function twinHuddlePlaceLabelProblem(label: string): Words | null {
  const decoded = decodeTwinHuddlePlaceAddV0({ label });
  if (decoded.ok === false) return decoded.reasonCode === 'text_violation' ? NAME_RULES : NAME_LENGTH;
  return null;
}

export function twinHuddlePlaceFailureWords(error: unknown): Words {
  const conflict = twinHuddlePlaceConflictOf(error);
  if (conflict) return TWIN_HUDDLE_PLACE_CONFLICT_COPY[conflict];
  if (!(error instanceof TwinHuddleError)) return TWIN_HUDDLE_FAILURE_COPY.unavailable;
  if (error.failure === 'invalid' && error.field === 'body.label') return error.reasonCode === 'text_violation' ? NAME_RULES : NAME_LENGTH;
  return TWIN_HUDDLE_FAILURE_COPY[error.failure];
}

/** Who added a place. The organizer sees which friend (their own name for them); invited people only see "a friend". */
export function twinHuddlePlaceByWords(place: Pick<TwinHuddlePlaceV0, 'by' | 'byRef'>, people: readonly TwinHuddlePersonV0[] = []): Words {
  if (place.by === 'me') return { en: 'Added by you', zh: '我填的' };
  if (place.by === 'initiator') return { en: 'Added by the organizer', zh: '发起人填的' };
  const person = place.byRef ? people.find((item) => item.ref === place.byRef) : undefined;
  return person ? { en: `Added by ${person.label}`, zh: `${person.label}填的` } : { en: 'Added by a friend', zh: '一位朋友填的' };
}

export function twinHuddlePlaceOkWords(okCount: number): Words {
  if (okCount <= 0) return { en: 'Nobody has marked it yet', zh: '还没有人标' };
  return { en: okCount === 1 ? '1 person can make it' : `${okCount} people can make it`, zh: `${okCount} 位可以` };
}

/** The line under the heading: what this person can do here now, or how it ended. */
export function twinHuddlePlacesHintWords(view: Pick<TwinHuddlePlacesViewV0, 'role' | 'open' | 'places'>): Words {
  const chosen = view.places.find((place) => place.chosen);
  if (!view.open) {
    return chosen ? { en: `The place is settled: ${chosen.label}.`, zh: `地点定了：${chosen.label}。` } : { en: 'No place was settled for this one.', zh: '这次没有定地点。' };
  }
  if (view.role === 'initiator') {
    return {
      en: 'Settle the place first, then choose the time. Once you choose the time, the place cannot be changed.',
      zh: '先定地点，再选时间；选了时间以后地点就不能改了。',
    };
  }
  return {
    en: 'Mark the places that work for you; the organizer settles on one. You can add one of your own.',
    zh: '标出你可以的店，由发起人来定。你也可以填一个。',
  };
}

/** My marks after tapping one place: the whole set goes to the server each time. */
export function twinHuddlePlacePicksToggled(places: readonly Pick<TwinHuddlePlaceV0, 'id' | 'ok'>[], placeId: string): string[] {
  return places.filter((place) => (place.id === placeId ? !place.ok : place.ok)).map((place) => place.id);
}

export interface MobileTwinHuddlePlacesClient {
  get(huddleId: string): Promise<TwinHuddlePlacesViewV0>;
  add(huddleId: string, label: string): Promise<TwinHuddlePlacesViewV0>;
  remove(huddleId: string, placeId: string): Promise<TwinHuddlePlacesViewV0>;
  /** The places that work for me, as a whole set; an empty list clears my marks. */
  setPicks(huddleId: string, placeIds: readonly string[]): Promise<TwinHuddlePlacesViewV0>;
  /** Settle on one place, or pass null to leave it open. */
  choose(huddleId: string, placeId: string | null): Promise<TwinHuddlePlacesViewV0>;
}

const HUDDLE_PATH = '/twin-huddle';

export function createMobileTwinHuddlePlacesClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileTwinHuddlePlacesClient {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const checked = (id: string): string => {
    if (!TWIN_HUDDLE_ID_PATTERN_V0.test(id)) throw new TwinHuddlePlaceError('not_found');
    return id;
  };
  const call = async (huddleId: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<TwinHuddlePlacesViewV0> => {
    const id = checked(huddleId);
    const token = deps.token();
    if (!token) throw new TwinHuddlePlaceError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${HUDDLE_PATH}/${id}/places${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(method === 'GET' || method === 'DELETE' ? {} : { body: body ?? {} }),
      });
    } catch {
      throw new TwinHuddlePlaceError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) {
      const failure = twinHuddleFailureOf(response.status);
      const code = typeof response.body === 'object' && response.body !== null ? (response.body as { code?: unknown }).code : undefined;
      throw new TwinHuddlePlaceError(failure, {
        reason: failure === 'invalid' ? twinHuddleInvalidReason(response.body) : undefined,
        conflict: failure === 'changed' && isConflict(code) ? code : null,
      });
    }
    const view = decodeTwinHuddlePlacesViewV0(response.body);
    if (view === null || view.huddleId !== id) throw new TwinHuddlePlaceError('unreadable');
    return view;
  };

  return {
    get: (huddleId) => call(huddleId, 'GET', ''),
    add: (huddleId, label) => call(huddleId, 'POST', '', { label }),
    async remove(huddleId, placeId) {
      return call(huddleId, 'DELETE', `/${checked(placeId)}`);
    },
    setPicks: (huddleId, placeIds) => call(huddleId, 'PUT', '/picks', { placeIds: [...placeIds] }),
    choose: (huddleId, placeId) => call(huddleId, 'PUT', '/chosen', { placeId }),
  };
}
