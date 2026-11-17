/**
 * Confirming an answer on the owner's own phone (asking around, phase 2; `shared/types/twin-ask.ts`). When the server
 * offers it for this question (`canDeviceConfirm` with a one-time `deviceNonce`), this build has it on
 * (`EXPO_PUBLIC_TWIN_ASK_DEVICE_PROOF=1`) and this phone has a registered key (phoneDeviceKey.ts), sending an answer
 * first asks the owner to confirm on the phone; the phone key then signs the question, the answer, the one-time code
 * and the device id, and the asker sees the answer was confirmed on the person's own phone.
 *
 * - Any of the three missing: the answer goes out as before, without the mark (`unsigned`).
 * - The owner cancels, or the phone cannot sign: nothing is sent (`cancelled` / `failed`); the screen keeps the words
 *   and offers to confirm again or to send without confirming.
 * - Only the person's own answer is ever signed: a twin's answer and a link answer never are.
 *
 * No React Native import: this phone's device id and the signing call are injected (twinAskDeviceProofSession.ts).
 */
import {
  TWIN_ASK_DEVICE_ID_PATTERN_V0,
  isTwinAskDeviceNonceV0,
  twinAskAnswerDeviceMessageV0,
  type TwinAskDeviceProofV0,
  type TwinAskInvitedViewV0,
} from '../../shared/types/twin-ask';
import { PhoneDeviceKeyError } from './phoneDeviceKey';

export function isTwinAskDeviceProofMobileEnabled(value: string | undefined): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const TWIN_ASK_DEVICE_PROOF_ENABLED = isTwinAskDeviceProofMobileEnabled(process.env.EXPO_PUBLIC_TWIN_ASK_DEVICE_PROOF);

export interface TwinAskDeviceProofDeps {
  /** This phone's registered device id; null while the phone has no registered key. */
  deviceId: string | null;
  /** Asks the owner to confirm, then signs with the phone key (P-256, 86 base64url characters). Rejects with `PhoneDeviceKeyError`. */
  sign(message: string): Promise<string>;
}

export type TwinAskDeviceProofOutcome =
  | { kind: 'signed'; proof: TwinAskDeviceProofV0 }
  /** Not offered, or this phone cannot confirm: send the answer without a proof. */
  | { kind: 'unsigned' }
  /** The owner said no to the confirmation: send nothing. */
  | { kind: 'cancelled' }
  /** The phone could not sign: send nothing. */
  | { kind: 'failed' };

export type TwinAskDeviceProofOffer = Pick<TwinAskInvitedViewV0, 'id' | 'question' | 'canDeviceConfirm' | 'deviceNonce'>;

const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;

/** Whether the server offers confirming an answer to this question right now (it sends a fresh code with every view). */
export function twinAskDeviceProofOffered(view: Pick<TwinAskInvitedViewV0, 'canDeviceConfirm' | 'deviceNonce'>): boolean {
  return view.canDeviceConfirm === true && isTwinAskDeviceNonceV0(view.deviceNonce);
}

/** `text` is the answer exactly as it will be sent (the server signs off on the same words, trimmed). */
export async function twinAskDeviceProof(view: TwinAskDeviceProofOffer, text: string, deps: TwinAskDeviceProofDeps | null): Promise<TwinAskDeviceProofOutcome> {
  const nonce = view.deviceNonce;
  if (!deps || view.canDeviceConfirm !== true || !isTwinAskDeviceNonceV0(nonce)) return { kind: 'unsigned' };
  const deviceId = deps.deviceId;
  if (deviceId === null || !TWIN_ASK_DEVICE_ID_PATTERN_V0.test(deviceId)) return { kind: 'unsigned' };
  const message = twinAskAnswerDeviceMessageV0({ askId: view.id, question: view.question, text, nonce, deviceId });
  let signature: string;
  try {
    signature = await deps.sign(message);
  } catch (error) {
    return { kind: error instanceof PhoneDeviceKeyError && error.code === 'user_cancelled' ? 'cancelled' : 'failed' };
  }
  return SIGNATURE.test(signature) ? { kind: 'signed', proof: { deviceId, nonce, signature } } : { kind: 'failed' };
}

export const TWIN_ASK_DEVICE_PROOF_WORDS = {
  /** Shown by the phone's own confirmation sheet. */
  prompt: { en: 'Confirm this answer is from you', zh: '确认这条回答是你本人发的' },
  hint: {
    en: 'Sending asks you to confirm on this phone. The asker then sees your answer was confirmed on your own phone.',
    zh: '发送时会请你在这台手机上确认一下，对方会看到这条回答已在你本人的手机上确认。',
  },
  noKey: {
    en: 'This phone has no registered key yet, so the answer is sent without that confirmation.',
    zh: '这台手机还没有登记钥匙，回答会照常发出，只是不带「已在本人手机上确认」。',
  },
  cancelled: { en: 'You cancelled the confirmation. The answer has not been sent.', zh: '取消了确认，回答还没发出。' },
  failed: { en: 'This phone could not finish the confirmation. The answer has not been sent.', zh: '这台手机没能完成确认，回答还没发出。' },
  again: { en: 'Confirm again', zh: '再确认一次' },
  plain: { en: 'Send without confirming', zh: '不确认，直接发' },
} as const;
