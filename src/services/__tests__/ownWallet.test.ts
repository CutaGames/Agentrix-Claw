/**
 * L8-6 S11b: switches, card view, wallet origin links, the first account path and the deep link shape on the phone
 * (design 6a, 7.1 T10). Pure functions only; the wallet origin's own readers (frontend/lib/own-wallet/links.ts) are used
 * to prove the links built here are links that page accepts.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  agentShareGateMobileEnabledV1,
  complianceLinesV1,
  confirmLegacyCutoverV1,
  ownWalletChainNameV1,
  ownWalletMobileEnabledV1,
  ownWalletSetupAvailableV1,
  ownWalletSetupUrlV1,
  ownWalletViewOfCardV1,
  OWN_WALLET_MOBILE_COPY_V1,
  readOwnWalletCardViewV1,
  readOwnWalletSummaryV1,
  readVerifiedParamsV1,
  shortAddressV1,
  startOwnAccountV1,
  walletAccountUrlV1,
  walletCreateUrlV1,
  walletOriginV1,
  WALLET_VERIFIED_PATH_V1,
  type OwnWalletHttpV1,
} from '../ownWallet';
import { readAccountLinkV1, readCreateLinkV1, readSetupStartV1 } from '../../../frontend/lib/own-wallet/links';
import { classifyFourZoneLegacyPath } from '../../navigation/four-zone/fourZoneLegacyLinks';

const AGENT = '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b';
const ACCOUNT = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const ORIGIN = 'https://wallet.agentrix.top';
const STATE = 'A'.repeat(43);
const root = path.resolve(__dirname, '..', '..', '..');

describe('switches (exactly "1")', () => {
  it('the phone switch', () => {
    expect(ownWalletMobileEnabledV1({ EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED: '1' })).toBe(true);
    for (const v of [undefined, '', '0', 'true', 'TRUE', ' 1', '1 ', 'yes', '2']) {
      expect(ownWalletMobileEnabledV1({ EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED: v })).toBe(false);
    }
  });

  it('the share gate needs both switches', () => {
    expect(agentShareGateMobileEnabledV1({ EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED: '1', EXPO_PUBLIC_AGENT_SHARE_GATE_V1_ENABLED: '1' })).toBe(true);
    expect(agentShareGateMobileEnabledV1({ EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED: '1', EXPO_PUBLIC_AGENT_SHARE_GATE_V1_ENABLED: 'true' })).toBe(false);
    expect(agentShareGateMobileEnabledV1({ EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED: '1' })).toBe(false);
    expect(agentShareGateMobileEnabledV1({ EXPO_PUBLIC_AGENT_SHARE_GATE_V1_ENABLED: '1' })).toBe(false);
    expect(agentShareGateMobileEnabledV1({ EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED: '0', EXPO_PUBLIC_AGENT_SHARE_GATE_V1_ENABLED: '1' })).toBe(false);
  });

  it('the wallet origin is a plain https origin or nothing', () => {
    expect(walletOriginV1({ EXPO_PUBLIC_AGENT_WALLET_ORIGIN: ORIGIN })).toBe(ORIGIN);
    expect(walletOriginV1({ EXPO_PUBLIC_AGENT_WALLET_ORIGIN: ` ${ORIGIN} ` })).toBe(ORIGIN);
    for (const v of [undefined, '', 'http://wallet.agentrix.top', 'https://wallet.agentrix.top/', 'https://wallet.agentrix.top/x', 'wallet.agentrix.top', 'https://user@wallet.agentrix.top', 'javascript:alert(1)']) {
      expect(walletOriginV1({ EXPO_PUBLIC_AGENT_WALLET_ORIGIN: v })).toBe('');
    }
  });

  it('every flag file read is a literal member expression (the Expo build inlines it)', () => {
    const src = fs.readFileSync(path.join(root, 'src/services/ownWallet.ts'), 'utf8');
    expect(src).toContain('process.env.EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED');
    expect(src).toContain('process.env.EXPO_PUBLIC_AGENT_SHARE_GATE_V1_ENABLED');
    expect(src).toContain('process.env.EXPO_PUBLIC_AGENT_WALLET_ORIGIN');
    expect(src).not.toMatch(/process\.env\[/);
  });
});

describe('words', () => {
  it('the Chinese lines that exist on the web are the same words', () => {
    const web = fs.readFileSync(path.join(root, 'frontend/lib/own-wallet/copy.ts'), 'utf8');
    const copy = OWN_WALLET_MOBILE_COPY_V1;
    const shared = [
      copy.shareCompleteFirst, copy.shareCompleteFirstLegacy, copy.shareNotOpen, copy.shareAcknowledge, copy.shareGoComplete, copy.shareLater, copy.statusUnavailable,
      copy.upgradeNotice, copy.upgradeButton, copy.cutoverConfirm, copy.cutoverConfirmButton, copy.cutoverLaterButton, copy.legacyCustodyLabel, copy.externalWalletLabel,
      copy.unverified, copy.verified, copy.receiveButton, copy.badgeNotChecked, copy.recoveryNotSet, copy.walletLost,
      copy.registrationNone, copy.registrationSubmitted, copy.registrationRevoked, copy.registrationFailed, copy.requestFailed, copy.stepUpRequired,
    ];
    for (const line of shared) expect(web).toContain(`'${line.zh}'`);
  });

  it('item 2 and the verify words of appendix C are word for word', () => {
    expect(OWN_WALLET_MOBILE_COPY_V1.complianceOwnWallet.zh).toBe('这个钱包只认你的钥匙（passkey、恢复码、你指定的守护人）。Agentrix 不持有能动钱的钥匙，也无法替你恢复。测试网资产无真实价值，非投资建议。');
    expect(OWN_WALLET_MOBILE_COPY_V1.receiveButton.zh).toBe('收款 / 复制地址');
    expect(OWN_WALLET_MOBILE_COPY_V1.verifyButton.zh).toBe('核对地址');
  });

  it('every line has both languages', () => {
    for (const [key, line] of Object.entries(OWN_WALLET_MOBILE_COPY_V1)) {
      expect([key, typeof line.en, line.en.length > 0]).toEqual([key, 'string', true]);
      expect([key, typeof line.zh, line.zh.length > 0]).toEqual([key, 'string', true]);
    }
  });
});

describe('short address and chain names', () => {
  it('first 8, last 6', () => {
    expect(shortAddressV1(ACCOUNT)).toBe('0xAbCdEf…CdEf01');
    expect(shortAddressV1(ACCOUNT)).not.toContain(ACCOUNT.slice(10, 36));
  });

  it('only the two testnets have names', () => {
    expect(ownWalletChainNameV1(97)).toBe('BSC Testnet');
    expect(ownWalletChainNameV1('84532')).toBe('Base Sepolia');
    expect(ownWalletChainNameV1(56)).toBeNull();
    expect(ownWalletChainNameV1(8453)).toBeNull();
    expect(ownWalletChainNameV1(undefined)).toBeNull();
  });
});

describe('ownWalletViewOfCardV1', () => {
  const base = { wallet: { status: 'enabled', type: 'own_account', address: ACCOUNT, label: 'own_account', balances: { platform: '0', currency: 'USDT' } } };

  it('a card without the key is null: the backend main switch is off, today\'s card', () => {
    expect(ownWalletViewOfCardV1(base)).toBeNull();
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: undefined })).toBeNull();
    expect(ownWalletViewOfCardV1(null)).toBeNull();
    expect(ownWalletViewOfCardV1('x')).toBeNull();
    expect(ownWalletViewOfCardV1([])).toBeNull();
  });

  it('pending and active: the account, the chain, the recovery reading', () => {
    const v = ownWalletViewOfCardV1({ ...base, ownWallet: { status: 'active', chainId: 84532, accountAddress: ACCOUNT, accountStatus: 'deployed', recovery: { enabled: true } } });
    expect(v).toEqual({ status: 'active', chainId: 84532, account: ACCOUNT, accountStatus: 'deployed', recoveryMissing: false, legacy: null, usesLegacyCustody: false });
    const p = ownWalletViewOfCardV1({ ...base, ownWallet: { status: 'pending', chainId: 97, accountAddress: ACCOUNT, accountStatus: 'counterfactual' } });
    expect(p).toMatchObject({ status: 'pending', chainId: 97, accountStatus: 'counterfactual', recoveryMissing: false });
  });

  it('recovery is missing only for a deployed account whose chain read says so (never guessed)', () => {
    const deployed = { status: 'active', chainId: 97, accountAddress: ACCOUNT, accountStatus: 'deployed' };
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: { ...deployed, recovery: { enabled: false } } })?.recoveryMissing).toBe(true);
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: { ...deployed, recovery: { enabled: true } } })?.recoveryMissing).toBe(false);
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: deployed })?.recoveryMissing).toBe(false);
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: { ...deployed, recovery: {} } })?.recoveryMissing).toBe(false);
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: { ...deployed, recovery: { enabled: 'no' } } })?.recoveryMissing).toBe(false);
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: { ...deployed, accountStatus: 'counterfactual', recovery: { enabled: false } } })?.recoveryMissing).toBe(false);
  });

  it('the old wallet is its own line, MPC only counts as custody the platform can move', () => {
    const own = { status: 'active', chainId: 97, accountAddress: ACCOUNT };
    const mpc = ownWalletViewOfCardV1({ ...base, ownWallet: own, legacyCustody: { type: 'mpc', address: '0x' + '1'.repeat(40), label: 'legacy_custody' } });
    expect(mpc).toMatchObject({ legacy: { type: 'mpc', label: 'legacy_custody' }, usesLegacyCustody: true });
    const ext = ownWalletViewOfCardV1({ ...base, ownWallet: own, legacyCustody: { type: 'external', address: '0x' + '2'.repeat(40), label: 'external' } });
    expect(ext).toMatchObject({ legacy: { type: 'external', label: 'external' }, usesLegacyCustody: false });
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: own, legacyCustody: { type: 'mpc', address: '', label: 'legacy_custody' } })?.legacy).toBeNull();
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: own, legacyCustody: { type: 'x', address: '0x1', label: 'legacy_custody' } })?.legacy).toBeNull();
  });

  it('none: where the shown wallet comes from', () => {
    const none = (label: string | undefined) => ownWalletViewOfCardV1({ wallet: { status: 'enabled', type: 'mpc', address: ACCOUNT, ...(label ? { label } : {}) }, ownWallet: { status: 'none' } });
    expect(none('legacy_custody')).toMatchObject({ status: 'none', usesLegacyCustody: true, legacy: { label: 'legacy_custody' } });
    expect(none('external')).toMatchObject({ status: 'none', usesLegacyCustody: false, legacy: { label: 'external' } });
    expect(none(undefined)).toMatchObject({ status: 'none', usesLegacyCustody: false, legacy: null });
  });

  it('a status the build does not know, or a live status without a usable account, is unavailable, never none', () => {
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: { status: 'weird' } })?.status).toBe('unavailable');
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: 'active' })?.status).toBe('unavailable');
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: { status: 'active', chainId: 56, accountAddress: ACCOUNT } })?.status).toBe('unavailable');
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: { status: 'active', chainId: 97, accountAddress: '0x12' } })?.status).toBe('unavailable');
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: { status: 'lost', chainId: 97 } })?.status).toBe('unavailable');
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: { status: 'unavailable' } })?.status).toBe('unavailable');
  });

  it('a lost account is kept (greyed out by the card); owner_mismatch has no account', () => {
    expect(ownWalletViewOfCardV1({ ...base, ownWallet: { status: 'lost', chainId: 97, accountAddress: ACCOUNT, accountStatus: 'lost' } })).toMatchObject({ status: 'lost', account: ACCOUNT });
    const m = ownWalletViewOfCardV1({ ...base, ownWallet: { status: 'owner_mismatch' } });
    expect(m?.status).toBe('owner_mismatch');
    expect(m?.account).toBeUndefined();
  });
});

describe('links to the wallet origin', () => {
  it('receive and verify-device links are links the wallet origin\'s readers accept', () => {
    const receive = walletAccountUrlV1(ORIGIN, 'receive', { chainId: 97, account: ACCOUNT, agentId: AGENT });
    expect(receive).not.toBeNull();
    expect(receive!.startsWith(`${ORIGIN}/wallet/receive/#`)).toBe(true);
    const r = readAccountLinkV1('#' + receive!.split('#')[1], 'receive');
    expect(r).toEqual({ ok: true, value: { chainId: 97, account: ACCOUNT.toLowerCase(), kind: 'agent', agentId: AGENT } });

    const verify = walletAccountUrlV1(ORIGIN, 'verify-device', { chainId: 84532, account: ACCOUNT, agentId: AGENT, state: STATE });
    expect(verify!.startsWith(`${ORIGIN}/wallet/verify-device/#`)).toBe(true);
    expect(readAccountLinkV1('#' + verify!.split('#')[1], 'verify-device')).toEqual({ ok: true, value: { chainId: 84532, account: ACCOUNT.toLowerCase(), kind: 'agent', agentId: AGENT, state: STATE } });
  });

  it('everything the page needs is in the fragment, nothing in the path or query', () => {
    const url = walletAccountUrlV1(ORIGIN, 'verify-device', { chainId: 97, account: ACCOUNT, agentId: AGENT, state: STATE })!;
    const [beforeHash, fragment] = url.split('#');
    expect(beforeHash).toBe(`${ORIGIN}/wallet/verify-device/`);
    expect(beforeHash).not.toContain(STATE);
    expect(beforeHash).not.toContain('?');
    expect(fragment).toContain(`state=${STATE}`);
  });

  it('the receive link never carries a state; a verify link may', () => {
    const receive = walletAccountUrlV1(ORIGIN, 'receive', { chainId: 97, account: ACCOUNT, agentId: AGENT, state: STATE })!;
    expect(receive).not.toContain('state=');
  });

  it('no link at all when anything is off', () => {
    const ok = { chainId: 97, account: ACCOUNT, agentId: AGENT };
    expect(walletAccountUrlV1('', 'receive', ok)).toBeNull();
    expect(walletAccountUrlV1('http://wallet.agentrix.top', 'receive', ok)).toBeNull();
    expect(walletAccountUrlV1(ORIGIN, 'receive', { ...ok, chainId: 56 })).toBeNull();
    expect(walletAccountUrlV1(ORIGIN, 'receive', { ...ok, chainId: 8453 })).toBeNull();
    expect(walletAccountUrlV1(ORIGIN, 'receive', { ...ok, account: '0x12' })).toBeNull();
    expect(walletAccountUrlV1(ORIGIN, 'receive', { ...ok, agentId: 'not-a-uuid' })).toBeNull();
    expect(walletAccountUrlV1(ORIGIN, 'verify-device', { ...ok, state: 'short' })).toBeNull();
    expect(walletAccountUrlV1(ORIGIN, 'verify-device', { ...ok, state: 'bad state with spaces ........' })).toBeNull();
  });

  it('the create link is the one the create page reads', () => {
    const ref = 'owr_' + 'a'.repeat(32);
    const token = 'owt_' + 'B'.repeat(43);
    const url = walletCreateUrlV1(ORIGIN, { requestRef: ref, walletToken: token, agentId: AGENT, agentName: 'My Agent' })!;
    expect(url.startsWith(`${ORIGIN}/wallet/create/#`)).toBe(true);
    expect(readCreateLinkV1('#' + url.split('#')[1])).toEqual({ ok: true, value: { requestRef: ref, walletToken: token, kind: 'agent', agentId: AGENT, agentName: 'My Agent' } });
    // a name the page would refuse is left out instead of breaking the link
    const noName = walletCreateUrlV1(ORIGIN, { requestRef: ref, walletToken: token, agentId: AGENT, agentName: 'x'.repeat(61) })!;
    expect(readCreateLinkV1('#' + noName.split('#')[1])).toMatchObject({ ok: true });
    const control = walletCreateUrlV1(ORIGIN, { requestRef: ref, walletToken: token, agentId: AGENT, agentName: 'a\u0007b' })!;
    expect(control).not.toContain('name=');
    expect(walletCreateUrlV1(ORIGIN, { requestRef: 'owr_x', walletToken: token, agentId: AGENT })).toBeNull();
    expect(walletCreateUrlV1(ORIGIN, { requestRef: ref, walletToken: 'owt_x', agentId: AGENT })).toBeNull();
    expect(walletCreateUrlV1('', { requestRef: ref, walletToken: token, agentId: AGENT })).toBeNull();
  });
});

describe('the deep link back', () => {
  it('the wallet origin builds agentrix://wallet-verified with exactly state, account and chainId', () => {
    const src = fs.readFileSync(path.join(root, 'frontend/lib/own-wallet/verify-device.ts'), 'utf8');
    expect(src).toContain('agentrix://wallet-verified?${q.toString()}');
    for (const key of ['state', 'account', 'chainId']) expect(src).toContain(`q.set('${key}'`);
    expect(WALLET_VERIFIED_PATH_V1).toBe('wallet-verified');
  });

  it('reads the route params, lower-casing the account', () => {
    expect(readVerifiedParamsV1({ state: STATE, account: ACCOUNT, chainId: '97' })).toEqual({ ok: true, value: { state: STATE, account: ACCOUNT.toLowerCase(), chainId: 97 } });
  });

  it('anything missing, repeated or out of shape is no link', () => {
    const good = { state: STATE, account: ACCOUNT, chainId: '97' };
    expect(readVerifiedParamsV1(undefined).ok).toBe(false);
    expect(readVerifiedParamsV1(null).ok).toBe(false);
    expect(readVerifiedParamsV1('x').ok).toBe(false);
    expect(readVerifiedParamsV1({ ...good, state: undefined }).ok).toBe(false);
    expect(readVerifiedParamsV1({ ...good, state: 'short' }).ok).toBe(false);
    expect(readVerifiedParamsV1({ ...good, state: [STATE, STATE] }).ok).toBe(false);
    expect(readVerifiedParamsV1({ ...good, account: '0x12' }).ok).toBe(false);
    expect(readVerifiedParamsV1({ ...good, chainId: 97 }).ok).toBe(false);
    expect(readVerifiedParamsV1({ ...good, chainId: '56' }).ok).toBe(false);
    expect(readVerifiedParamsV1({ ...good, chainId: '0x61' }).ok).toBe(false);
  });

  it('the path is not a retired or unknown link in the four-zone build: it is handed to the link table', () => {
    const outcome = classifyFourZoneLegacyPath(`wallet-verified?state=${STATE}&account=${ACCOUNT}&chainId=97`);
    expect(outcome).toEqual({ kind: 'legacy', path: expect.stringMatching(/^wallet-verified\?/) });
  });
});

describe('startOwnAccountV1 (the first account path)', () => {
  const ref = 'owr_' + 'a'.repeat(32);
  const token = 'owt_' + 'B'.repeat(43);
  const scripted = (answers: Array<{ status: number; body: unknown } | Error>): { http: OwnWalletHttpV1; calls: Array<{ method: string; path: string; body: unknown }> } => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    const http: OwnWalletHttpV1 = async (method, p, body) => {
      calls.push({ method, path: p, body });
      const next = answers.shift();
      if (!next) throw new Error('unexpected call');
      if (next instanceof Error) throw next;
      return next;
    };
    return { http, calls };
  };

  it('an owner who already has a wallet passkey gets the account straight away', async () => {
    const { http, calls } = scripted([{ status: 201, body: { data: { accountAddress: ACCOUNT, chainId: 97 } } }]);
    expect(await startOwnAccountV1({ agentId: AGENT, walletOrigin: ORIGIN, http })).toEqual({ outcome: 'account_ready', accountAddress: ACCOUNT, chainId: 97 });
    expect(calls).toEqual([{ method: 'POST', path: '/agent-own-wallet/accounts/agent', body: { agentId: AGENT } }]);
  });

  it('wallet_passkey_required leads to the create request and the wallet origin\'s create page', async () => {
    const { http, calls } = scripted([
      { status: 409, body: { code: 'wallet_passkey_required' } },
      { status: 200, body: { data: { requestRef: ref, walletToken: token } } },
    ]);
    const result = await startOwnAccountV1({ agentId: AGENT, agentName: 'Helper', walletOrigin: ORIGIN, http });
    expect(result.outcome).toBe('open_wallet');
    if (result.outcome === 'open_wallet') {
      expect(readCreateLinkV1('#' + result.url.split('#')[1])).toEqual({ ok: true, value: { requestRef: ref, walletToken: token, kind: 'agent', agentId: AGENT, agentName: 'Helper' } });
      // the one-time token is only in the fragment
      expect(result.url.split('#')[0]).not.toContain(token);
    }
    expect(calls[1]).toEqual({ method: 'POST', path: '/agent-own-wallet/accounts/create-requests', body: { kind: 'agent', agentId: AGENT } });
  });

  it('any other refusal is a failure with its code, and nothing opens', async () => {
    const a = scripted([{ status: 409, body: { code: 'something_else' } }]);
    expect(await startOwnAccountV1({ agentId: AGENT, walletOrigin: ORIGIN, http: a.http })).toEqual({ outcome: 'failed', code: 'something_else' });
    expect(a.calls).toHaveLength(1);
    const b = scripted([{ status: 404, body: null }]);
    expect(await startOwnAccountV1({ agentId: AGENT, walletOrigin: ORIGIN, http: b.http })).toEqual({ outcome: 'failed', code: 'request_failed' });
    const c = scripted([{ status: 409, body: { code: 'wallet_passkey_required' } }, { status: 503, body: { error: { code: 'chain_not_configured' } } }]);
    expect(await startOwnAccountV1({ agentId: AGENT, walletOrigin: ORIGIN, http: c.http })).toEqual({ outcome: 'failed', code: 'chain_not_configured' });
  });

  it('a malformed answer is a failure, never a half link', async () => {
    const a = scripted([{ status: 200, body: { accountAddress: 5 } }]);
    expect(await startOwnAccountV1({ agentId: AGENT, walletOrigin: ORIGIN, http: a.http })).toEqual({ outcome: 'failed', code: 'response_malformed' });
    const b = scripted([{ status: 409, body: { code: 'wallet_passkey_required' } }, { status: 200, body: { requestRef: 'nope', walletToken: token } }]);
    expect(await startOwnAccountV1({ agentId: AGENT, walletOrigin: ORIGIN, http: b.http })).toEqual({ outcome: 'failed', code: 'response_malformed' });
  });

  it('no request is made for a missing wallet origin or an Agent id that is not a UUID', async () => {
    const a = scripted([]);
    expect(await startOwnAccountV1({ agentId: AGENT, walletOrigin: '', http: a.http })).toEqual({ outcome: 'failed', code: 'wallet_origin_not_configured' });
    expect(await startOwnAccountV1({ agentId: 'agent-1', walletOrigin: ORIGIN, http: a.http })).toEqual({ outcome: 'failed', code: 'agent_required' });
    expect(a.calls).toHaveLength(0);
  });

  it('a network error is a failure', async () => {
    const a = scripted([new Error('offline')]);
    expect(await startOwnAccountV1({ agentId: AGENT, walletOrigin: ORIGIN, http: a.http })).toEqual({ outcome: 'failed', code: 'network_unavailable' });
    const b = scripted([{ status: 409, body: { code: 'wallet_passkey_required' } }, new Error('offline')]);
    expect(await startOwnAccountV1({ agentId: AGENT, walletOrigin: ORIGIN, http: b.http })).toEqual({ outcome: 'failed', code: 'network_unavailable' });
  });
});

describe('confirmLegacyCutoverV1', () => {
  it('posts the confirmation for this Agent only', async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    const http: OwnWalletHttpV1 = async (_m, p, body) => {
      calls.push({ path: p, body });
      return { status: 200, body: {} };
    };
    expect(await confirmLegacyCutoverV1({ agentId: AGENT, http })).toEqual({ ok: true });
    expect(calls).toEqual([{ path: `/agent-own-wallet/accounts/agent/${AGENT}/legacy-cutover`, body: { confirm: true } }]);
  });

  it('a refusal carries its code; a step-up refusal is not a success', async () => {
    const http: OwnWalletHttpV1 = async () => ({ status: 403, body: { code: 'STEP_UP_REQUIRED' } });
    expect(await confirmLegacyCutoverV1({ agentId: AGENT, http })).toEqual({ ok: false, code: 'STEP_UP_REQUIRED' });
    const failing: OwnWalletHttpV1 = async () => {
      throw new Error('offline');
    };
    expect(await confirmLegacyCutoverV1({ agentId: AGENT, http: failing })).toEqual({ ok: false, code: 'network_unavailable' });
  });

  it('an id that is not a UUID makes no request', async () => {
    let called = false;
    const http: OwnWalletHttpV1 = async () => {
      called = true;
      return { status: 200, body: {} };
    };
    expect(await confirmLegacyCutoverV1({ agentId: '../x', http })).toEqual({ ok: false, code: 'agent_required' });
    expect(called).toBe(false);
  });
});

describe('readOwnWalletSummaryV1', () => {
  const row = { agentId: AGENT, ownWalletStatus: 'active', registration: 'confirmed', easCertificate: null };

  it('decodes the list', async () => {
    const http: OwnWalletHttpV1 = async () => ({ status: 200, body: { data: { agents: [row] } } });
    expect(await readOwnWalletSummaryV1(http)).toEqual({ kind: 'ready', agents: [row] });
  });

  it('404 is the backend switch being off; anything else that is not a list is unavailable', async () => {
    expect(await readOwnWalletSummaryV1(async () => ({ status: 404, body: null }))).toEqual({ kind: 'off' });
    expect(await readOwnWalletSummaryV1(async () => ({ status: 503, body: null }))).toEqual({ kind: 'unavailable' });
    expect(await readOwnWalletSummaryV1(async () => ({ status: 200, body: { agents: 'x' } }))).toEqual({ kind: 'unavailable' });
    expect(await readOwnWalletSummaryV1(async () => ({ status: 200, body: { agents: [{ ...row, registration: 'bogus' }] } }))).toEqual({ kind: 'unavailable' });
    expect(await readOwnWalletSummaryV1(async () => ({ status: 200, body: { agents: [{ ...row, extra: 1 }] } }))).toEqual({ kind: 'unavailable' });
    expect(await readOwnWalletSummaryV1(async () => {
      throw new Error('offline');
    })).toEqual({ kind: 'unavailable' });
  });
});

describe('readOwnWalletCardViewV1', () => {
  it('reads the view of one Agent\'s card', async () => {
    const calls: string[] = [];
    const http: OwnWalletHttpV1 = async (_m, p) => {
      calls.push(p);
      return { status: 200, body: { data: { wallet: {}, ownWallet: { status: 'pending', chainId: 97, accountAddress: ACCOUNT } } } };
    };
    const read = await readOwnWalletCardViewV1(http, AGENT);
    expect(read).toMatchObject({ kind: 'ok', view: { status: 'pending', account: ACCOUNT } });
    expect(calls).toEqual([`/agent-accounts/${AGENT}/economic-identity`]);
  });

  it('no key is ok with a null view; a failed read is failed; a path-like id makes no request', async () => {
    expect(await readOwnWalletCardViewV1(async () => ({ status: 200, body: { data: { wallet: {} } } }), AGENT)).toEqual({ kind: 'ok', view: null });
    expect(await readOwnWalletCardViewV1(async () => ({ status: 500, body: null }), AGENT)).toEqual({ kind: 'failed' });
    let called = false;
    expect(await readOwnWalletCardViewV1(async () => {
      called = true;
      return { status: 200, body: {} };
    }, '../../x/y')).toEqual({ kind: 'failed' });
    expect(called).toBe(false);
  });
});

describe('complianceLinesV1 (appendix C item 2)', () => {
  const t = (d: { en: string; zh: string }) => d.zh;
  const lines = [
    '测试网资产无真实价值，非投资建议。',
    'USDC 为链上真实结算资产；AXP 为站内软积分，不可提现、非货币、非证券，两者性质不同、不可互换、无固定兑换比例。',
    '托管钱包采用三方分片：平台持分片 B、你持恢复码（分片 C）。丢失恢复码且更换设备可能导致无法恢复。',
  ];
  const own = (status: string) => ownWalletViewOfCardV1({ wallet: {}, ownWallet: { status, chainId: 97, accountAddress: ACCOUNT } });

  it('no own-wallet view, or an Agent without an account: the lines as they came', () => {
    expect(complianceLinesV1(lines, null, t)).toEqual(lines);
    expect(complianceLinesV1(lines, ownWalletViewOfCardV1({ wallet: {}, ownWallet: { status: 'none' } }), t)).toEqual(lines);
    expect(complianceLinesV1(lines, ownWalletViewOfCardV1({ wallet: {}, ownWallet: { status: 'unavailable' } }), t)).toEqual(lines);
  });

  it('an own account replaces the custody line with item 2 and drops the plain testnet line it already says', () => {
    for (const status of ['pending', 'active', 'lost']) {
      expect(complianceLinesV1(lines, own(status), t)).toEqual([lines[1], OWN_WALLET_MOBILE_COPY_V1.complianceOwnWallet.zh]);
    }
  });

  it('a card whose lines have no custody sentence is left alone', () => {
    expect(complianceLinesV1([lines[0], lines[1]], own('active'), t)).toEqual([lines[0], lines[1]]);
  });
});

describe('the setup wizard entries (S11c)', () => {
  it('the link to the main site\'s setup page names the Agent only, and the web page\'s reader accepts it', () => {
    const url = ownWalletSetupUrlV1('https://www.agentrix.top', AGENT)!;
    expect(url).toBe(`https://www.agentrix.top/own-wallet/setup#agent=${AGENT}`);
    expect(readSetupStartV1('#' + url.split('#')[1])).toEqual({ ok: true, value: { agentId: AGENT } });
    expect(ownWalletSetupUrlV1('https://www.agentrix.top/', AGENT)).toBe(url);
  });
  it('negative: no link for an app URL that is not a plain https origin, or an id that is not a UUID', () => {
    for (const appUrl of ['', 'http://www.agentrix.top', 'https://www.agentrix.top/x', 'javascript:alert(1)', '//www.agentrix.top']) {
      expect(ownWalletSetupUrlV1(appUrl, AGENT)).toBeNull();
    }
    for (const id of ['', 'nope', `${AGENT}/../x`, `${AGENT}#x`, 7 as never]) expect(ownWalletSetupUrlV1('https://www.agentrix.top', id)).toBeNull();
  });
  const card = (own: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
    ownWallet: { status: 'active', chainId: 97, accountAddress: ACCOUNT, accountStatus: 'deployed', recovery: { enabled: true }, ...own },
    shareGate: { ownWalletActive: true, registrationConfirmed: false, registrationOpen: true },
    onchain: { identity: { status: 'none' } },
    ...extra,
  });
  it('available when the card plainly says what is missing: an undeployed account, recovery off, or recovery on and not registered while open', () => {
    expect(ownWalletSetupAvailableV1(card({ status: 'pending', accountStatus: 'counterfactual' }))).toBe(true);
    expect(ownWalletSetupAvailableV1(card({ recovery: { enabled: false } }))).toBe(true);
    expect(ownWalletSetupAvailableV1(card({}))).toBe(true);
    expect(ownWalletSetupAvailableV1(card({}, { onchain: { identity: { status: 'failed' } } }))).toBe(true);
  });
  it.each([
    ['not a card', null],
    ['no ownWallet (the backend switch is off)', {}],
    ['no wallet', card({ status: 'none' })],
    ['a lost wallet', card({ status: 'lost' })],
    ['an unreadable status', card({ status: 'unavailable' })],
    ['a chain that is not allowed', card({ chainId: 56 })],
    ['a malformed address', card({ accountAddress: '0x12' })],
    ['an unknown account state', card({ accountStatus: 'weird' })],
    ['recovery unreadable', card({ recovery: undefined })],
    ['recovery with a malformed value', card({ recovery: { enabled: 'false' } })],
    ['registration closed', card({}, { shareGate: { registrationOpen: false, registrationConfirmed: false } })],
    ['no share gate', card({}, { shareGate: undefined })],
    ['already confirmed by the gate', card({}, { shareGate: { registrationOpen: true, registrationConfirmed: true } })],
    ['registration confirmed', card({}, { onchain: { identity: { status: 'confirmed' } } })],
    ['registration waiting on the chain', card({}, { onchain: { identity: { status: 'pending' } } })],
    ['registration being revoked', card({}, { onchain: { identity: { status: 'revoke_pending' } } })],
    ['registration revoked', card({}, { onchain: { identity: { status: 'revoked' } } })],
  ])('negative: %s → not available (no button is guessed)', (_why, input) => {
    expect(ownWalletSetupAvailableV1(input)).toBe(false);
  });
  it('the words: "设置恢复" is the web constant word for word', () => {
    expect(OWN_WALLET_MOBILE_COPY_V1.setUpRecoveryButton.zh).toBe('设置恢复');
  });
});
