/**
 * L8-6 S11b (T10, R-h 2): the on-chain identity badge of an Agent card on the phone. An old Agent that only has the relayer's
 * registration is "not registered" under the new reading, and the button never posts the relayer registration then.
 */
import { decideIdentityBadgeV1, verifyPageLinkV1 } from '../ownWalletIdentityBadge';

describe('decideIdentityBadgeV1', () => {
  it('switch off: today\'s badge and today\'s button', () => {
    expect(decideIdentityBadgeV1({ registered: true }, { ownWalletEnabled: false })).toEqual({ badge: 'registered', register: 'legacy_post', source: 'legacy' });
    expect(decideIdentityBadgeV1({ registered: false }, { ownWalletEnabled: false })).toEqual({ badge: 'not_registered', register: 'legacy_post', source: 'legacy' });
    expect(decideIdentityBadgeV1({}, { ownWalletEnabled: false })).toEqual({ badge: 'not_registered', register: 'legacy_post', source: 'legacy' });
    // even an answer carrying the new reading is read the old way while the phone switch is off
    expect(decideIdentityBadgeV1({ registered: false, identityStatus: 'none' }, { ownWalletEnabled: false, ownWalletStatus: 'none' })).toEqual({ badge: 'not_registered', register: 'legacy_post', source: 'legacy' });
  });

  it('switch on but the answer has no new reading (the backend main switch is off): today\'s badge and button', () => {
    expect(decideIdentityBadgeV1({ registered: true }, { ownWalletEnabled: true })).toEqual({ badge: 'registered', register: 'legacy_post', source: 'legacy' });
    expect(decideIdentityBadgeV1({ registered: false }, { ownWalletEnabled: true, ownWalletStatus: 'none' })).toEqual({ badge: 'not_registered', register: 'legacy_post', source: 'legacy' });
  });

  it('switch on, an old Agent under the new reading is not registered, and the button goes to the wallet origin', () => {
    expect(decideIdentityBadgeV1({ registered: false, identityStatus: 'none' }, { ownWalletEnabled: true, ownWalletStatus: 'none' })).toEqual({ badge: 'not_registered', register: 'open_wallet_origin', source: 'own_wallet' });
  });

  it('switch on, never the relayer registration button', () => {
    for (const ownWalletStatus of ['none', 'pending', 'active', 'lost', 'unavailable', 'owner_mismatch', null, undefined]) {
      for (const onchain of [{ registered: false, identityStatus: 'none' }, { registered: false, identityStatus: 'submitted' }, { registered: true, identityStatus: 'confirmed' }, { registered: true, identityStatus: 'weird' }]) {
        expect(decideIdentityBadgeV1(onchain, { ownWalletEnabled: true, ownWalletStatus }).register).not.toBe('legacy_post');
      }
    }
  });

  it('switch on: registered only when the backend says registered AND confirmed', () => {
    expect(decideIdentityBadgeV1({ registered: true, identityStatus: 'confirmed' }, { ownWalletEnabled: true, ownWalletStatus: 'active' })).toEqual({ badge: 'registered', register: 'none', source: 'own_wallet' });
    for (const onchain of [{ registered: true, identityStatus: 'submitted' }, { registered: true, identityStatus: 'revoked' }, { registered: false, identityStatus: 'confirmed' }, { registered: 'yes', identityStatus: 'confirmed' }]) {
      expect(decideIdentityBadgeV1(onchain, { ownWalletEnabled: true, ownWalletStatus: 'active' }).badge).toBe('not_registered');
    }
  });

  it('switch on: a button for an Agent without an account (the first account path) and "去完成" for an unfinished account (S11c); a lost or unknown status gets none', () => {
    const onchain = { registered: false, identityStatus: 'none' };
    expect(decideIdentityBadgeV1(onchain, { ownWalletEnabled: true, ownWalletStatus: 'none' }).register).toBe('open_wallet_origin');
    for (const ownWalletStatus of ['pending', 'active']) {
      expect(decideIdentityBadgeV1(onchain, { ownWalletEnabled: true, ownWalletStatus })).toEqual({ badge: 'not_registered', register: 'open_setup', source: 'own_wallet' });
    }
    for (const ownWalletStatus of ['lost', 'unavailable', 'owner_mismatch', null, undefined]) {
      expect(decideIdentityBadgeV1(onchain, { ownWalletEnabled: true, ownWalletStatus }).register).toBe('none');
    }
  });
  it('switch off or no new reading: never the setup button; a registered Agent has no button at all', () => {
    expect(decideIdentityBadgeV1({ registered: false, identityStatus: 'none' }, { ownWalletEnabled: false, ownWalletStatus: 'active' }).register).toBe('legacy_post');
    expect(decideIdentityBadgeV1({ registered: false }, { ownWalletEnabled: true, ownWalletStatus: 'active' }).register).toBe('legacy_post');
    for (const ownWalletStatus of ['pending', 'active']) {
      expect(decideIdentityBadgeV1({ registered: true, identityStatus: 'confirmed' }, { ownWalletEnabled: true, ownWalletStatus }).register).toBe('none');
    }
  });
});

describe('verifyPageLinkV1', () => {
  it('a plain https verify page of exactly that shape, else none', () => {
    expect(verifyPageLinkV1('https://agentrix.top/verify/agent/84532/12')).toBe('https://agentrix.top/verify/agent/84532/12');
    for (const bad of ['http://agentrix.top/verify/agent/84532/12', 'https://agentrix.top/verify/agent/84532/12?x=1', 'https://agentrix.top/verify/agent/0/12', 'https://agentrix.top/other', 'javascript:alert(1)', 5, null, undefined]) {
      expect(verifyPageLinkV1(bad)).toBeNull();
    }
  });
  it('S11c: the platform certificate fragment (and the queued-revocation word) is accepted, every other fragment is not', () => {
    const base = 'https://agentrix.top/verify/agent/84532/12';
    const uid = `0x${'ab'.repeat(32)}`;
    expect(verifyPageLinkV1(`${base}#eas=${uid}`)).toBe(`${base}#eas=${uid}`);
    expect(verifyPageLinkV1(`${base}#eas=${uid}&easRevoke=pending`)).toBe(`${base}#eas=${uid}&easRevoke=pending`);
    for (const bad of [`${base}#`, `${base}#eas=`, `${base}#eas=0x${'ab'.repeat(31)}`, `${base}#eas=0x${'AB'.repeat(32)}`, `${base}#eas=${uid}&easRevoke=done`, `${base}#eas=${uid}&x=1`, `${base}#easRevoke=pending`, `${base}#x=1`, `${base}?eas=${uid}`, `${base}#eas=${uid}#again`]) {
      expect(verifyPageLinkV1(bad)).toBeNull();
    }
  });
});
