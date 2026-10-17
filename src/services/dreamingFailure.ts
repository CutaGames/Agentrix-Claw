/**
 * dreamingFailure.ts — how the dreaming screen reads a failed `/dreaming/*` answer (T7 r2, 10-16).
 *
 * The server answers 503 with `code: DREAMING_UNAVAILABLE` when the dreaming engine is not switched on. That is
 * "not available yet", not a fault: the screen says so in one plain sentence and shows no raw error. Every other
 * failure (a 5xx, a network error, anything unexpected) is "can't be read right now" with a way to try again.
 * Same rule as the desktop DreamPanel (`desktop/src/services/dreaming.ts`).
 */
import { parseApiErrorBodyV1 } from '../../shared/types/api-error';

export const DREAMING_UNAVAILABLE_CODE = 'DREAMING_UNAVAILABLE';

export type DreamingProblem = 'unavailable' | 'error';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** The error code of an answer body: the contract's top-level `code`, or one nested in `error` / `message`. */
export function dreamingErrorCode(body: unknown): string | null {
  const top = parseApiErrorBodyV1(body).code;
  if (top) return top;
  if (isRecord(body) && isRecord(body.error) && typeof body.error.code === 'string') return body.error.code;
  if (isRecord(body) && isRecord(body.message) && typeof body.message.code === 'string') return body.message.code;
  return null;
}

/** Sort a failed answer: the engine is not available yet, or something else went wrong. */
export function classifyDreamingFailure(status: number, body: unknown): DreamingProblem {
  return status === 503 && dreamingErrorCode(body) === DREAMING_UNAVAILABLE_CODE ? 'unavailable' : 'error';
}

/** Read a failed response's JSON body without throwing (an empty or non-JSON body is `null`). */
export async function readDreamingBody(response: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
