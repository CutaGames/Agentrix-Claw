/**
 * Confirming an answer on the owner's own phone: the phone signs exactly the text the server will check, only when the
 * server offers it and this phone has a registered key; otherwise the answer goes out unsigned, and a cancelled or
 * failed confirmation sends nothing.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { twinAskAnswerDeviceMessageV0 } from '../../../shared/types/twin-ask';
import { PhoneDeviceKeyError } from '../phoneDeviceKey';
import {
  TWIN_ASK_DEVICE_PROOF_WORDS,
  isTwinAskDeviceProofMobileEnabled,
  twinAskDeviceProof,
  twinAskDeviceProofOffered,
  type TwinAskDeviceProofDeps,
  type TwinAskDeviceProofOffer,
} from '../twinAskDeviceProof';

const ID = '0b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d';
const QUESTION = '附近哪家面馆好吃？';
const ANSWER = '我常去巷子口那家';
const NONCE = '2026-11-16T08:00:00.000Z';
const PHONE = `dev_${'c'.repeat(32)}`;
const SIGNATURE = `${'Ab_-'.repeat(21)}Cd`;
const CJK = /[\u3400-\u9fff]/;

const offer = (patch: Partial<TwinAskDeviceProofOffer> = {}): TwinAskDeviceProofOffer => ({ id: ID, question: QUESTION, canDeviceConfirm: true, deviceNonce: NONCE, ...patch });

function phone(patch: Partial<TwinAskDeviceProofDeps> = {}) {
  const sign = jest.fn(async (_message: string) => SIGNATURE);
  return { sign, deps: { deviceId: PHONE, sign, ...patch } as TwinAskDeviceProofDeps };
}

describe('confirming an answer on the phone', () => {
  it('is on only when the build sets EXPO_PUBLIC_TWIN_ASK_DEVICE_PROOF=1', () => {
    expect(isTwinAskDeviceProofMobileEnabled('1')).toBe(true);
    for (const value of [undefined, '', '0', 'true', ' 1']) expect(isTwinAskDeviceProofMobileEnabled(value)).toBe(false);
  });

  it('signs the question, the answer, the one-time code and this phone, and hands back the proof to send', async () => {
    const { sign, deps } = phone();
    expect(SIGNATURE).toHaveLength(86);
    await expect(twinAskDeviceProof(offer(), ANSWER, deps)).resolves.toEqual({ kind: 'signed', proof: { deviceId: PHONE, nonce: NONCE, signature: SIGNATURE } });
    expect(sign.mock.calls).toEqual([[twinAskAnswerDeviceMessageV0({ askId: ID, question: QUESTION, text: ANSWER, nonce: NONCE, deviceId: PHONE })]]);
    // The words themselves are not in what is signed, only their digests: the prompt never shows them elsewhere.
    expect(sign.mock.calls[0][0]).not.toContain(ANSWER);
    expect(sign.mock.calls[0][0].split('\n')).toHaveLength(6);
  });

  it('sends the answer unsigned, without asking, when confirming is not offered or this phone cannot do it', async () => {
    const cases: [string, TwinAskDeviceProofOffer, TwinAskDeviceProofDeps | null][] = [
      ['build has it off or no key module', offer(), null],
      ['server does not offer it', offer({ canDeviceConfirm: undefined, deviceNonce: undefined }), phone().deps],
      ['server says no', offer({ canDeviceConfirm: false }), phone().deps],
      ['no code', offer({ deviceNonce: undefined }), phone().deps],
      ['malformed code', offer({ deviceNonce: 'a b' }), phone().deps],
      ['phone has no registered key', offer(), phone({ deviceId: null }).deps],
      ['device id of another kind', offer(), phone({ deviceId: 'android:3f2a9c' }).deps],
    ];
    for (const [name, view, deps] of cases) {
      expect([name, await twinAskDeviceProof(view, ANSWER, deps)]).toEqual([name, { kind: 'unsigned' }]);
      if (deps) expect(deps.sign).not.toHaveBeenCalled();
    }
    expect(twinAskDeviceProofOffered(offer())).toBe(true);
    expect(twinAskDeviceProofOffered(offer({ canDeviceConfirm: false }))).toBe(false);
    expect(twinAskDeviceProofOffered(offer({ deviceNonce: undefined }))).toBe(false);
  });

  it('sends nothing when the owner cancels or the phone cannot sign', async () => {
    const failing = (error: unknown) => phone({ sign: jest.fn(async (_message: string): Promise<string> => Promise.reject(error)) }).deps;
    await expect(twinAskDeviceProof(offer(), ANSWER, failing(new PhoneDeviceKeyError('user_cancelled')))).resolves.toEqual({ kind: 'cancelled' });
    await expect(twinAskDeviceProof(offer(), ANSWER, failing(new PhoneDeviceKeyError('sign_failed')))).resolves.toEqual({ kind: 'failed' });
    await expect(twinAskDeviceProof(offer(), ANSWER, failing(new Error('user_cancelled')))).resolves.toEqual({ kind: 'failed' });
    // Something that is not a P-256 signature is never sent as one.
    for (const bad of ['', SIGNATURE.slice(1), `${SIGNATURE}A`, `${SIGNATURE.slice(0, 85)}=`]) {
      await expect(twinAskDeviceProof(offer(), ANSWER, phone({ sign: jest.fn(async (_message: string) => bad) }).deps)).resolves.toEqual({ kind: 'failed' });
    }
  });

  it('has Chinese and English words for every line the screen shows', () => {
    const words = Object.values(TWIN_ASK_DEVICE_PROOF_WORDS);
    expect(words).toHaveLength(7);
    for (const copy of words) {
      expect(copy.en.length).toBeGreaterThan(0);
      expect(copy.zh).toMatch(CJK);
    }
    expect(TWIN_ASK_DEVICE_PROOF_WORDS.cancelled.zh).toBe('取消了确认，回答还没发出。');
  });
});
