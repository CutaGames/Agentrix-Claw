/**
 * L9 F1（F 线）：名片上挂链上名字（只认 ENS 的 `.eth` 名字）。名字、X 账号、钱包三方互证，三条缺一条就不亮（暗）：
 *  (1) 钱包：名字正向解析到的地址，是这位主人用签名绑过的钱包之一（钱包登录、F11 绑定）；
 *  (2) 反向：那个地址反向解析回同一个名字；
 *  (3) X：主人用 X 登录（OAuth）得到的账号名，等于名字的文本记录 `com.twitter` 里写的账号名
 *      （文本记录谁都能填，所以必须有 OAuth 这一边）。
 * 链上只读：正向、反向、文本记录三次查询；不发任何交易，不碰钱，不碰私钥。RPC 地址只读环境变量
 * `ONCHAIN_NAME_ETH_RPC_URL`（https），没配就一律不亮。
 *
 * 链上查到的三样东西缓存 6 小时；库里的两样（主人绑的钱包、X 账号）每次现读，所以解绑钱包或 X 立刻变暗。
 *
 * 开关：后端 `ONCHAIN_NAME_V1_ENABLED`，网页 `NEXT_PUBLIC_ONCHAIN_NAME_V1_ENABLED`（编译期），都只认精确的 `'1'`，默认关。
 * 主人侧入口受 L9 名单约束；公开接口只给名单内主人的分身亮名字。
 */
export const ONCHAIN_NAME_FLAG_V1 = 'ONCHAIN_NAME_V1_ENABLED' as const;
export const ONCHAIN_NAME_WEB_FLAG_V1 = 'NEXT_PUBLIC_ONCHAIN_NAME_V1_ENABLED' as const;
export const ONCHAIN_NAME_RPC_ENV_V1 = 'ONCHAIN_NAME_ETH_RPC_URL' as const;
export const ONCHAIN_NAME_SCHEMA_VERSION_V1 = 1 as const;
/** 链上查到的结果最多用多久（秒）。 */
export const ONCHAIN_NAME_CHAIN_TTL_SECONDS_V1 = 6 * 60 * 60;
/** 主人「再查一次」的最短间隔（秒）。 */
export const ONCHAIN_NAME_RECHECK_MIN_SECONDS_V1 = 30;
export const ONCHAIN_NAME_RATE_V1 = { perAgentPerMinute: 30, perAddressPerMinute: 60 } as const;
export const ONCHAIN_NAME_TWITTER_RECORD_KEY_V1 = 'com.twitter' as const;
export const ONCHAIN_NAME_ME_ROUTE_V1 = '/onchain-name/v1/me' as const;
export const ONCHAIN_NAME_CHECK_ROUTE_V1 = '/onchain-name/v1/me/check' as const;

export function onchainNamePublicPathV1(agentId: string): string {
  return `/v1/public/onchain-name/agents/${encodeURIComponent(agentId)}`;
}
/** 名片上「核对」点开去的地方：ENS 官方页面，不经过我们。 */
export function onchainNameCheckUrlV1(name: string): string {
  return `https://app.ens.domains/${encodeURIComponent(name)}`;
}

export const ONCHAIN_NAME_ERROR_CODES_V1 = {
  notFound: 'ONCHAIN_NAME_NOT_FOUND',
  signInRequired: 'ONCHAIN_NAME_SIGN_IN_REQUIRED',
  invalidName: 'ONCHAIN_NAME_INVALID',
  tooSoon: 'ONCHAIN_NAME_TOO_SOON',
  unavailable: 'ONCHAIN_NAME_UNAVAILABLE',
} as const;

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const ENS_NAME = new RegExp(`^(?:${LABEL}\\.)+eth$`);

/** `alice.eth` 这类名字：去空格、转小写；只认 ASCII 字母数字和连字符的 `.eth` 名字，否则 `null`。 */
export function normalizeEnsNameV1(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().toLowerCase();
  return name.length >= 7 && name.length <= 255 && ENS_NAME.test(name) ? name : null;
}

/** X 账号名：去掉 `@`、`https://x.com/`、`https://twitter.com/`，转小写；不像账号名就 `null`。 */
export function normalizeXHandleV1(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let handle = value.trim();
  const url = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)\/?$/i.exec(handle);
  if (url) handle = url[1];
  if (handle.startsWith('@')) handle = handle.slice(1);
  handle = handle.toLowerCase();
  return /^[a-z0-9_]{1,15}$/.test(handle) ? handle : null;
}

/** 链上查到的三样东西（地址都是小写）。 */
export interface OnchainNameChainFactsV1 {
  resolvedAddress: string | null;
  reverseName: string | null;
  twitterRecord: string | null;
}

/** 库里现读的两样：主人签名绑过的钱包（小写）和 OAuth 得到的 X 账号名。 */
export interface OnchainNameOwnerFactsV1 {
  wallets: readonly string[];
  xHandle: string | null;
}

export interface OnchainNameChecksV1 {
  wallet: boolean;
  reverse: boolean;
  x: boolean;
}

/** 三条判定（前后端、测试共用一份）。三条都是 `true` 才亮。 */
export function evaluateOnchainNameV1(name: string, chain: OnchainNameChainFactsV1, owner: OnchainNameOwnerFactsV1): OnchainNameChecksV1 {
  const normalized = normalizeEnsNameV1(name);
  const resolved = typeof chain.resolvedAddress === 'string' && /^0x[0-9a-f]{40}$/i.test(chain.resolvedAddress) ? chain.resolvedAddress.toLowerCase() : null;
  const wallets = new Set(owner.wallets.map((wallet) => wallet.toLowerCase()));
  const wallet = !!normalized && !!resolved && wallets.has(resolved);
  const reverse = !!normalized && normalizeEnsNameV1(chain.reverseName) === normalized;
  const ownerX = normalizeXHandleV1(owner.xHandle);
  const x = !!normalized && !!ownerX && normalizeXHandleV1(chain.twitterRecord) === ownerX;
  return { wallet, reverse, x };
}

export function onchainNameLitV1(checks: OnchainNameChecksV1): boolean {
  return checks.wallet === true && checks.reverse === true && checks.x === true;
}

export const ONCHAIN_NAME_STATES_V1 = ['none', 'unchecked', 'checked', 'unavailable'] as const;
export type OnchainNameStateV1 = (typeof ONCHAIN_NAME_STATES_V1)[number];

/** 主人看到的状态。`state`：没填名字 / 填了还没查 / 查过 / 链上查不了（没配或出错）。 */
export interface OnchainNameOwnerStatusV1 {
  schemaVersion: typeof ONCHAIN_NAME_SCHEMA_VERSION_V1;
  name: string | null;
  state: OnchainNameStateV1;
  checks: OnchainNameChecksV1;
  lit: boolean;
  checkedAt: string | null;
}

/** 公开回答：只有亮的时候才有（其余一律 404）。 */
export interface OnchainNamePublicV1 {
  schemaVersion: typeof ONCHAIN_NAME_SCHEMA_VERSION_V1;
  name: string;
  checkedAt: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function sameKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

export function decodeOnchainNameOwnerStatusV1(value: unknown): OnchainNameOwnerStatusV1 | null {
  if (!isRecord(value) || !sameKeys(value, ['schemaVersion', 'name', 'state', 'checks', 'lit', 'checkedAt'])) return null;
  if (value.schemaVersion !== ONCHAIN_NAME_SCHEMA_VERSION_V1) return null;
  if (typeof value.state !== 'string' || !(ONCHAIN_NAME_STATES_V1 as readonly string[]).includes(value.state)) return null;
  const name = value.name === null ? null : normalizeEnsNameV1(value.name);
  if (value.name !== null && name !== value.name) return null;
  if ((value.state === 'none') !== (name === null)) return null;
  const checks = value.checks;
  if (!isRecord(checks) || !sameKeys(checks, ['wallet', 'reverse', 'x'])) return null;
  if (typeof checks.wallet !== 'boolean' || typeof checks.reverse !== 'boolean' || typeof checks.x !== 'boolean') return null;
  const parsed: OnchainNameChecksV1 = { wallet: checks.wallet, reverse: checks.reverse, x: checks.x };
  if (typeof value.lit !== 'boolean' || value.lit !== (onchainNameLitV1(parsed) && value.state === 'checked')) return null;
  if (!(value.checkedAt === null || (typeof value.checkedAt === 'string' && ISO.test(value.checkedAt)))) return null;
  return {
    schemaVersion: ONCHAIN_NAME_SCHEMA_VERSION_V1,
    name,
    state: value.state as OnchainNameStateV1,
    checks: parsed,
    lit: value.lit,
    checkedAt: value.checkedAt as string | null,
  };
}

/** `{ success: true, data }` 或直接的 `data` 都认；多一个字段就拒收（公开回答里不能混进地址或主人信息）。 */
export function decodeOnchainNamePublicV1(body: unknown): OnchainNamePublicV1 | null {
  const data = isRecord(body) && sameKeys(body, ['success', 'data']) && body.success === true ? body.data : null;
  if (!isRecord(data) || !sameKeys(data, ['schemaVersion', 'name', 'checkedAt'])) return null;
  if (data.schemaVersion !== ONCHAIN_NAME_SCHEMA_VERSION_V1 || typeof data.checkedAt !== 'string' || !ISO.test(data.checkedAt)) return null;
  const name = normalizeEnsNameV1(data.name);
  if (!name || name !== data.name) return null;
  return { schemaVersion: ONCHAIN_NAME_SCHEMA_VERSION_V1, name, checkedAt: data.checkedAt };
}
