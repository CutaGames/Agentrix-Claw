/**
 * L9 F11（F 线）：在设置里把钱包绑到已登录的账户上（同一个人的钱包、邮箱、X 是一个账户，口碑不碎成两份）。登录页一点不动。
 *
 * 流程：设置页拿到钱包地址 → `POST /auth/wallet-bind/v1/challenge`（登录、最近 10 分钟登录过、L9 名单内）→ 后端发一份
 * 一次性的签名挑战（EIP-4361 格式的文字：本站域名、钱包地址、128 位随机 nonce、签发和过期时间、挑战编号、账户的不可逆引用）
 * → 钱包 `personal_sign` → `POST /auth/wallet-bind/v1/confirm`（同样要最近登录）。后端按库里存的字段重建原文（不信客户端发来的
 * 文字），先原子地把挑战作废（只有一个请求能用上它，验签失败也算用过），再从签名恢复地址，和挑战里的地址逐字比对。
 *
 * 防重放：挑战只属于发起它的账户、只在本站域名下有效、5 分钟过期、用过即作废；同一账户同时有效的挑战最多 5 个。
 * 不发交易、不花钱、不碰私钥。老账户合并不做。
 *
 * 开关：后端 `WALLET_BIND_V1_ENABLED`，网页 `NEXT_PUBLIC_WALLET_BIND_V1_ENABLED`（编译期），都只认精确的 `'1'`，默认关。
 * 后端关着时新路由 404、不读库，旧的 `POST /auth/wallet/bind` 一字不变；开着时旧路由也要最近登录（不能绕开 step-up）。
 */
export const WALLET_BIND_FLAG_V1 = 'WALLET_BIND_V1_ENABLED' as const;
export const WALLET_BIND_WEB_FLAG_V1 = 'NEXT_PUBLIC_WALLET_BIND_V1_ENABLED' as const;
export const WALLET_BIND_SCHEMA_VERSION_V1 = 1 as const;
export const WALLET_BIND_CHALLENGE_TTL_SECONDS_V1 = 300;
export const WALLET_BIND_MAX_LIVE_CHALLENGES_V1 = 5;
export const WALLET_BIND_CHALLENGE_ROUTE_V1 = '/auth/wallet-bind/v1/challenge' as const;
export const WALLET_BIND_CONFIRM_ROUTE_V1 = '/auth/wallet-bind/v1/confirm' as const;
export const WALLET_BIND_LIST_ROUTE_V1 = '/auth/wallet-bind/v1/wallets' as const;
/** 设置页的位置（写进签名原文的 URI）。 */
export const WALLET_BIND_SETTINGS_PATH_V1 = '/console/settings/security' as const;
export const WALLET_BIND_ADDRESS_PATTERN_V1 = /^0x[0-9a-fA-F]{40}$/;
export const WALLET_BIND_SIGNATURE_PATTERN_V1 = /^0x[0-9a-fA-F]{130}$/;
export const WALLET_BIND_NONCE_PATTERN_V1 = /^[0-9a-f]{32}$/;

export const WALLET_BIND_ERROR_CODES_V1 = {
  notFound: 'WALLET_BIND_NOT_FOUND',
  signInRequired: 'WALLET_BIND_SIGN_IN_REQUIRED',
  invalidAddress: 'WALLET_BIND_INVALID_ADDRESS',
  challengeInvalid: 'WALLET_BIND_CHALLENGE_INVALID',
  signatureInvalid: 'WALLET_BIND_SIGNATURE_INVALID',
  taken: 'WALLET_BIND_TAKEN',
  tooMany: 'WALLET_BIND_TOO_MANY',
} as const;
export type WalletBindErrorCodeV1 = (typeof WALLET_BIND_ERROR_CODES_V1)[keyof typeof WALLET_BIND_ERROR_CODES_V1];

export interface WalletBindChallengeV1 {
  schemaVersion: typeof WALLET_BIND_SCHEMA_VERSION_V1;
  challengeId: string;
  /** 交给钱包签名的原文。 */
  message: string;
  expiresAt: string;
}

export interface WalletBindWalletV1 {
  id: string;
  /** EIP-55 大小写校验格式。 */
  address: string;
  isDefault: boolean;
}

export interface WalletBindResultV1 {
  schemaVersion: typeof WALLET_BIND_SCHEMA_VERSION_V1;
  wallet: WalletBindWalletV1;
}

export interface WalletBindListV1 {
  schemaVersion: typeof WALLET_BIND_SCHEMA_VERSION_V1;
  wallets: WalletBindWalletV1[];
}

/**
 * 签名原文（EIP-4361，钱包会核对第一行的域名和当前网站是否一致）。前后端用同一份，后端只从库里存的字段重建。
 * `address` 必须是 EIP-55 格式，`accountRef` 是账户 id 的不可逆摘要（不把账户 id 交给钱包）。
 */
export function buildWalletBindMessageV1(input: {
  domain: string;
  address: string;
  accountRef: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  challengeId: string;
}): string {
  return [
    `${input.domain} wants you to sign in with your Ethereum account:`,
    input.address,
    '',
    'Link this wallet to your signed-in Agentrix account. This sends no transaction and costs nothing.',
    '',
    `URI: https://${input.domain}${WALLET_BIND_SETTINGS_PATH_V1}`,
    'Version: 1',
    'Chain ID: 1',
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expiresAt}`,
    `Request ID: ${input.challengeId}`,
    'Resources:',
    `- urn:agentrix:account:${input.accountRef}`,
  ].join('\n');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function sameKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}
function decodeWallet(value: unknown): WalletBindWalletV1 | null {
  if (!isRecord(value) || !sameKeys(value, ['id', 'address', 'isDefault'])) return null;
  if (typeof value.id !== 'string' || !UUID.test(value.id)) return null;
  if (typeof value.address !== 'string' || !WALLET_BIND_ADDRESS_PATTERN_V1.test(value.address) || typeof value.isDefault !== 'boolean') return null;
  return { id: value.id, address: value.address, isDefault: value.isDefault };
}

export function decodeWalletBindChallengeV1(value: unknown): WalletBindChallengeV1 | null {
  if (!isRecord(value) || !sameKeys(value, ['schemaVersion', 'challengeId', 'message', 'expiresAt'])) return null;
  if (value.schemaVersion !== WALLET_BIND_SCHEMA_VERSION_V1 || typeof value.challengeId !== 'string' || !UUID.test(value.challengeId)) return null;
  if (typeof value.message !== 'string' || value.message.length > 2000 || typeof value.expiresAt !== 'string' || !ISO.test(value.expiresAt)) return null;
  // The message must name this challenge; anything else is not ours to sign.
  if (!value.message.includes(`\nRequest ID: ${value.challengeId}\n`)) return null;
  return { schemaVersion: WALLET_BIND_SCHEMA_VERSION_V1, challengeId: value.challengeId, message: value.message, expiresAt: value.expiresAt };
}

export function decodeWalletBindResultV1(value: unknown): WalletBindResultV1 | null {
  if (!isRecord(value) || !sameKeys(value, ['schemaVersion', 'wallet']) || value.schemaVersion !== WALLET_BIND_SCHEMA_VERSION_V1) return null;
  const wallet = decodeWallet(value.wallet);
  return wallet ? { schemaVersion: WALLET_BIND_SCHEMA_VERSION_V1, wallet } : null;
}

export function decodeWalletBindListV1(value: unknown): WalletBindListV1 | null {
  if (!isRecord(value) || !sameKeys(value, ['schemaVersion', 'wallets']) || value.schemaVersion !== WALLET_BIND_SCHEMA_VERSION_V1) return null;
  if (!Array.isArray(value.wallets) || value.wallets.length > 20) return null;
  const wallets: WalletBindWalletV1[] = [];
  for (const raw of value.wallets) {
    const wallet = decodeWallet(raw);
    if (!wallet) return null;
    wallets.push(wallet);
  }
  return { schemaVersion: WALLET_BIND_SCHEMA_VERSION_V1, wallets };
}
