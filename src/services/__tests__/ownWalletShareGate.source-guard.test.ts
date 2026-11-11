/**
 * L8-6 S11b (M9, R3-M5, R4-L3): source guards for the identity card. The share text only goes out through the share gate
 * (`Share.share(` is called once, in the branch where `decideShareV1` answered `share`), and an own wallet's block has no
 * clipboard, no deposit sheet and no full address (W1.2). The blocks are cut by component name, not by line number.
 */
import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..', '..', '..');
const card = fs.readFileSync(path.join(root, 'src/components/agent/AgentEconomicIdentityCard.tsx'), 'utf8').replace(/\r\n/g, '\n');
const lines = card.split('\n');

const indentOf = (line: string): number => line.length - line.trimStart().length;

function ancestorHeaders(index: number): string[] {
  const headers: string[] = [];
  let indent = indentOf(lines[index]);
  for (let i = index - 1; i >= 0 && indent > 0; i -= 1) {
    if (lines[i].trim() === '') continue;
    const here = indentOf(lines[i]);
    if (here < indent) {
      headers.push(lines[i].trim());
      indent = here;
    }
  }
  return headers;
}

/** A top-level function: from its declaration to the lone `}` in column 0 (the parameter list also closes with `}) {`). */
function component(name: string): string {
  const start = lines.findIndex((l) => new RegExp(`^(export )?function ${name}\\(`).test(l));
  if (start < 0) throw new Error(`no component ${name}`);
  let end = start;
  while (end < lines.length && lines[end] !== '}') end += 1;
  return lines.slice(start, end + 1).join('\n');
}

const codeLines = (name: string): number[] =>
  lines.flatMap((line, i) => {
    const code = line.trim();
    if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*') || code.startsWith('{/*')) return [];
    return code.includes(name) ? [i] : [];
  });

describe('the share button goes through the share gate', () => {
  it('Share.share( is called once, and only where decideShareV1 answered share', () => {
    const sites = codeLines('Share.share(');
    expect(sites).toHaveLength(1);
    expect(ancestorHeaders(sites[0]).join(' | ')).toContain("decision.action === 'share'");
  });

  it('the decision is asked before the share and with the card\'s own text, the gate switch and the device check', () => {
    const decide = card.indexOf('decideShareV1({');
    const share = card.indexOf('Share.share(');
    expect(decide).toBeGreaterThan(0);
    expect(decide).toBeLessThan(share);
    expect(card).toContain('gateEnabled: agentShareGateMobileEnabledV1(),');
    expect(card).toContain('shareGate: cd.shareGate,');
    expect(card).toContain('deviceVerified,');
    expect(card).toContain('message: buildShareMessageV1(cd, t),');
    // the share text is not built or edited anywhere else in the card
    expect(card).not.toContain("'https://agentrix.top'");
    expect(card).not.toContain('SHARE_DEEP_LINK');
  });

  it('what is shared is the gate\'s answer, not another string', () => {
    const site = codeLines('Share.share(')[0];
    expect(lines[site].trim()).toBe('await Share.share({ message: decision.message });');
  });

  it('a gate that did not say share shows the sheet (Alert) and returns without sharing or copying', () => {
    const from = card.indexOf('const shareIdentity = useCallback');
    const fn = card.slice(from, card.indexOf('}, [t, deviceVerified', from));
    expect(fn.length).toBeGreaterThan(100);
    const afterShare = fn.slice(fn.indexOf('return;'));
    expect(afterShare).toContain('Alert.alert(');
    expect(afterShare).not.toContain('Share.share(');
    expect(afterShare).not.toContain('Clipboard');
  });
});

describe('an own wallet\'s block (W1.2, R3-M5)', () => {
  const own = component('OwnWalletAddressBlock');

  it('has no clipboard, no deposit sheet and no share', () => {
    expect(own).not.toContain('Clipboard.setStringAsync(');
    expect(own).not.toContain('Clipboard');
    expect(own).not.toContain('<DepositSheet');
    expect(own).not.toContain('DepositSheet');
    expect(own).not.toContain('Share.share(');
    expect(own).not.toContain('setStringAsync');
  });

  it('shows the short address only, never the full account or the old wallet\'s address', () => {
    expect(own).toContain('shortAddressV1(view.account)');
    expect(own).toContain('shortAddressV1(view.legacy.address)');
    expect(own).not.toMatch(/\{view\.account\}/);
    expect(own).not.toMatch(/\{view\.legacy\.address\}/);
    expect(own).not.toMatch(/\{card\.wallet\.address\}/);
    expect(own).not.toContain('card.wallet.explorerUrl');
  });

  it('the only ways out are the wallet origin\'s check and receive pages and (S11c) the setup page for an account without recovery', () => {
    expect(own).toContain('onPress={onVerify}');
    expect(own).toContain('onPress={onReceive}');
    expect(own).toContain('onPress={onSetUp}');
    expect(own).not.toContain('Linking.openURL');
    // "设置恢复" is only for an account whose chain read says recovery is not installed, and it replaces the deposit button there
    const setUp = own.indexOf('onPress={onSetUp}');
    expect(own.slice(own.lastIndexOf('{view.recoveryMissing ? (', setUp), setUp)).not.toContain('onReceive');
  });
  it('S11c: the setup page link is built by ownWalletSetupUrlV1 from the app URL and the Agent id, and goes through openWalletUrl', () => {
    expect(card).toContain('openWalletUrl(ownWalletSetupUrlV1(APP_URL, agentId));');
    expect(card).toContain('onSetUp={openSetup}');
    expect(card).toContain('setupAvailable: ownWalletSetupAvailableV1(cd),');
    expect(card).toContain("sheet.step === 'setup' ? openSetup()");
  });

  it('a lost account and an account without recovery offer no deposit action', () => {
    expect(own).toMatch(/\{!lost \? \(/);
    expect(own).toContain('{!view.recoveryMissing ? (');
  });

  it('the clipboard and the deposit sheet live in the legacy block only', () => {
    const legacy = component('LegacyWalletAddressBlock');
    expect(legacy).toContain('Clipboard.setStringAsync(');
    expect(legacy).toContain('<DepositSheet');
    expect(codeLines('Clipboard.setStringAsync(')).toHaveLength(1);
    expect(codeLines('<DepositSheet')).toHaveLength(1);
    expect(codeLines('Clipboard.setStringAsync(')[0]).toBeGreaterThan(card.split('\n').findIndex((l) => /^function LegacyWalletAddressBlock\(/.test(l)));
  });

  it('the main card picks the own block only for an Agent with an account or an unreadable status', () => {
    expect(card).toContain("const ownBlockShown = ownView !== null && (hasOwnAccount || ownView.status === 'unavailable');");
    expect(card).toContain('{ownBlockShown && ownView !== null ? (');
    expect(card).toContain('<LegacyWalletAddressBlock');
  });

  it('the own-wallet view needs the phone switch AND the card carrying ownWallet', () => {
    expect(card).toContain('const ownView: OwnWalletViewV1 | null = card && ownWalletMobileEnabledV1() ? ownWalletViewOfCardV1(card) : null;');
  });

  it('with the view off the ledger and the compliance lines are the card\'s own', () => {
    expect(card).toContain('const ledgerItems: AgentLedgerItem[] = ownView !== null && !hasOwnAccount ? [] : (ledgerQ.data ? ledgerQ.data.items : []);');
    expect(card).toContain('complianceLinesV1(card.compliance.disclosures, ownView, t)');
  });
});

describe('the wallet origin links the card opens', () => {
  it('every Linking.openURL of the card gets a link built by walletAccountUrlV1 / startOwnAccountV1 or a link the backend named', () => {
    const sites = codeLines('Linking.openURL(');
    // openUrl (explorer, verify page, ledger rows: https links the backend named) and openWalletUrl (our own builders)
    expect(sites).toHaveLength(2);
    for (const call of ['openWalletUrl(walletAccountUrlV1(walletOriginV1(), \'verify-device\'', 'openWalletUrl(walletAccountUrlV1(walletOriginV1(), \'receive\'', 'openWalletUrl(started.url)']) {
      expect(card).toContain(call);
    }
  });

  it('the verify page link is only the exact public verify page shape', () => {
    expect(card).toContain('verifyPageLinkV1(card.onchain.identity?.verifyUrl)');
  });
});
