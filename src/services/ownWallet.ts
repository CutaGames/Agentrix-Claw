/**
 * L8-6 own wallet, phone side (S11b, design 6a, 7.1 "卡片以外的入口" T10 / T11): switches, the wallet origin links,
 * the identity card's own-wallet view and the first account path. Pure: no React Native import; the transport is
 * injected (`ownWalletApi.ts` binds the app's HTTP).
 *
 * - `EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED` and `EXPO_PUBLIC_AGENT_SHARE_GATE_V1_ENABLED` are on only when exactly
 *   '1' (same rule as `deviceMeshReadonly.ts`); the share gate also needs the main switch. They are read as literal
 *   member expressions so the Expo build inlines them.
 * - The phone never signs and never shows a copyable address: every signature and every receive / copy happens on the
 *   wallet origin (W1.2), reached through `Linking.openURL` like the other web handoffs (`webHandoff.ts`). Links carry
 *   what the wallet page needs in the URL fragment, which no request and no Referer carries.
 * - With the phone switch on and the backend's main switch off the card has no `ownWallet` key: the phone treats the
 *   whole feature as off and keeps today's paths.
 */
import { ownWalletChainAllowedV1, type OwnWalletChainIdV1, type OwnWalletCardStatusV1, OWN_WALLET_CARD_STATUSES_V1, decodeOwnWalletSummaryV1, type OwnWalletSummaryAgentV1 } from '../../shared/types/agent-own-wallet';

// ── switches and build constants ─────────────────────────────────────────────────────────────────────────────

export function ownWalletMobileEnabledV1(
  env: { EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED?: string } = { EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED: process.env.EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED },
): boolean {
  return env.EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED === '1';
}

/** The share gate G on the phone: a sub-switch, the main phone switch must be on too. */
export function agentShareGateMobileEnabledV1(
  env: { EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED?: string; EXPO_PUBLIC_AGENT_SHARE_GATE_V1_ENABLED?: string } = {
    EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED: process.env.EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED,
    EXPO_PUBLIC_AGENT_SHARE_GATE_V1_ENABLED: process.env.EXPO_PUBLIC_AGENT_SHARE_GATE_V1_ENABLED,
  },
): boolean {
  return env.EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED === '1' && env.EXPO_PUBLIC_AGENT_SHARE_GATE_V1_ENABLED === '1';
}

const WALLET_ORIGIN = /^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/;

/** The wallet origin the build pins (`EXPO_PUBLIC_AGENT_WALLET_ORIGIN`); '' unless it is a plain https origin. */
export function walletOriginV1(env: { EXPO_PUBLIC_AGENT_WALLET_ORIGIN?: string } = { EXPO_PUBLIC_AGENT_WALLET_ORIGIN: process.env.EXPO_PUBLIC_AGENT_WALLET_ORIGIN }): string {
  const raw = typeof env.EXPO_PUBLIC_AGENT_WALLET_ORIGIN === 'string' ? env.EXPO_PUBLIC_AGENT_WALLET_ORIGIN.trim() : '';
  return WALLET_ORIGIN.test(raw) ? raw : '';
}

// ── words (appendix C unchanged, zh word for word from the web constants; en and the marked lines are suggestions) ─────

export interface BilingualV1 {
  en: string;
  zh: string;
}

export const OWN_WALLET_MOBILE_COPY_V1 = {
  /** Item 4 / 4a / 16 / 30 and the share sheet buttons (6a: "去完成"; coord 11-01: "先不了"). */
  shareCompleteFirst: { en: 'Before sharing, give this agent its own wallet and register it on-chain. You need to confirm once.', zh: '分享之前，先给这个 Agent 建好独立钱包并在链上登记。需要你确认一次。' },
  shareCompleteFirstLegacy: {
    en: 'Before sharing, give this agent its own wallet and register it on-chain, then stop its old custody payments. You need to confirm twice.',
    zh: '分享之前，先给这个 Agent 建好独立钱包并在链上登记，再停用它的旧托管付款。需要你确认两次。',
  },
  shareNotOpen: { en: 'On-chain registration is not open yet, so this cannot be shared right now.', zh: '链上登记还没有开放，现在还不能分享这句话。' },
  shareAcknowledge: { en: 'Got it', zh: '知道了' },
  shareGoComplete: { en: 'Go and finish', zh: '去完成' },
  shareLater: { en: 'Not now', zh: '先不了' },
  /** Appendix C item 24's button (zh word for word from the web constant; en is a suggestion). */
  setUpRecoveryButton: { en: 'Set up recovery', zh: '设置恢复' },
  statusUnavailable: {
    en: "The status of this wallet can't be checked right now. Try again later; the old wallet will not be used to pay in the meantime.",
    zh: '暂时无法核对这个钱包的状态。稍后再试；在这之前不会用旧钱包付款。',
  },
  /** Item 21 / 14 / 3 / 23. */
  upgradeNotice: { en: 'This agent still uses the old custody wallet. Upgrade to its own wallet to get an independent wallet and an on-chain identity.', zh: '这个 Agent 还在用旧托管钱包。升级到它自己的钱包，才有独立钱包和链上身份。' },
  upgradeButton: { en: 'Upgrade to its own wallet', zh: '升级到自己的钱包' },
  cutoverConfirm: {
    en: 'After the upgrade this agent no longer pays with the old custody wallet; automatic payments will use its own wallet (you need to authorize a limit). The money in the old wallet stays and can be moved any time. Stop the old custody payments?',
    zh: '升级以后，这个 Agent 不再用旧托管钱包付款，自动付款要改用它自己的钱包（需要你授权额度）。旧钱包里的钱还在，可以随时迁走。确认停用旧托管付款？',
  },
  cutoverConfirmButton: { en: 'Confirm stop', zh: '确认停用' },
  cutoverLaterButton: { en: 'Not yet', zh: '先不停' },
  legacyCustodyLabel: { en: 'Old custody wallet (the platform can move it)', zh: '旧托管钱包（平台可动）' },
  externalWalletLabel: { en: 'The external wallet you connected', zh: '你连接的外部钱包' },
  /** Item 22, 27 and the address check (6a: "核对地址"). */
  unverified: { en: 'Unchecked', zh: '未核对' },
  verified: { en: 'Checked on this device', zh: '本设备核过' },
  receiveButton: { en: 'Receive / copy address', zh: '收款 / 复制地址' },
  verifyButton: { en: 'Check address', zh: '核对地址' },
  badgeNotChecked: { en: "This device hasn't checked this wallet address yet. Check it once on the wallet page.", zh: '这台设备还没核对过这个钱包地址。先去钱包页核对一次。' },
  /** Item 24 and 20. */
  recoveryNotSet: { en: "The wallet is set up but recovery isn't set yet. Until it is, you can't authorize automatic payments, and don't put money in yet.", zh: '钱包已建好，但恢复还没设置。设置好之前不能授权自动付款，也先别往里充钱。' },
  walletLost: { en: 'This wallet is marked lost: all keys are gone and the money cannot be moved. You can create a new wallet for this agent.', zh: '这个钱包已标为失联：钥匙都找不回来了，钱动不了。可以给这个 Agent 新建一个钱包。' },
  /** Item 2 (compliance line of an own wallet). */
  complianceOwnWallet: {
    en: 'This wallet only recognizes your keys (passkey, recovery code, guardians you choose). Agentrix holds no key that can move money and cannot recover it for you. Testnet assets have no real value; not investment advice.',
    zh: '这个钱包只认你的钥匙（passkey、恢复码、你指定的守护人）。Agentrix 不持有能动钱的钥匙，也无法替你恢复。测试网资产无真实价值，非投资建议。',
  },
  /** S11a part 3's registration lines (suggestions, listed for coord) and "去身份卡查看" / "去钱包页" (plan / design words). */
  registrationNone: { en: 'This agent is not registered on-chain yet.', zh: '这个 Agent 还没有在链上登记。' },
  registrationSubmitted: { en: 'Registration submitted, waiting for chain confirmation.', zh: '登记已提交，等链上确认。' },
  registrationRevoked: { en: "This agent's on-chain registration has been revoked.", zh: '这个 Agent 的链上登记已吊销。' },
  registrationFailed: { en: 'The registration did not go through. Try again later.', zh: '登记没有成功，稍后再试。' },
  requestFailed: { en: 'That did not work. Try again later.', zh: '没有成功，稍后再试。' },
  stepUpRequired: { en: 'This step needs a recent sign-in. Sign in again and retry.', zh: '这一步要求你刚刚登录过。请重新登录，再试一次。' },
  /** Suggestions for coord (E113 ③): the deep-link result screen of the address check. */
  verifyTitle: { en: 'Wallet address check', zh: '钱包核对' },
  verifyDone: { en: 'This device checked the wallet address.', zh: '这台设备核对过这个钱包地址了。' },
  verifyFailed: { en: 'The check did not go through and nothing changed. Check the address again from the identity card.', zh: '这次核对没有成功，什么都没变。可以回到身份卡再核对一次。' },
  verifyBack: { en: 'Back', zh: '返回' },
} as const;

// ── short address and chain names ────────────────────────────────────────────────────────────────────────────

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATE = /^[A-Za-z0-9_-]{22,128}$/;
const CHAIN = /^[1-9][0-9]{0,9}$/;

/** The card's short form (first 8, last 6): the only form of an own account address the phone shows. */
export function shortAddressV1(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function ownWalletChainNameV1(chainId: unknown): string | null {
  if (chainId === 97 || chainId === '97') return 'BSC Testnet';
  if (chainId === 84532 || chainId === '84532') return 'Base Sepolia';
  return null;
}

// ── the card's own-wallet view ───────────────────────────────────────────────────────────────────────────────

export interface OwnWalletLegacyLineV1 {
  type: 'mpc' | 'external';
  address: string;
  label: 'legacy_custody' | 'external';
}

export interface OwnWalletViewV1 {
  status: OwnWalletCardStatusV1;
  /** Only `pending` / `active` / `lost`, and only with an allowed chain and a well-formed address. */
  chainId?: OwnWalletChainIdV1;
  account?: string;
  accountStatus?: 'counterfactual' | 'deployed' | 'lost';
  /** A deployed account whose chain read says recovery is not installed (appendix C item 24). Never guessed: absent key = false. */
  recoveryMissing: boolean;
  /** `none`: where the wallet the card shows comes from (`wallet.label`). `pending` / `active` / `lost`: `legacyCustody`. */
  legacy: OwnWalletLegacyLineV1 | null;
  /** The Agent still uses the old custody wallet (MPC). An external wallet is not custody the platform can move. */
  usesLegacyCustody: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function legacyOf(value: unknown): OwnWalletLegacyLineV1 | null {
  if (!isObject(value) || typeof value.address !== 'string' || value.address.length === 0) return null;
  if ((value.type !== 'mpc' && value.type !== 'external') || (value.label !== 'legacy_custody' && value.label !== 'external')) return null;
  return { type: value.type, address: value.address, label: value.label };
}

/**
 * `null`: the card has no `ownWallet` key (the backend's main switch is off, or an older server): today's card. A key
 * that cannot be read as a card status, or a live status without an allowed chain and a well-formed address, is
 * `unavailable` (appendix C item 30), never `none`.
 */
export function ownWalletViewOfCardV1(card: unknown): OwnWalletViewV1 | null {
  if (!isObject(card) || !('ownWallet' in card) || card.ownWallet === undefined) return null;
  const o = card.ownWallet;
  const unavailable: OwnWalletViewV1 = { status: 'unavailable', recoveryMissing: false, legacy: null, usesLegacyCustody: false };
  if (!isObject(o) || typeof o.status !== 'string' || !(OWN_WALLET_CARD_STATUSES_V1 as readonly string[]).includes(o.status)) return unavailable;
  const status = o.status as OwnWalletCardStatusV1;
  const wallet = isObject(card.wallet) ? card.wallet : {};
  if (status === 'none') {
    const label = wallet.label === 'legacy_custody' || wallet.label === 'external' ? wallet.label : null;
    const address = typeof wallet.address === 'string' && wallet.address.length > 0 ? wallet.address : null;
    const legacy: OwnWalletLegacyLineV1 | null = label && address ? { type: label === 'legacy_custody' ? 'mpc' : 'external', address, label } : null;
    return { status, recoveryMissing: false, legacy, usesLegacyCustody: label === 'legacy_custody' };
  }
  if (status === 'pending' || status === 'active' || status === 'lost') {
    if (!ownWalletChainAllowedV1(o.chainId) || typeof o.accountAddress !== 'string' || !ADDRESS.test(o.accountAddress)) return unavailable;
    const legacy = legacyOf(card.legacyCustody);
    const accountStatus = o.accountStatus === 'counterfactual' || o.accountStatus === 'deployed' || o.accountStatus === 'lost' ? o.accountStatus : undefined;
    const recovery = isObject(o.recovery) && typeof o.recovery.enabled === 'boolean' ? o.recovery : null;
    return {
      status,
      chainId: o.chainId,
      account: o.accountAddress,
      ...(accountStatus ? { accountStatus } : {}),
      recoveryMissing: accountStatus === 'deployed' && recovery !== null && recovery.enabled === false,
      legacy,
      usesLegacyCustody: legacy !== null && legacy.label === 'legacy_custody',
    };
  }
  return { status, recoveryMissing: false, legacy: legacyOf(card.legacyCustody), usesLegacyCustody: false };
}

const MPC_SHARD_DISCLOSURE = '托管钱包采用三方分片';
const TESTNET_DISCLOSURE = '测试网资产无真实价值，非投资建议。';

/**
 * Appendix C item 2 replaces the custody disclosure ("托管钱包采用三方分片…") on a card whose Agent has an own account
 * (pending / active / lost); it already says the testnet sentence, so that plain line is dropped with it. Every other
 * card, and every other line, is returned as it came.
 */
export function complianceLinesV1(disclosures: readonly string[], view: OwnWalletViewV1 | null, t: (d: BilingualV1) => string): string[] {
  const lines = Array.from(disclosures);
  if (view === null || (view.status !== 'pending' && view.status !== 'active' && view.status !== 'lost')) return lines;
  const at = lines.findIndex((line) => typeof line === 'string' && line.includes(MPC_SHARD_DISCLOSURE));
  if (at < 0) return lines;
  lines[at] = t(OWN_WALLET_MOBILE_COPY_V1.complianceOwnWallet);
  return lines.filter((line, i) => i === at || line !== TESTNET_DISCLOSURE);
}

// ── links to the wallet origin (parity with frontend/lib/own-wallet/links.ts, tested against its readers) ─────────────

export type OwnWalletPhonePageV1 = 'receive' | 'verify-device';

export interface OwnWalletAccountLinkV1 {
  chainId: number;
  account: string;
  agentId: string;
  /** `verify-device` only: the phone's one-time state (6a). */
  state?: string;
}

/** `null` when anything is off: no configured origin, an unlisted chain, a malformed address, Agent id or state. */
export function walletAccountUrlV1(walletOrigin: string, page: OwnWalletPhonePageV1, link: OwnWalletAccountLinkV1): string | null {
  if (typeof walletOrigin !== 'string' || !WALLET_ORIGIN.test(walletOrigin)) return null;
  if (!ownWalletChainAllowedV1(link.chainId) || !ADDRESS.test(String(link.account)) || !UUID.test(String(link.agentId))) return null;
  const fragment = new URLSearchParams();
  fragment.set('chainId', String(link.chainId));
  fragment.set('account', link.account.toLowerCase());
  fragment.set('kind', 'agent');
  fragment.set('agent', link.agentId);
  if (page === 'verify-device' && link.state !== undefined) {
    if (!STATE.test(link.state)) return null;
    fragment.set('state', link.state);
  }
  return `${walletOrigin}/wallet/${page}/#${fragment.toString()}`;
}

const REQUEST_REF = /^owr_[0-9a-f]{32}$/;
const WALLET_TOKEN = /^owt_[A-Za-z0-9_-]{43}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export function walletCreateUrlV1(walletOrigin: string, link: { requestRef: string; walletToken: string; agentId: string; agentName?: string }): string | null {
  if (typeof walletOrigin !== 'string' || !WALLET_ORIGIN.test(walletOrigin)) return null;
  if (!REQUEST_REF.test(String(link.requestRef)) || !WALLET_TOKEN.test(String(link.walletToken)) || !UUID.test(String(link.agentId))) return null;
  const fragment = new URLSearchParams();
  fragment.set('ref', link.requestRef);
  fragment.set('t', link.walletToken);
  fragment.set('kind', 'agent');
  fragment.set('agent', link.agentId);
  // The page refuses a name that is empty, over 60 characters or has a control character: leave it out instead.
  if (typeof link.agentName === 'string' && link.agentName.length > 0 && link.agentName.length <= 60 && !CONTROL.test(link.agentName)) fragment.set('name', link.agentName);
  return `${walletOrigin}/wallet/create/#${fragment.toString()}`;
}

// ── the setup wizard (S11c) ──────────────────────────────────────────────────────────────────────────────────

/**
 * The main site's fixed setup page `/own-wallet/setup` (frontend/lib/own-wallet/links.ts `mainSetupStartPathV1`): the page
 * reads the Agent's identity card, opens the wallet origin's wizard (recovery code or guardians) or the registration
 * signature, and needs the owner signed in on the web, like the other web-only steps (`webHandoff.ts`). The link names
 * the Agent only; `null` for an app URL that is not a plain https origin or an id that is not a UUID.
 */
export function ownWalletSetupUrlV1(appUrl: string, agentId: string): string | null {
  const base = typeof appUrl === 'string' ? appUrl.trim().replace(/\/+$/, '') : '';
  if (!WALLET_ORIGIN.test(base) || typeof agentId !== 'string' || !UUID.test(agentId)) return null;
  return `${base}/own-wallet/setup#agent=${agentId}`;
}

/**
 * Whether the card plainly says what the setup page can do next (frontend/lib/own-wallet-main/setup.ts
 * `decideOwnWalletSetupV1`, same rules): an account not deployed yet; a deployed one whose recovery is off; a deployed one
 * with recovery on that is not registered while registration is open. A card that does not say (no `ownWallet`, recovery
 * unreadable, a registration that waits or was revoked, a lost or missing wallet) never offers the step.
 */
export function ownWalletSetupAvailableV1(card: unknown): boolean {
  if (!isObject(card) || !isObject(card.ownWallet)) return false;
  const o = card.ownWallet;
  if (o.status !== 'pending' && o.status !== 'active') return false;
  if (!ownWalletChainAllowedV1(o.chainId) || typeof o.accountAddress !== 'string' || !ADDRESS.test(o.accountAddress)) return false;
  if (o.accountStatus === 'counterfactual') return true;
  if (o.accountStatus !== 'deployed') return false;
  if (!isObject(o.recovery) || typeof o.recovery.enabled !== 'boolean') return false;
  if (o.recovery.enabled === false) return true;
  const gate = isObject(card.shareGate) ? card.shareGate : {};
  const onchain = isObject(card.onchain) ? card.onchain : {};
  const identity = isObject(onchain.identity) ? onchain.identity : {};
  const registration = typeof identity.status === 'string' ? identity.status : undefined;
  if (registration !== undefined && registration !== 'none' && registration !== 'failed') return false;
  return gate.registrationOpen === true && gate.registrationConfirmed !== true;
}

// ── the deep link back from the wallet origin ────────────────────────────────────────────────────────────────

/** The path of `agentrix://wallet-verified?state=…&account=…&chainId=…` (frontend/lib/own-wallet/verify-device.ts). */
export const WALLET_VERIFIED_PATH_V1 = 'wallet-verified';

export interface VerifiedLinkParamsV1 {
  state: string;
  /** Lower case. */
  account: string;
  chainId: OwnWalletChainIdV1;
}

/** Reads the route params of the deep link. Anything missing, repeated or out of shape is no link. */
export function readVerifiedParamsV1(params: unknown): { ok: true; value: VerifiedLinkParamsV1 } | { ok: false } {
  if (!isObject(params)) return { ok: false };
  const { state, account, chainId } = params;
  if (typeof state !== 'string' || !STATE.test(state)) return { ok: false };
  if (typeof account !== 'string' || !ADDRESS.test(account)) return { ok: false };
  if (typeof chainId !== 'string' || !CHAIN.test(chainId)) return { ok: false };
  const chain = Number(chainId);
  if (!ownWalletChainAllowedV1(chain)) return { ok: false };
  return { ok: true, value: { state, account: account.toLowerCase(), chainId: chain } };
}

// ── HTTP (injected) ──────────────────────────────────────────────────────────────────────────────────────────

export type OwnWalletHttpV1 = (method: 'GET' | 'POST', path: string, body?: unknown) => Promise<{ status: number; body: unknown }>;

const unwrap = (body: unknown): unknown => (isObject(body) && isObject(body.data) ? body.data : body);
const codeOf = (body: unknown): string => {
  const inner = isObject(body) ? body : {};
  const code = inner.code ?? (isObject(inner.error) ? inner.error.code : undefined) ?? (isObject(inner.data) ? inner.data.code : undefined);
  return typeof code === 'string' ? code : 'request_failed';
};

export type OwnWalletStartResultV1 =
  | { outcome: 'account_ready'; accountAddress: string; chainId: number }
  | { outcome: 'open_wallet'; url: string }
  | { outcome: 'failed'; code: string };

/**
 * The first account path of an Agent (the same two calls as the main site): `POST accounts/agent` makes the account when the
 * owner already has a wallet passkey; with none (409 `wallet_passkey_required`) `POST accounts/create-requests` gives the
 * request ref and the one-time token and the owner continues on the wallet origin's create page.
 */
export async function startOwnAccountV1(input: { agentId: string; agentName?: string; walletOrigin: string; http: OwnWalletHttpV1 }): Promise<OwnWalletStartResultV1> {
  if (!WALLET_ORIGIN.test(input.walletOrigin)) return { outcome: 'failed', code: 'wallet_origin_not_configured' };
  if (!UUID.test(String(input.agentId))) return { outcome: 'failed', code: 'agent_required' };
  let first: { status: number; body: unknown };
  try {
    first = await input.http('POST', '/agent-own-wallet/accounts/agent', { agentId: input.agentId });
  } catch {
    return { outcome: 'failed', code: 'network_unavailable' };
  }
  if (first.status === 200 || first.status === 201) {
    const v = unwrap(first.body);
    const accountAddress = isObject(v) ? v.accountAddress : undefined;
    const chainId = isObject(v) ? v.chainId : undefined;
    return typeof accountAddress === 'string' && typeof chainId === 'number' ? { outcome: 'account_ready', accountAddress, chainId } : { outcome: 'failed', code: 'response_malformed' };
  }
  if (first.status !== 409 || codeOf(first.body) !== 'wallet_passkey_required') return { outcome: 'failed', code: codeOf(first.body) };
  let second: { status: number; body: unknown };
  try {
    second = await input.http('POST', '/agent-own-wallet/accounts/create-requests', { kind: 'agent', agentId: input.agentId });
  } catch {
    return { outcome: 'failed', code: 'network_unavailable' };
  }
  if (second.status !== 200 && second.status !== 201) return { outcome: 'failed', code: codeOf(second.body) };
  const v = unwrap(second.body);
  const url = isObject(v) ? walletCreateUrlV1(input.walletOrigin, { requestRef: String(v.requestRef), walletToken: String(v.walletToken), agentId: input.agentId, agentName: input.agentName }) : null;
  return url ? { outcome: 'open_wallet', url } : { outcome: 'failed', code: 'response_malformed' };
}

/** Appendix C item 14, confirmed: stop the old custody payments (one way; the server asks for a recent sign-in). */
export async function confirmLegacyCutoverV1(input: { agentId: string; http: OwnWalletHttpV1 }): Promise<{ ok: true } | { ok: false; code: string }> {
  if (!UUID.test(String(input.agentId))) return { ok: false, code: 'agent_required' };
  try {
    const result = await input.http('POST', `/agent-own-wallet/accounts/agent/${encodeURIComponent(input.agentId)}/legacy-cutover`, { confirm: true });
    return result.status === 200 || result.status === 201 ? { ok: true } : { ok: false, code: codeOf(result.body) };
  } catch {
    return { ok: false, code: 'network_unavailable' };
  }
}

export type OwnWalletSummaryReadV1 = { kind: 'ready'; agents: OwnWalletSummaryAgentV1[] } | { kind: 'off' } | { kind: 'unavailable' };

/** `GET /agent-own-wallet/summary`: 404 is the backend's main switch being off, anything else that is not a decodable list is unavailable. */
export async function readOwnWalletSummaryV1(http: OwnWalletHttpV1): Promise<OwnWalletSummaryReadV1> {
  try {
    const res = await http('GET', '/agent-own-wallet/summary');
    if (res.status === 404) return { kind: 'off' };
    if (res.status !== 200) return { kind: 'unavailable' };
    const decoded = decodeOwnWalletSummaryV1(unwrap(res.body));
    return decoded.ok === true ? { kind: 'ready', agents: decoded.value.agents } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

/** The own-wallet view of an Agent's economic identity card, read through the injected transport. */
export async function readOwnWalletCardViewV1(http: OwnWalletHttpV1, agentAccountId: string): Promise<{ kind: 'ok'; view: OwnWalletViewV1 | null } | { kind: 'failed' }> {
  if (typeof agentAccountId !== 'string' || !/^[A-Za-z0-9._:@-]{1,128}$/.test(agentAccountId)) return { kind: 'failed' };
  try {
    const res = await http('GET', `/agent-accounts/${encodeURIComponent(agentAccountId)}/economic-identity`);
    if (res.status !== 200) return { kind: 'failed' };
    return { kind: 'ok', view: ownWalletViewOfCardV1(unwrap(res.body)) };
  } catch {
    return { kind: 'failed' };
  }
}
