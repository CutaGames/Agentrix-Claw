/**
 * L8-6 S11b (T10, R4-L3): source guards for the Agent account screen. The screen is React Native (no component renderer in
 * this repo's jest, R2-M11), so these read the source: where the MPC wallet is created, where the relayer registration is
 * posted, what the wallet row can copy. They find a block by the indentation of the source (not by line numbers) and name
 * the functions they cut.
 */
import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..', '..', '..');
// Some of these files use CRLF line endings; the guards read them with LF.
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const screen = read('src/screens/agent/AgentAccountScreen.tsx');
const lines = screen.split('\n');

const indentOf = (line: string): number => line.length - line.trimStart().length;

/** The text of the lines that head the blocks around line `index` (nearest first), found by indentation. */
function ancestorHeaders(index: number): string[] {
  const headers: string[] = [];
  let indent = indentOf(lines[index]);
  for (let i = index - 1; i >= 0 && indent > 0; i -= 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const here = indentOf(line);
    if (here < indent) {
      headers.push(line.trim());
      indent = here;
    }
  }
  return headers;
}

/** Line indexes of a call (`name(`), without its definition and without comments. */
function callSites(name: string): number[] {
  const out: number[] = [];
  lines.forEach((line, i) => {
    const code = line.trim();
    if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*') || code.startsWith('{/*')) return;
    if (code.includes(`${name}(`) && !code.startsWith(`async function ${name}(`) && !code.startsWith(`function ${name}(`)) out.push(i);
  });
  return out;
}

/** The source of a top-level function: from its declaration to the closing brace in column 0. */
function topLevelFunction(name: string): string {
  const start = lines.findIndex((l) => new RegExp(`^(async )?function ${name}\\(`).test(l));
  if (start < 0) throw new Error(`no function ${name}`);
  let end = start;
  // The parameter list closes with `}: {` and `}) {` in column 0 too; only a lone `}` ends the function.
  while (end < lines.length && lines[end] !== '}') end += 1;
  return lines.slice(start, end + 1).join('\n');
}

describe('AgentAccountScreen: the MPC wallet is created only on the legacy path', () => {
  it('openWalletForAgent( is called only inside a legacy_mpc_create branch', () => {
    const sites = callSites('openWalletForAgent');
    expect(sites.length).toBeGreaterThanOrEqual(2);
    for (const site of sites) {
      const headers = ancestorHeaders(site).join(' | ');
      expect([lines[site].trim(), headers.includes('legacy_mpc_create')]).toEqual([lines[site].trim(), true]);
    }
  });

  it('"/mpc-wallet/create" is written once, in openWalletForAgent, and nowhere in the own-wallet branches', () => {
    expect(screen.split("'/mpc-wallet/create'").length - 1).toBe(1);
    const definition = topLevelFunction('openWalletForAgent');
    expect(definition).toContain("'/mpc-wallet/create'");
    const ownRow = topLevelFunction('OwnWalletRow');
    expect(ownRow).not.toContain('mpc-wallet');
    expect(ownRow).not.toContain('openWalletForAgent');
    expect(topLevelFunction('openOwnWalletOrigin')).not.toContain('mpc-wallet');
  });

  it('the own-wallet branches of the create flow and the open-wallet button never reach the MPC call', () => {
    const create = lines.findIndex((l) => l.includes('onSuccess: async (result) => {'));
    expect(create).toBeGreaterThan(0);
    const body = lines.slice(create, create + 60).join('\n');
    for (const branch of ["after.action === 'own_wallet_ready'", "after.action === 'open_wallet_origin'", "after.action === 'own_wallet_unavailable'"]) {
      const at = body.indexOf(branch);
      expect(at).toBeGreaterThan(0);
      const next = body.indexOf('} else if', at);
      expect(body.slice(at, next)).not.toContain('openWalletForAgent(');
    }
    const open = lines.findIndex((l) => l.includes('const handleOpenWallet = async'));
    const openBody = lines.slice(open, open + 14).join('\n');
    expect(openBody).toContain("open.action === 'open_wallet_origin'");
    expect(openBody.slice(0, openBody.indexOf('return;'))).not.toContain('openWalletForAgent(');
  });

  it('today\'s branches are still there, word for word (switch off)', () => {
    expect(screen).toContain('has been created with an independent MPC wallet.');
    expect(screen).toContain('已创建完成，并已配置独立 MPC 钱包。');
    expect(screen).toContain('钱包激活失败——请点击卡片上的“打开独立钱包”重试');
    expect(screen).toContain("t({ en: 'Open Independent Wallet', zh: '打开独立钱包' })");
    expect(screen).toContain('私钥分成 3 份保管；签名时由 Agentrix 服务器临时合成其中两份，而且只在该智能体的支出限制内签署。');
    expect(screen).toContain("decideAfterAgentCreatedV1({ ownWalletEnabled: ownWalletOn, card })");
    expect(screen).toContain("decideOpenWalletV1({ ownWalletEnabled: ownWalletMobileEnabledV1() })");
  });
});

describe('AgentAccountScreen: the relayer registration is posted only on the legacy_post path', () => {
  it('registerOnchain( is called only inside a legacy_post branch', () => {
    const sites = callSites('registerOnchain');
    expect(sites).toHaveLength(1);
    expect(ancestorHeaders(sites[0]).join(' | ')).toContain("decision.register === 'legacy_post'");
  });

  it('S11c: the open_setup branch opens the main site\'s setup page and never reaches the relayer registration or the MPC call', () => {
    const at = lines.findIndex((l) => l.includes("if (decision.register === 'open_setup') {"));
    expect(at).toBeGreaterThan(0);
    const branch = lines.slice(at, at + 7).join('\n');
    expect(branch).toContain('ownWalletSetupUrlV1(APP_URL, agentAccountId)');
    expect(branch).toContain('Linking.openURL(setupUrl)');
    expect(branch).not.toContain('registerOnchain(');
    expect(branch).not.toContain('mpc-wallet');
    expect(branch).not.toContain('openWalletForAgent(');
    expect(screen).toContain('testID="chain-identity-go-setup"');
  });
  it('the button that opens the wallet origin is the open_wallet_origin branch, and the badge reads the decision', () => {
    expect(screen).toContain("decision.register === 'open_wallet_origin'");
    expect(screen).toContain('decideIdentityBadgeV1(onchain,');
    expect(screen).toContain("decision.badge === 'registered'");
    // the legacy reading of `onchain.registered` is gone from the screen: the decision is the only reader
    expect(screen).not.toMatch(/if \(onchain\.registered\)/);
  });
});

describe('AgentAccountScreen: what the wallet row and the card can copy (W1.2)', () => {
  it('the clipboard is used twice: the old wallet address on the legacy row, and the API key (white list)', () => {
    const sites = callSites('Clipboard.setStringAsync');
    expect(sites).toHaveLength(2);
    const kinds = sites.map((i) => lines[i].trim());
    expect(kinds.filter((l) => l.includes('(agent as any).walletAddress'))).toHaveLength(1);
    expect(kinds.filter((l) => l.includes('agentApiKey.key!'))).toHaveLength(1);
  });

  it('the wallet-address copy sits in renderWalletRow after the own-wallet branch has returned', () => {
    const fn = topLevelFunction('renderWalletRow');
    const ownBranchStart = fn.indexOf('if (ownWalletMobileEnabledV1()) {');
    const ownBranchEnd = fn.indexOf('  }\n', ownBranchStart);
    expect(ownBranchStart).toBeGreaterThan(0);
    const ownBranch = fn.slice(ownBranchStart, ownBranchEnd);
    expect(ownBranch).toContain('<OwnWalletRow');
    expect(ownBranch).not.toContain('Clipboard.setStringAsync(');
    expect(ownBranch).not.toContain('mpc-wallet');
    expect(fn.indexOf('Clipboard.setStringAsync(')).toBeGreaterThan(ownBranchEnd);
  });

  it('OwnWalletRow shows the short address and the check state, no clipboard and no full address', () => {
    const row = topLevelFunction('OwnWalletRow');
    expect(row).not.toContain('Clipboard');
    expect(row).toContain('shortAddressV1(view.account)');
    expect(row).not.toMatch(/\{view\.account\}/);
    expect(row).not.toMatch(/\{card\.wallet\.address\}/);
    expect(row).not.toContain('(agent as any).walletAddress');
  });
});

describe('deep link wiring', () => {
  it('the screen and the link entry exist only with the phone switch on', () => {
    const nav = read('src/navigation/MeStackNavigator.tsx');
    expect(nav).toMatch(/\{ownWalletMobileEnabledV1\(\) \? \(\s*<Stack\.Screen name="AgentOwnWallet" component=\{AgentOwnWalletScreen\}/);
    const app = read('App.tsx');
    expect(app).toContain('...(ownWalletMobileEnabledV1() ? { AgentOwnWallet: WALLET_VERIFIED_PATH_V1 } : {}),');
    expect(read('src/navigation/types.ts')).toContain('AgentOwnWallet: { state?: string; account?: string; chainId?: string } | undefined;');
  });

  it('the landing screen accepts the link only through acceptVerifiedLinkV1, once', () => {
    const landing = read('src/screens/agent/AgentOwnWalletScreen.tsx');
    expect(landing.split('acceptVerifiedLinkV1(').length - 1).toBe(1);
    expect(landing).toContain('started.current');
    expect(landing).not.toContain('Clipboard');
    expect(landing).not.toContain('Linking.openURL');
  });
});
