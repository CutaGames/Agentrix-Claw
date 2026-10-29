/**
 * L8 C1 background goals on the phone (`shared/types/standing-goal.ts`): the list with progress, pause, continue, end, and
 * the one-key stop. Off unless EXPO_PUBLIC_STANDING_GOALS=1; while the server switch is off the routes answer 404 and the
 * card renders nothing. Pausing, ending and stopping only tighten, so they need no recent sign-in; continuing a goal that an
 * emergency stop paused does (403 STEP_UP_REQUIRED). Creating a goal and changing its boundary stay in the API.
 * No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { STANDING_GOAL_ERROR_CODES_V1, decodeStandingGoalListV1, decodeStandingGoalViewV1, type StandingGoalViewV1 } from '../../shared/types/standing-goal';

type Copy = { zh: string; en: string };

export function standingGoalsEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const STANDING_GOALS_ENABLED = standingGoalsEnabled(process.env.EXPO_PUBLIC_STANDING_GOALS);

/** `pass_invalid` (L8-8 L7): continuing a goal whose Pass was revoked, ran out or is gone (409 STANDING_GOAL_PASS_INVALID). */
export type StandingGoalsFailureV1 = 'closed' | 'invalid' | 'pass_invalid' | 'sign_in_again' | 'no_session' | 'unreadable' | 'unavailable';

export class StandingGoalsError extends Error {
  readonly failure: StandingGoalsFailureV1;
  constructor(failure: StandingGoalsFailureV1) {
    super(failure);
    this.name = 'StandingGoalsError';
    this.failure = failure;
  }
}

function failureOf(response: HttpResponseV1): StandingGoalsFailureV1 {
  if (response.status === 404) return 'closed';
  if (response.status === 403 && (response.body as { code?: unknown } | null)?.code === 'STEP_UP_REQUIRED') return 'sign_in_again';
  if (response.status === 409 && (response.body as { code?: unknown } | null)?.code === STANDING_GOAL_ERROR_CODES_V1.passInvalid) return 'pass_invalid';
  if (response.status === 400 || response.status === 409) return 'invalid';
  if (response.status === 401) return 'no_session';
  return 'unavailable';
}

export interface MobileStandingGoalsClientV1 {
  list(): Promise<StandingGoalViewV1[]>;
  pause(goalRef: string): Promise<StandingGoalViewV1>;
  resume(goalRef: string): Promise<StandingGoalViewV1>;
  end(goalRef: string): Promise<StandingGoalViewV1>;
  emergencyStop(): Promise<number>;
}

const GOAL_REF = /^sgl_[0-9a-f]{32}$/;

export function createMobileStandingGoalsClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileStandingGoalsClientV1 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const send = async (method: 'GET' | 'POST', path: string): Promise<HttpResponseV1> => {
    const token = deps.token();
    if (!token) throw new StandingGoalsError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
      });
    } catch {
      throw new StandingGoalsError('unavailable');
    }
    if (response.status !== 200 && response.status !== 201) throw new StandingGoalsError(failureOf(response));
    return response;
  };
  const one = (action: 'pause' | 'resume' | 'end') => async (goalRef: string): Promise<StandingGoalViewV1> => {
    if (typeof goalRef !== 'string' || !GOAL_REF.test(goalRef)) throw new StandingGoalsError('invalid');
    const view = decodeStandingGoalViewV1((await send('POST', `/standing-goals/${goalRef}/${action}`)).body);
    if (!view) throw new StandingGoalsError('unreadable');
    return view;
  };
  return {
    list: async () => {
      const list = decodeStandingGoalListV1((await send('GET', '/standing-goals')).body);
      if (!list) throw new StandingGoalsError('unreadable');
      return list.items;
    },
    pause: one('pause'),
    resume: one('resume'),
    end: one('end'),
    emergencyStop: async () => {
      const stopped = ((await send('POST', '/standing-goals/emergency-stop')).body as { stopped?: unknown } | null)?.stopped;
      if (typeof stopped !== 'number' || !Number.isInteger(stopped) || stopped < 0) throw new StandingGoalsError('unreadable');
      return stopped;
    },
  };
}

export const STANDING_GOALS_FAILURE_COPY: Readonly<Record<StandingGoalsFailureV1, Copy>> = {
  closed: { zh: '这个功能还没开放。', en: 'This is not open yet.' },
  invalid: { zh: '没成功，请稍后再试。', en: 'That did not work. Please try again.' },
  pass_invalid: {
    zh: '这个目标用的通行证已经撤销、过期或找不到了，所以不能继续。可以结束这个目标，再用一张有效的通行证新建。',
    en: 'The pass this goal uses was revoked, has expired or can no longer be found, so it cannot continue. End this goal and create it again with a valid pass.',
  },
  sign_in_again: { zh: '请重新登录后再继续。', en: 'Please sign in again to continue.' },
  no_session: { zh: '请先登录。', en: 'Sign in first.' },
  unreadable: { zh: '暂时读不到后台目标。', en: 'Background goals are unavailable right now.' },
  unavailable: { zh: '网络不稳，请稍后再试。', en: 'Network trouble. Please try again.' },
};
