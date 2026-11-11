/**
 * L8-6 S11b, M9: the share gate G on the phone (design 6a (iii), R-e). The share text is never touched; the gate only says
 * whether it may go out.
 */
import {
  buildShareMessageV1,
  decideShareV1,
  shareCompleteStepV1,
  shareSheetV1,
  SHARE_DEEP_LINK_V1,
  type ShareCardV1,
} from '../ownWalletShareGate';
import { OWN_WALLET_MOBILE_COPY_V1 } from '../ownWallet';

const ADDRESS = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const t = (d: { en: string; zh: string }) => d.zh;
const tEn = (d: { en: string; zh: string }) => d.en;

/** The text the card shared before S11b, copied from its `shareIdentity` (the baseline the output must equal). */
function baselineShare(cd: ShareCardV1, tt: (d: { en: string; zh: string }) => string): string {
  const lines = [
    tt({ en: 'My AI agent has its own wallet & identity 🤖', zh: '我的 AI agent 有独立钱包和链上身份 🤖' }),
    cd.wallet.address ? `👛 ${cd.wallet.address.slice(0, 8)}…${cd.wallet.address.slice(-6)}` : '',
    cd.credit.status === 'enabled' ? `🎯 ${cd.credit.level} (${cd.credit.creditScore})` : '',
    cd.earnings.totalTx > 0 ? `📈 ${cd.earnings.totalTx} txs` : '',
    'https://agentrix.top',
  ].filter(Boolean);
  return lines.join('\n');
}

const gateOk = { ownWalletActive: true, registrationConfirmed: true, registrationOpen: true };

describe('buildShareMessageV1 (the text, word for word)', () => {
  it('has the headline, the short address on the second line, the credit line, the count and the main site', () => {
    const card: ShareCardV1 = { wallet: { address: ADDRESS }, credit: { status: 'enabled', level: 'Silver', creditScore: 612 }, earnings: { totalTx: 7 } };
    expect(buildShareMessageV1(card, t)).toBe('我的 AI agent 有独立钱包和链上身份 🤖\n👛 0xAbCdEf…CdEf01\n🎯 Silver (612)\n📈 7 txs\nhttps://agentrix.top');
    expect(buildShareMessageV1(card, tEn)).toBe('My AI agent has its own wallet & identity 🤖\n👛 0xAbCdEf…CdEf01\n🎯 Silver (612)\n📈 7 txs\nhttps://agentrix.top');
    expect(SHARE_DEEP_LINK_V1).toBe('https://agentrix.top');
  });

  it('drops the lines the card has nothing for', () => {
    expect(buildShareMessageV1({ wallet: {}, credit: { status: 'not_enabled', level: 'None', creditScore: 0 }, earnings: { totalTx: 0 } }, t)).toBe('我的 AI agent 有独立钱包和链上身份 🤖\nhttps://agentrix.top');
  });

  it('is exactly what the card shared before, for every combination', () => {
    for (const address of [undefined, '', ADDRESS]) {
      for (const status of ['enabled', 'pending', 'not_enabled', 'failed']) {
        for (const totalTx of [0, 1, 250]) {
          const card: ShareCardV1 = { wallet: { address }, credit: { status, level: 'Gold', creditScore: 88 }, earnings: { totalTx } };
          expect(buildShareMessageV1(card, t)).toBe(baselineShare(card, t));
          expect(buildShareMessageV1(card, tEn)).toBe(baselineShare(card, tEn));
        }
      }
    }
  });

  it('the address line is the short form only, never the full address', () => {
    const text = buildShareMessageV1({ wallet: { address: ADDRESS }, credit: { status: 'enabled', level: 'None', creditScore: 0 }, earnings: { totalTx: 0 } }, t);
    expect(text).not.toContain(ADDRESS);
    expect(text).not.toContain(ADDRESS.slice(10, 36));
  });
});

describe('decideShareV1', () => {
  const message = 'the text';

  it('gate switch off: share, whatever the card says (today)', () => {
    for (const shareGate of [undefined, gateOk, { ownWalletActive: false, registrationConfirmed: false, registrationOpen: false }, 'junk', null]) {
      expect(decideShareV1({ gateEnabled: false, shareGate, deviceVerified: false, message })).toEqual({ action: 'share', message });
    }
  });

  it('no shareGate on the card (the backend main switch is off): share', () => {
    expect(decideShareV1({ gateEnabled: true, shareGate: undefined, deviceVerified: false, message })).toEqual({ action: 'share', message });
  });

  it('all three conditions: share, and the text is passed through unchanged', () => {
    const odd = 'any text\n with 🤖 and  spaces ';
    expect(decideShareV1({ gateEnabled: true, shareGate: gateOk, deviceVerified: true, message: odd })).toEqual({ action: 'share', message: odd });
  });

  it('each missing condition is complete_first', () => {
    expect(decideShareV1({ gateEnabled: true, shareGate: { ...gateOk, ownWalletActive: false }, deviceVerified: true, message })).toEqual({ action: 'complete_first' });
    expect(decideShareV1({ gateEnabled: true, shareGate: { ...gateOk, registrationConfirmed: false }, deviceVerified: true, message })).toEqual({ action: 'complete_first' });
    expect(decideShareV1({ gateEnabled: true, shareGate: gateOk, deviceVerified: false, message })).toEqual({ action: 'complete_first' });
  });

  it('registration not open is not_open whatever else holds (item 16)', () => {
    expect(decideShareV1({ gateEnabled: true, shareGate: { ...gateOk, registrationOpen: false }, deviceVerified: true, message })).toEqual({ action: 'not_open' });
    expect(decideShareV1({ gateEnabled: true, shareGate: { ownWalletActive: false, registrationConfirmed: false, registrationOpen: false }, deviceVerified: false, message })).toEqual({ action: 'not_open' });
  });

  it('a shareGate that is not three booleans fails closed', () => {
    for (const shareGate of [null, 'yes', 7, [], {}, { ownWalletActive: true }, { ...gateOk, registrationOpen: 'true' }, { ...gateOk, ownWalletActive: 1 }]) {
      expect(decideShareV1({ gateEnabled: true, shareGate, deviceVerified: true, message })).toEqual({ action: 'complete_first' });
    }
  });

  it('only a boolean true from the device check counts', () => {
    for (const verified of [undefined, null, 0, 1, 'true', {}]) {
      expect(decideShareV1({ gateEnabled: true, shareGate: gateOk, deviceVerified: verified as unknown as boolean, message })).toEqual({ action: 'complete_first' });
    }
  });

  it('a gate switch that is not a boolean true does not turn the gate on', () => {
    expect(decideShareV1({ gateEnabled: 1 as unknown as boolean, shareGate: { ...gateOk, registrationOpen: false }, deviceVerified: false, message })).toEqual({ action: 'share', message });
  });

  it('a revoked or unconfirmed Agent never shares: the backend gate says so', () => {
    expect(decideShareV1({ gateEnabled: true, shareGate: { ownWalletActive: true, registrationConfirmed: false, registrationOpen: true }, deviceVerified: true, message })).toEqual({ action: 'complete_first' });
  });
});

describe('shareCompleteStepV1', () => {
  it('no account yet: create', () => {
    expect(shareCompleteStepV1({ walletStatus: 'none', shareGate: { ownWalletActive: false, registrationConfirmed: false, registrationOpen: true }, deviceVerified: false })).toBe('create');
  });

  it('everything the server checks holds and only this device has not checked: verify', () => {
    expect(shareCompleteStepV1({ walletStatus: 'active', shareGate: gateOk, deviceVerified: false })).toBe('verify');
  });

  it('S11c: an account that is not finished and whose card plainly says what is missing: setup (the main site\'s setup page)', () => {
    const open = { ownWalletActive: false, registrationConfirmed: false, registrationOpen: true };
    expect(shareCompleteStepV1({ walletStatus: 'pending', shareGate: open, deviceVerified: false, setupAvailable: true })).toBe('setup');
    expect(shareCompleteStepV1({ walletStatus: 'active', shareGate: { ...open, ownWalletActive: true }, deviceVerified: false, setupAvailable: true })).toBe('setup');
    // verifying wins when the server side already holds; setup never applies to a lost, missing or unreadable wallet
    expect(shareCompleteStepV1({ walletStatus: 'active', shareGate: gateOk, deviceVerified: false, setupAvailable: true })).toBe('verify');
    expect(shareCompleteStepV1({ walletStatus: 'lost', shareGate: open, deviceVerified: false, setupAvailable: true })).toBe('wait');
    expect(shareCompleteStepV1({ walletStatus: 'none', shareGate: open, deviceVerified: false, setupAvailable: true })).toBe('create');
    expect(shareCompleteStepV1({ walletStatus: 'unavailable', shareGate: open, deviceVerified: false, setupAvailable: true })).toBe('unavailable');
    // a card that does not say (setupAvailable absent or not exactly true) leaves the old answer
    for (const setupAvailable of [undefined, false, 'yes' as never]) {
      expect(shareCompleteStepV1({ walletStatus: 'pending', shareGate: open, deviceVerified: false, setupAvailable })).toBe('wait');
    }
  });
  it('an account that is not finished and the card does not say what is missing: wait (no button)', () => {
    expect(shareCompleteStepV1({ walletStatus: 'pending', shareGate: { ownWalletActive: false, registrationConfirmed: false, registrationOpen: true }, deviceVerified: false })).toBe('wait');
    expect(shareCompleteStepV1({ walletStatus: 'active', shareGate: { ownWalletActive: true, registrationConfirmed: false, registrationOpen: true }, deviceVerified: false })).toBe('wait');
    expect(shareCompleteStepV1({ walletStatus: 'lost', shareGate: gateOk, deviceVerified: false })).toBe('wait');
    expect(shareCompleteStepV1({ walletStatus: 'owner_mismatch', shareGate: gateOk, deviceVerified: false })).toBe('wait');
  });

  it('a status that could not be read: unavailable, no button', () => {
    expect(shareCompleteStepV1({ walletStatus: 'unavailable', shareGate: gateOk, deviceVerified: false })).toBe('unavailable');
  });

  it('a malformed shareGate never offers verify', () => {
    expect(shareCompleteStepV1({ walletStatus: 'active', shareGate: { ownWalletActive: true }, deviceVerified: false })).toBe('wait');
    expect(shareCompleteStepV1({ walletStatus: 'active', shareGate: undefined, deviceVerified: false })).toBe('wait');
  });
});

describe('shareSheetV1 (appendix C items 4, 4a, 16, 30)', () => {
  const copy = OWN_WALLET_MOBILE_COPY_V1;
  const input = { walletStatus: 'none', hasLegacyCustody: false, shareGate: { ownWalletActive: false, registrationConfirmed: false, registrationOpen: true }, deviceVerified: false };

  it('not_open: item 16 and one button, "知道了", nothing to start', () => {
    const sheet = shareSheetV1({ ...input, variant: 'not_open' });
    expect(sheet).toEqual({ text: copy.shareNotOpen, go: null, step: null, close: copy.shareAcknowledge });
    expect(sheet.text.zh).toBe('链上登记还没有开放，现在还不能分享这句话。');
    expect(sheet.close.zh).toBe('知道了');
  });

  it('complete_first for an Agent without a wallet: item 4, "去完成" and "先不了"', () => {
    const sheet = shareSheetV1({ ...input, variant: 'complete_first' });
    expect(sheet).toEqual({ text: copy.shareCompleteFirst, go: copy.shareGoComplete, step: 'create', close: copy.shareLater });
    expect(sheet.text.zh).toBe('分享之前，先给这个 Agent 建好独立钱包并在链上登记。需要你确认一次。');
  });

  it('with an old custody wallet: item 4a, twice', () => {
    const sheet = shareSheetV1({ ...input, variant: 'complete_first', hasLegacyCustody: true });
    expect(sheet.text).toBe(copy.shareCompleteFirstLegacy);
    expect(sheet.text.zh).toContain('需要你确认两次');
  });

  it('only the device check is missing: "去完成" starts the check', () => {
    const sheet = shareSheetV1({ ...input, variant: 'complete_first', walletStatus: 'active', shareGate: gateOk });
    expect(sheet).toMatchObject({ step: 'verify', go: copy.shareGoComplete });
  });

  it('S11c: an unfinished account the card can finish: "去完成" starts the setup page', () => {
    const sheet = shareSheetV1({ ...input, variant: 'complete_first', walletStatus: 'pending', setupAvailable: true });
    expect(sheet).toEqual({ text: copy.shareCompleteFirst, go: copy.shareGoComplete, step: 'setup', close: copy.shareLater });
  });
  it('an unfinished account has the text and "先不了" only', () => {
    const sheet = shareSheetV1({ ...input, variant: 'complete_first', walletStatus: 'pending' });
    expect(sheet).toEqual({ text: copy.shareCompleteFirst, go: null, step: 'wait', close: copy.shareLater });
  });

  it('an unreadable status is item 30 with no way forward', () => {
    const sheet = shareSheetV1({ ...input, variant: 'complete_first', walletStatus: 'unavailable' });
    expect(sheet).toEqual({ text: copy.statusUnavailable, go: null, step: 'unavailable', close: copy.shareLater });
    expect(sheet.text.zh).toBe('暂时无法核对这个钱包的状态。稍后再试；在这之前不会用旧钱包付款。');
  });
});
