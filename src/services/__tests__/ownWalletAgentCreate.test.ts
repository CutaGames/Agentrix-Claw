/**
 * L8-6 S11b (T10, 6a (i)): what happens after "new Agent" and on "打开独立钱包" on the phone. With the switch off or the backend's
 * main switch off it is the MPC path of today; otherwise the phone never creates the MPC wallet.
 */
import { decideAfterAgentCreatedV1, decideOpenWalletV1 } from '../ownWalletAgentCreate';
import { ownWalletViewOfCardV1 } from '../ownWallet';

const ACCOUNT = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const view = (ownWallet: unknown) => ownWalletViewOfCardV1({ wallet: {}, ownWallet });

describe('decideAfterAgentCreatedV1', () => {
  it('phone switch off: the MPC path of today, whatever the card says', () => {
    for (const card of [
      { kind: 'failed' as const },
      { kind: 'ok' as const, view: null },
      { kind: 'ok' as const, view: view({ status: 'active', chainId: 97, accountAddress: ACCOUNT }) },
      { kind: 'ok' as const, view: view({ status: 'none' }) },
    ]) {
      expect(decideAfterAgentCreatedV1({ ownWalletEnabled: false, card })).toEqual({ action: 'legacy_mpc_create' });
    }
  });

  it('switch on, the backend main switch off (the card has no ownWallet key): the MPC path, as that backend wants', () => {
    expect(decideAfterAgentCreatedV1({ ownWalletEnabled: true, card: { kind: 'ok', view: null } })).toEqual({ action: 'legacy_mpc_create' });
  });

  it('switch on, the backend already made the Agent\'s account (pending or active): own_wallet_ready with the short address only', () => {
    for (const status of ['pending', 'active']) {
      const r = decideAfterAgentCreatedV1({ ownWalletEnabled: true, card: { kind: 'ok', view: view({ status, chainId: 84532, accountAddress: ACCOUNT }) } });
      expect(r).toEqual({ action: 'own_wallet_ready', shortAddress: '0xAbCdEf…CdEf01' });
      expect(JSON.stringify(r)).not.toContain(ACCOUNT);
    }
  });

  it('switch on, no account yet (the owner has no wallet passkey): the wallet origin', () => {
    expect(decideAfterAgentCreatedV1({ ownWalletEnabled: true, card: { kind: 'ok', view: view({ status: 'none' }) } })).toEqual({ action: 'open_wallet_origin' });
  });

  it('switch on, anything unreadable or odd: unavailable, and never the MPC path', () => {
    expect(decideAfterAgentCreatedV1({ ownWalletEnabled: true, card: { kind: 'failed' } })).toEqual({ action: 'own_wallet_unavailable' });
    for (const ownWallet of [{ status: 'unavailable' }, { status: 'lost', chainId: 97, accountAddress: ACCOUNT }, { status: 'owner_mismatch' }, { status: 'weird' }, { status: 'active' }]) {
      expect(decideAfterAgentCreatedV1({ ownWalletEnabled: true, card: { kind: 'ok', view: view(ownWallet) } })).toEqual({ action: 'own_wallet_unavailable' });
    }
  });

  it('only a flag that is exactly true counts', () => {
    expect(decideAfterAgentCreatedV1({ ownWalletEnabled: 1 as unknown as boolean, card: { kind: 'failed' } })).toEqual({ action: 'legacy_mpc_create' });
  });
});

describe('decideOpenWalletV1', () => {
  it('off: create the MPC wallet as today; on: open the wallet origin', () => {
    expect(decideOpenWalletV1({ ownWalletEnabled: false })).toEqual({ action: 'legacy_mpc_create' });
    expect(decideOpenWalletV1({ ownWalletEnabled: true })).toEqual({ action: 'open_wallet_origin' });
    expect(decideOpenWalletV1({ ownWalletEnabled: undefined as unknown as boolean })).toEqual({ action: 'legacy_mpc_create' });
  });
});
