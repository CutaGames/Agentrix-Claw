/**
 * L8-6 wallet origin `/wallet/setup/` (design 5.1 steps 3-5, S11c): the owner chooses how the money comes back if the
 * wallet passkey is lost: a recovery code made on this page (12 words, shown once, three of them typed back) and / or
 * guardians (other people's wallet addresses), and whether to register the Agent on chain in the same signature.
 *
 * - The page only reads the account from this device's record L (`setup-flow.ts`); the link is a pointer.
 * - The 12 words live in this component's state from "generate" until the owner typed three of them back, and are never
 *   stored, sent or put in a link. Only their derived address goes into L and into the way back to the main site.
 * - "Continue" writes L to match the final choice and goes to the main site's fixed page with public data only; that
 *   page prepares the UserOp with the owner's login and opens the approve page, where the wallet passkey signs.
 */
import React, { useEffect, useState } from 'react';
import { walletOriginProblemV1, type OwnWalletBuildConfigV1 } from '../../lib/own-wallet/config';
import { OWN_WALLET_PAGE_COPY_ZH_V1 as PAGE, OWN_WALLET_SETUP_COPY_ZH_V1 as COPY, setupRefusalLineV1 } from '../../lib/own-wallet/copy';
import { readSetupLinkV1, type OwnWalletSetupLinkV1 } from '../../lib/own-wallet/links';
import type { OwnWalletLocalRecordV1, OwnWalletLocalStorePortV1 } from '../../lib/own-wallet/local-store';
import { generateRecoveryCodeV1, recoveryCodeBackfillOkV1, recoveryCodeCheckIndexesV1 } from '../../lib/own-wallet/recovery-code';
import { commitSetupV1, loadSetupRecordV1, parseGuardianLinesV1, planSetupGuardiansV1, setupMainOriginProblemV1, type OwnWalletSetupPlanV1 } from '../../lib/own-wallet/setup-flow';

export interface OwnWalletSetupViewDepsV1 {
  config: OwnWalletBuildConfigV1;
  locationOrigin: string;
  hash: string;
  store: OwnWalletLocalStorePortV1;
  random: (length: number) => Uint8Array;
  /** Goes to the main site (`window.location.assign`); tests record the address. */
  navigate: (url: string) => void;
}

type OkPlan = Extract<OwnWalletSetupPlanV1, { ok: true }>;
type Basis = { link: OwnWalletSetupLinkV1; record: OwnWalletLocalRecordV1; humans: string[]; threshold: number | null; register: boolean };

type View =
  | { step: 'loading' }
  | { step: 'form'; link: OwnWalletSetupLinkV1; record: OwnWalletLocalRecordV1; problem?: string }
  | ({ step: 'code'; phrase: string; address: string } & Basis)
  | ({ step: 'backfill'; phrase: string; address: string; indexes: number[]; wrong?: boolean } & Basis)
  | { step: 'review'; link: OwnWalletSetupLinkV1; record: OwnWalletLocalRecordV1; register: boolean; plan: OkPlan; codeAddress: string | null; busy?: boolean; problem?: string }
  | { step: 'leaving'; url: string }
  | { step: 'refused'; reasonCode: string };

/** Only used to check the guardian input before a code exists; the real address replaces it in the final plan. */
const PLACEHOLDER_CODE = `0x${'c0de'.repeat(10)}`;

const shortOf = (address: string): string => `${address.slice(0, 8)}…${address.slice(-6)}`;

export function SetupView({ deps }: { deps: OwnWalletSetupViewDepsV1 }) {
  const [view, setView] = useState<View>({ step: 'loading' });
  const [useCode, setUseCode] = useState(true);
  const [useGuardians, setUseGuardians] = useState(false);
  const [guardianText, setGuardianText] = useState('');
  const [thresholdText, setThresholdText] = useState('');
  const [registerChoice, setRegisterChoice] = useState<boolean | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  useEffect(() => {
    let live = true;
    const show = (v: View) => {
      if (live) setView(v);
    };
    (async () => {
      const problem = walletOriginProblemV1(deps.config, deps.locationOrigin) ?? setupMainOriginProblemV1(deps.config.mainOrigin);
      if (problem) return show({ step: 'refused', reasonCode: problem });
      const link = readSetupLinkV1(deps.hash);
      if (link.ok === false) return show({ step: 'refused', reasonCode: link.reasonCode });
      const loaded = await loadSetupRecordV1(link.value, { chainId: deps.config.chainId, store: deps.store });
      if (loaded.ok === false) return show({ step: 'refused', reasonCode: loaded.reasonCode });
      return show({ step: 'form', link: link.value, record: loaded.record });
    })().catch(() => show({ step: 'refused', reasonCode: 'store_unavailable' }));
    return () => {
      live = false;
    };
  }, [deps]);

  const next = (current: Extract<View, { step: 'form' }>) => {
    const { link, record } = current;
    const humans = useGuardians ? parseGuardianLinesV1(guardianText) : { ok: true as const, list: [] as string[] };
    if (humans.ok === false) return setView({ ...current, problem: humans.reasonCode });
    let threshold: number | null = null;
    if (useGuardians && thresholdText.trim() !== '') {
      if (!/^[0-9]{1,2}$/.test(thresholdText.trim())) return setView({ ...current, problem: 'guardian_threshold_invalid' });
      threshold = Number(thresholdText.trim());
    }
    // Checked before a single word is shown: the owner should not copy a phrase down and then learn the input was wrong.
    const pre = planSetupGuardiansV1({ account: link.account, recoveryCodeAddress: useCode ? PLACEHOLDER_CODE : null, humans: humans.list, threshold });
    if (pre.ok === false) return setView({ ...current, problem: pre.reasonCode });
    const register = link.register && (registerChoice ?? true);
    const basis: Basis = { link, record, humans: humans.list, threshold, register };
    if (!useCode) return setView({ step: 'review', link, record, register, plan: pre, codeAddress: null });
    const made = generateRecoveryCodeV1(deps.random);
    setAnswers({});
    return setView({ step: 'code', phrase: made.phrase, address: made.address, ...basis });
  };

  const toBackfill = (current: Extract<View, { step: 'code' }>) => {
    setAnswers({});
    setView({ ...current, step: 'backfill', indexes: recoveryCodeCheckIndexesV1(deps.random) });
  };

  const checkBackfill = (current: Extract<View, { step: 'backfill' }>) => {
    const typed = current.indexes.map((index) => ({ index, word: answers[index] ?? '' }));
    if (!recoveryCodeBackfillOkV1(current.phrase, typed)) return setView({ ...current, wrong: true });
    const plan = planSetupGuardiansV1({ account: current.link.account, recoveryCodeAddress: current.address, humans: current.humans, threshold: current.threshold });
    setAnswers({});
    // The words are dropped here: the review step holds the address only.
    if (plan.ok === false) return setView({ step: 'refused', reasonCode: plan.reasonCode });
    return setView({ step: 'review', link: current.link, record: current.record, register: current.register, plan, codeAddress: current.address });
  };

  const carryOn = async (current: Extract<View, { step: 'review' }>) => {
    setView({ ...current, busy: true, problem: undefined });
    const result = await commitSetupV1(
      { link: current.link, record: current.record, plan: current.plan, recoveryCodeAddress: current.codeAddress, register: current.register },
      { store: deps.store, mainOrigin: deps.config.mainOrigin },
    );
    if (result.ok === false) return setView({ ...current, busy: false, problem: result.reasonCode });
    setView({ step: 'leaving', url: result.url });
    return deps.navigate(result.url);
  };

  const registerShown = view.step === 'form' && view.link.register;

  return (
    <section className="ow-card" data-testid="own-wallet-setup">
      <p className="ow-header">{PAGE.pageHeader}</p>
      {view.step === 'form' ? (
        <div data-testid="own-wallet-setup-form">
          <p className="ow-title">{COPY.title}</p>
          {view.link.agentName ? <p className="ow-line">{view.link.agentName}</p> : null}
          <p className="ow-mono ow-muted">{shortOf(view.link.account)}</p>
          <p className="ow-line">{COPY.intro}</p>
          <label className="ow-line">
            <input type="checkbox" checked={useCode} onChange={(e) => setUseCode(e.target.checked)} data-testid="own-wallet-setup-use-code" /> {COPY.useCode}
          </label>
          <p className="ow-line ow-muted">{COPY.useCodeNote}</p>
          <label className="ow-line">
            <input type="checkbox" checked={useGuardians} onChange={(e) => setUseGuardians(e.target.checked)} data-testid="own-wallet-setup-use-guardians" /> {COPY.useGuardians}
          </label>
          {useGuardians ? (
            <div>
              <p className="ow-line">{COPY.guardiansLabel}</p>
              <textarea className="ow-input" value={guardianText} onChange={(e) => setGuardianText(e.target.value)} autoComplete="off" spellCheck={false} data-testid="own-wallet-setup-guardians" />
              <p className="ow-line">{COPY.thresholdLabel}</p>
              <input className="ow-input" value={thresholdText} onChange={(e) => setThresholdText(e.target.value)} inputMode="numeric" autoComplete="off" data-testid="own-wallet-setup-threshold" />
            </div>
          ) : null}
          {registerShown ? (
            <label className="ow-line">
              <input type="checkbox" checked={registerChoice ?? true} onChange={(e) => setRegisterChoice(e.target.checked)} data-testid="own-wallet-setup-register" /> {COPY.register}
            </label>
          ) : null}
          {view.problem ? (
            <p className="ow-red" role="alert" data-reason={view.problem}>
              {setupRefusalLineV1(view.problem)}
            </p>
          ) : null}
          <button type="button" className="ow-button" disabled={!useCode && !useGuardians} onClick={() => next(view)} data-testid="own-wallet-setup-next">
            {COPY.next}
          </button>
        </div>
      ) : null}
      {view.step === 'code' ? (
        <div data-testid="own-wallet-setup-code">
          <p className="ow-line">{PAGE.recoveryCodeIntro}</p>
          <ol className="ow-mono" data-testid="own-wallet-setup-phrase">
            {view.phrase.split(' ').map((word, i) => (
              <li key={i}>{word}</li>
            ))}
          </ol>
          <button type="button" className="ow-button" onClick={() => toBackfill(view)} data-testid="own-wallet-setup-written">
            {COPY.writtenDown}
          </button>
        </div>
      ) : null}
      {view.step === 'backfill' ? (
        <div data-testid="own-wallet-setup-backfill">
          <p className="ow-title">{COPY.backfillTitle}</p>
          {view.indexes.map((index) => (
            <label key={index} className="ow-line">
              {COPY.backfillWord.replace('{N}', String(index + 1))}
              <input
                className="ow-input"
                value={answers[index] ?? ''}
                onChange={(e) => setAnswers({ ...answers, [index]: e.target.value })}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                data-testid={`own-wallet-setup-word-${index}`}
              />
            </label>
          ))}
          {view.wrong ? (
            <p className="ow-red" role="alert" data-testid="own-wallet-setup-wrong">
              {COPY.backfillWrong}
            </p>
          ) : null}
          <button type="button" className="ow-button" onClick={() => checkBackfill(view)} data-testid="own-wallet-setup-check">
            {COPY.backfillButton}
          </button>
          {view.wrong ? (
            <button type="button" className="ow-button" onClick={() => setView({ ...view, step: 'code' })} data-testid="own-wallet-setup-back">
              {COPY.backToCode}
            </button>
          ) : null}
        </div>
      ) : null}
      {view.step === 'review' ? (
        <div data-testid="own-wallet-setup-review">
          <p className="ow-title">{COPY.reviewTitle}</p>
          <ul className="ow-mono">
            {view.plan.guardians.map((g) => (
              <li key={g}>{g === view.codeAddress ? COPY.reviewCode : g}</li>
            ))}
          </ul>
          <p className="ow-line" data-testid="own-wallet-setup-votes">
            {PAGE.recoveryVotes.replace('{N}', String(view.plan.threshold))}
          </p>
          {view.register ? <p className="ow-line">{COPY.reviewRegister}</p> : null}
          {view.problem ? (
            <p className="ow-red" role="alert" data-reason={view.problem}>
              {setupRefusalLineV1(view.problem)}
            </p>
          ) : null}
          <button type="button" className="ow-button" disabled={view.busy === true} onClick={() => void carryOn(view)} data-testid="own-wallet-setup-continue">
            {COPY.continueButton}
          </button>
        </div>
      ) : null}
      {view.step === 'leaving' ? (
        <p className="ow-line" data-testid="own-wallet-setup-leaving">
          {COPY.leaving}
        </p>
      ) : null}
      {view.step === 'refused' ? (
        <div data-testid="own-wallet-setup-refused" data-reason={view.reasonCode}>
          <p className="ow-line">{setupRefusalLineV1(view.reasonCode)}</p>
          <p className="ow-mono ow-muted">{view.reasonCode}</p>
        </div>
      ) : null}
    </section>
  );
}

export default SetupView;
