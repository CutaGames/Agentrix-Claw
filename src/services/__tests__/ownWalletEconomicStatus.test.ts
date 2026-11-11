/**
 * L8-6 S11b (T11, R6-L2): the wallet block of the economic status screen. An `active` Agent that still has an old MPC wallet
 * shows the own account address in the wallet row and the old address only on the "旧托管钱包" row; with the switch off (or the
 * backend's main switch off) it is today's block, byte for byte.
 */
import * as fs from 'fs';
import * as path from 'path';
import { economicWalletBlockV1 } from '../ownWalletEconomicStatus';
import { OWN_WALLET_MOBILE_COPY_V1 } from '../ownWallet';

const OWN = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const OLD = '0x2222222222222222222222222222222222222222';
const EXT = '0x3333333333333333333333333333333333333333';
const on = { ownWalletEnabled: true };
const off = { ownWalletEnabled: false };

const active = { status: 'enabled', type: 'own_account', ownWalletStatus: 'active', accountAddress: OWN, chainId: 84532, label: 'own_account', legacyCustody: { type: 'mpc', address: OLD, label: 'legacy_custody' } };

describe('economicWalletBlockV1', () => {
  it('switch off: nothing, the screen draws today\'s block', () => {
    expect(economicWalletBlockV1(active, off)).toBeNull();
    expect(economicWalletBlockV1({ status: 'enabled' }, off)).toBeNull();
    expect(economicWalletBlockV1(active, { ownWalletEnabled: 1 as unknown as boolean })).toBeNull();
  });

  it('switch on but the answer has no ownWalletStatus (the backend main switch is off): nothing, today\'s block', () => {
    expect(economicWalletBlockV1({ status: 'enabled', type: 'mpc', mpcWalletId: OLD }, on)).toBeNull();
    expect(economicWalletBlockV1(null, on)).toBeNull();
    expect(economicWalletBlockV1('x', on)).toBeNull();
    expect(economicWalletBlockV1({ ownWalletStatus: 5 }, on)).toBeNull();
  });

  it('active with an old MPC wallet: the own address on the wallet row, the old address only on the old-wallet row', () => {
    const block = economicWalletBlockV1(active, on)!;
    expect(block.status).toBe('enabled');
    expect(block.rows).toEqual([
      { id: 'address', label: { en: 'Address', zh: '地址' }, value: '0xAbCdEf…CdEf01' },
      { id: 'chain', label: { en: 'Chain', zh: '链' }, value: 'Base Sepolia' },
      { id: 'legacy', label: OWN_WALLET_MOBILE_COPY_V1.legacyCustodyLabel, value: '0x222222…222222' },
    ]);
    const addressRow = block.rows.find((r) => r.id === 'address')!;
    expect(addressRow.value).not.toContain('222222');
    expect(block.rows.filter((r) => typeof r.value === 'string' && r.value.includes('222222'))).toHaveLength(1);
    expect(block.rows.find((r) => r.id === 'legacy')!.label.zh).toBe('旧托管钱包（平台可动）');
    expect(block.detail).toBeNull();
    // no full address anywhere in the block
    expect(JSON.stringify(block)).not.toContain(OWN);
    expect(JSON.stringify(block)).not.toContain(OLD);
  });

  it('pending is also enabled with the account; an external wallet is named as the owner\'s external wallet', () => {
    const block = economicWalletBlockV1({ ...active, ownWalletStatus: 'pending', legacyCustody: { type: 'external', address: EXT, label: 'external' } }, on)!;
    expect(block.status).toBe('enabled');
    expect(block.rows.find((r) => r.id === 'legacy')).toMatchObject({ label: OWN_WALLET_MOBILE_COPY_V1.externalWalletLabel, value: '0x333333…333333' });
    expect(block.rows.find((r) => r.id === 'legacy')!.label.zh).toBe('你连接的外部钱包');
  });

  it('an account that is not enabled in the dimension is failed, not enabled', () => {
    expect(economicWalletBlockV1({ ...active, status: 'failed' }, on)!.status).toBe('failed');
  });

  it('lost: failed, the lost address greyed by the screen, item 20, and the old wallet still listed', () => {
    const block = economicWalletBlockV1({ ...active, status: 'failed', ownWalletStatus: 'lost' }, on)!;
    expect(block.status).toBe('failed');
    expect(block.alwaysRows).toBe(true);
    expect(block.detail).toBe(OWN_WALLET_MOBILE_COPY_V1.walletLost);
    expect(block.detail!.zh).toBe('这个钱包已标为失联：钥匙都找不回来了，钱动不了。可以给这个 Agent 新建一个钱包。');
    expect(block.rows.map((r) => r.id)).toEqual(['address', 'chain', 'legacy']);
  });

  it('unavailable and owner_mismatch: failed with no address of any wallet; unavailable says item 30', () => {
    const unavailable = economicWalletBlockV1({ status: 'failed', type: 'none', ownWalletStatus: 'unavailable', legacyCustody: { type: 'mpc', address: OLD, label: 'legacy_custody' } }, on)!;
    expect(unavailable).toEqual({ status: 'failed', rows: [], detail: OWN_WALLET_MOBILE_COPY_V1.statusUnavailable, alwaysRows: false });
    const mismatch = economicWalletBlockV1({ status: 'failed', type: 'own_account', ownWalletStatus: 'owner_mismatch', legacyCustody: { type: 'mpc', address: OLD, label: 'legacy_custody' } }, on)!;
    expect(mismatch).toEqual({ status: 'failed', rows: [], detail: null, alwaysRows: false });
    expect(economicWalletBlockV1({ status: 'failed', ownWalletStatus: 'something_new' }, on)).toEqual({ status: 'failed', rows: [], detail: null, alwaysRows: false });
  });

  it('a live status without a usable account or chain is item 30, never an address', () => {
    for (const bad of [{ accountAddress: '0x12' }, { accountAddress: undefined }, { chainId: 56 }, { chainId: undefined }]) {
      const block = economicWalletBlockV1({ ...active, ...bad }, on)!;
      expect(block).toEqual({ status: 'failed', rows: [], detail: OWN_WALLET_MOBILE_COPY_V1.statusUnavailable, alwaysRows: false });
    }
  });

  it('none: today\'s dimension with the source named', () => {
    const legacy = economicWalletBlockV1({ status: 'enabled', type: 'mpc', mpcWalletId: OLD, ownWalletStatus: 'none', label: 'legacy_custody' }, on)!;
    expect(legacy.status).toBe('enabled');
    expect(legacy.rows).toEqual([
      { id: 'address', label: { en: 'Address', zh: '地址' }, value: '0x222222…222222' },
      { id: 'custody', label: { en: 'Custody', zh: '托管' }, value: OWN_WALLET_MOBILE_COPY_V1.legacyCustodyLabel },
    ]);
    const external = economicWalletBlockV1({ status: 'enabled', type: 'external', externalWalletAddress: EXT, ownWalletStatus: 'none', label: 'external' }, on)!;
    expect(external.rows[1].value).toBe(OWN_WALLET_MOBILE_COPY_V1.externalWalletLabel);
    expect(external.rows[0].value).toBe('0x333333…333333');
    const nothing = economicWalletBlockV1({ status: 'not_enabled', type: 'none', ownWalletStatus: 'none' }, on)!;
    expect(nothing.status).toBe('not_enabled');
    expect(nothing.rows.map((r) => r.value)).toEqual([null, null]);
    expect(economicWalletBlockV1({ status: 'failed', type: 'none', ownWalletStatus: 'none' }, on)!.status).toBe('failed');
  });
});

describe('the status screen keeps today\'s block when the function says null', () => {
  const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens/agent-ops/AgentEconomicStatusScreen.tsx'), 'utf8');

  it('the original wallet card is still there, with its own rows and detail', () => {
    expect(screen).toContain("{ label: t({ en: 'Address', zh: '地址' }), value: s.wallet.address ? `${s.wallet.address.slice(0, 8)}…${s.wallet.address.slice(-6)}` : null },");
    expect(screen).toContain("{ label: t({ en: 'Custody', zh: '托管' }), value: s.wallet.custody ?? null },");
    expect(screen).toContain('detail={s.wallet.detail}');
  });

  it('the new block is drawn only when the function answers, and rows for a non-enabled status only when asked', () => {
    expect(screen).toMatch(/economicWalletBlockV1\(s\.wallet, \{ ownWalletEnabled: ownWalletMobileEnabledV1\(\) \}\)/);
    expect(screen).toMatch(/\{walletBlock !== null \? \(/);
    expect(screen).toContain('const enabled = status === \'enabled\' || alwaysRows === true;');
  });
});
