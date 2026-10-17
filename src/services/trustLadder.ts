/**
 * L6-6 trust ladder on the phone (`shared/types/trust-ladder.ts`): the owner picks how far one Agent may go alone, next
 * to its D1 budget on the passport screen. Off unless EXPO_PUBLIC_TRUST_LADDER=1; while the server switch is off (or the
 * Agent is not yours) the route answers 404 and the card renders nothing.
 *
 * Raising the level to commit answers the standard 403 STEP_UP_REQUIRED, which opens StepUpSheet and retries once,
 * the same rule as the budget card. No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { parseApiErrorBodyV1 } from '../../shared/types/api-error';
import {
  TRUST_LADDER_ERROR_CODES_V0,
  decodeTrustLadderUpdateV0,
  decodeTrustLadderViewV0,
  type TrustLadderLevelV0,
  type TrustLadderUpdateV0,
  type TrustLadderViewV0,
} from '../../shared/types/trust-ladder';
import { needsStepUp } from './stepUp';

type Copy = { zh: string; en: string };

export function trustLadderEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const TRUST_LADDER_ENABLED = trustLadderEnabled(process.env.EXPO_PUBLIC_TRUST_LADDER);

export type TrustLadderFailureV0 = 'closed' | 'step_up_required' | 'stale' | 'limits_required' | 'invalid' | 'no_session' | 'unreadable' | 'unavailable';

export class TrustLadderError extends Error {
  readonly failure: TrustLadderFailureV0;
  constructor(failure: TrustLadderFailureV0) {
    super(failure);
    this.name = 'TrustLadderError';
    this.failure = failure;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failureOf(response: HttpResponseV1): TrustLadderFailureV0 {
  if (needsStepUp(response.status, response.body)) return 'step_up_required';
  const { code } = parseApiErrorBodyV1(response.body);
  if (response.status === 404) return 'closed';
  if (response.status === 409) return 'stale';
  if (code === TRUST_LADDER_ERROR_CODES_V0.limitsRequired) return 'limits_required';
  if (response.status === 400) return 'invalid';
  if (response.status === 401) return 'no_session';
  return 'unavailable';
}

export interface MobileTrustLadderClientV0 {
  read(agentAccountId: string): Promise<TrustLadderViewV0>;
  update(agentAccountId: string, update: TrustLadderUpdateV0): Promise<TrustLadderViewV0>;
}

export function createMobileTrustLadderClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileTrustLadderClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (agentAccountId: string, body?: TrustLadderUpdateV0): Promise<TrustLadderViewV0> => {
    if (typeof agentAccountId !== 'string' || !UUID.test(agentAccountId)) throw new TrustLadderError('closed');
    const token = deps.token();
    if (!token) throw new TrustLadderError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method: body ? 'PUT' : 'GET',
        path: `${base}/trust-ladder/${agentAccountId}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(body ? { body } : {}),
      });
    } catch {
      throw new TrustLadderError('unavailable');
    }
    if (response.status !== 200) throw new TrustLadderError(failureOf(response));
    const view = decodeTrustLadderViewV0(response.body);
    if (!view || view.agentAccountId.toLowerCase() !== agentAccountId.toLowerCase()) throw new TrustLadderError('unreadable');
    return view;
  };
  return {
    read: (agentAccountId) => call(agentAccountId),
    update: async (agentAccountId, update) => {
      const checked = decodeTrustLadderUpdateV0(update);
      if (checked.ok === false) throw new TrustLadderError(checked.code === TRUST_LADDER_ERROR_CODES_V0.limitsRequired ? 'limits_required' : 'invalid');
      return call(agentAccountId, checked.update);
    },
  };
}

export type TrustLadderSaveFailureV0 = TrustLadderFailureV0 | 'step_up_cancelled' | 'step_up_again';

export type TrustLadderSaveOutcomeV0 =
  | { kind: 'done'; view: TrustLadderViewV0 }
  | { kind: 'failed'; failure: TrustLadderSaveFailureV0; view: TrustLadderViewV0 | null };

/** Save once: a step-up request opens `confirmStepUp` and the same change is sent once more; a 409 reads the level again. */
export async function runTrustLadderSave(input: {
  client: MobileTrustLadderClientV0;
  agentAccountId: string;
  update: TrustLadderUpdateV0;
  confirmStepUp: () => Promise<boolean>;
}): Promise<TrustLadderSaveOutcomeV0> {
  const { client, agentAccountId, update } = input;
  const fail = async (error: unknown): Promise<TrustLadderSaveOutcomeV0> => {
    const failure: TrustLadderFailureV0 = error instanceof TrustLadderError ? error.failure : 'unavailable';
    if (failure !== 'stale') return { kind: 'failed', failure, view: null };
    try {
      return { kind: 'failed', failure, view: await client.read(agentAccountId) };
    } catch {
      return { kind: 'failed', failure, view: null };
    }
  };
  try {
    return { kind: 'done', view: await client.update(agentAccountId, update) };
  } catch (error) {
    if (!(error instanceof TrustLadderError) || error.failure !== 'step_up_required') return fail(error);
  }
  let confirmed = false;
  try {
    confirmed = await input.confirmStepUp();
  } catch {
    confirmed = false;
  }
  if (!confirmed) return { kind: 'failed', failure: 'step_up_cancelled', view: null };
  try {
    return { kind: 'done', view: await client.update(agentAccountId, update) };
  } catch (error) {
    if (error instanceof TrustLadderError && error.failure === 'step_up_required') return { kind: 'failed', failure: 'step_up_again', view: null };
    return fail(error);
  }
}

export const TRUST_LADDER_LEVEL_COPY: Readonly<Record<TrustLadderLevelV0, { label: Copy; detail: Copy }>> = {
  look: { label: { zh: '查', en: 'Look' }, detail: { zh: '只查资料，不拟草稿、不花钱。', en: 'Looks things up only. No drafts, no spending.' } },
  suggest: { label: { zh: '建议', en: 'Suggest' }, detail: { zh: '给建议；拟草稿前先问你，不花钱。', en: 'Suggests; asks before drafting. No spending.' } },
  prepare: { label: { zh: '准备', en: 'Prepare' }, detail: { zh: '可以拟好草稿；付款、预约、发送都先问你。', en: 'Drafts freely; asks before paying, booking or sending.' } },
  commit: { label: { zh: '承诺', en: 'Commit' }, detail: { zh: '在你设的限额内可以直接付款、预约、发送。', en: 'Pays, books and sends on its own within your limits.' } },
};

export const TRUST_LADDER_FAILURE_COPY: Readonly<Record<TrustLadderSaveFailureV0, Copy>> = {
  closed: { zh: '这只 Agent 的放手程度现在不能改。', en: "This Agent's level cannot be changed right now." },
  step_up_required: { zh: '要再确认一次是你本人才能放得更开。', en: 'Confirm it is you to give it more room.' },
  step_up_cancelled: { zh: '没有确认身份，档位没有改。', en: 'Identity not confirmed; the level is unchanged.' },
  step_up_again: { zh: '还是需要确认是你本人。请重新登录后再保存。', en: 'Your identity still needs confirming. Sign in again, then save.' },
  stale: { zh: '预算刚在别处改过，下面是现在的设置。请看一眼再保存。', en: 'The budget was just changed elsewhere; below is what it is now. Check it, then save again.' },
  limits_required: { zh: '「承诺」要填好四个限额：单笔 ≤ 每天 ≤ 每月，免批准额度 ≤ 单笔。', en: 'Commit needs all four limits: single <= daily <= monthly, no-approval <= single.' },
  invalid: { zh: '这组设置不合规则，没有保存。', en: 'These settings break the rules, so nothing was saved.' },
  no_session: { zh: '请先登录。', en: 'Sign in first.' },
  unreadable: { zh: '暂时读不到放手程度。', en: 'The level cannot be read right now.' },
  unavailable: { zh: '没有保存成功，请稍后再试。', en: 'That did not save. Try again later.' },
};
