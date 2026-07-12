// MPC 钱包服务 — 自动创建 + 分片 A 安全存储
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { apiFetch } from './api';

const MPC_SHARD_A_KEY = 'mpc_shard_a';
const MPC_RECOVERY_CODE_KEY = 'mpc_recovery_code';
const MPC_BACKUP_CONFIRMED_KEY = 'mpc_backup_confirmed';
const MPC_SOCIAL_PROVIDER_KEY = 'mpc_social_provider_id';

interface MPCWalletCheckResult {
  hasWallet: boolean;
  wallet: {
    walletAddress: string;
    chain: string;
    isActive: boolean;
  } | null;
}

interface MPCWalletCreateResult {
  walletAddress: string;
  encryptedShardA: string;
  encryptedShardC: string;
  recoveryHint: string;
}

/**
 * 检查当前用户是否已有 MPC 钱包
 */
export async function checkMPCWallet(): Promise<MPCWalletCheckResult> {
  return apiFetch<MPCWalletCheckResult>('/mpc-wallet/check');
}

/**
 * 为社交登录用户创建 MPC 钱包
 * @param socialProviderId 社交平台用户ID（用于派生密钥）
 * @param chain 链类型，默认 BSC
 */
export async function createMPCWalletForSocialLogin(
  socialProviderId: string,
  chain: string = 'BSC',
): Promise<MPCWalletCreateResult> {
  const result = await apiFetch<MPCWalletCreateResult>('/mpc-wallet/create-for-social', {
    method: 'POST',
    body: JSON.stringify({
      socialProviderId,
      chain,
    }),
  });

  // 安全存储分片 A 到 expo-secure-store
  await storeShardA(result.encryptedShardA);

  // 安全存储恢复码（分片 C）
  await storeRecoveryCode(result.encryptedShardC);
  await resetBackupConfirmation();

  // 记录派生所用的 socialProviderId，供后续签名重建分片 A 密码（need 4.1 派生密码流）
  try {
    await SecureStore.setItemAsync(MPC_SOCIAL_PROVIDER_KEY, socialProviderId);
  } catch (e) {
    console.warn('Failed to persist MPC social provider id (non-fatal):', e);
  }

  return result;
}

/**
 * 存储分片 A 到 SecureStore（加密存储）
 */
export async function storeShardA(encryptedShardA: string): Promise<void> {
  if (!encryptedShardA) return;
  try {
    await SecureStore.setItemAsync(MPC_SHARD_A_KEY, encryptedShardA);
  } catch (e) {
    console.warn('Failed to store MPC shard A (non-fatal):', e);
  }
}

/**
 * 获取存储的分片 A
 */
export async function getStoredShardA(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(MPC_SHARD_A_KEY);
  } catch (e) {
    console.warn('Failed to retrieve MPC shard A:', e);
    return null;
  }
}

/**
 * 存储恢复码（分片 C）
 */
export async function storeRecoveryCode(encryptedShardC: string): Promise<void> {
  if (!encryptedShardC) return;
  try {
    await SecureStore.setItemAsync(MPC_RECOVERY_CODE_KEY, encryptedShardC);
  } catch (e) {
    console.warn('Failed to store recovery code:', e);
  }
}

/**
 * 获取恢复码
 */
export async function getRecoveryCode(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(MPC_RECOVERY_CODE_KEY);
  } catch (e) {
    console.warn('Failed to retrieve recovery code:', e);
    return null;
  }
}

/**
 * 标记用户已完成恢复码备份
 */
export async function markMPCBackupCompleted(): Promise<void> {
  try {
    await SecureStore.setItemAsync(MPC_BACKUP_CONFIRMED_KEY, '1');
  } catch (e) {
    console.warn('Failed to persist MPC backup confirmation:', e);
  }
}

/**
 * 检查用户是否确认已备份恢复码
 */
export async function isMPCBackupCompleted(): Promise<boolean> {
  try {
    const value = await SecureStore.getItemAsync(MPC_BACKUP_CONFIRMED_KEY);
    return value === '1';
  } catch (e) {
    console.warn('Failed to read MPC backup confirmation:', e);
    return false;
  }
}

/**
 * 重置备份完成标记（新建钱包或重新生成恢复码时调用）
 */
export async function resetBackupConfirmation(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(MPC_BACKUP_CONFIRMED_KEY);
  } catch (e) {
    console.warn('Failed to reset MPC backup confirmation:', e);
  }
}

/**
 * 清除所有 MPC 钱包数据（登出时调用）
 */
export async function clearMPCWalletData(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(MPC_SHARD_A_KEY);
    await SecureStore.deleteItemAsync(MPC_RECOVERY_CODE_KEY);
    await SecureStore.deleteItemAsync(MPC_BACKUP_CONFIRMED_KEY);
    await SecureStore.deleteItemAsync(MPC_SOCIAL_PROVIDER_KEY);
  } catch (e) {
    console.warn('Failed to clear MPC wallet data:', e);
  }
}

/**
 * 服务端可验证的备份回读校验（agent-wallet-identity-tangibility 需求 1.2）。
 *
 * 用户在 UI 里重新输入恢复码（客户端先本地比对确认一致），随后本函数对本地保存的
 * 恢复码（=encryptedShardC）计算 sha256 作为 proof，走服务端 verify-start / verify-confirm，
 * 服务端比对通过后置 backup_confirmed=true。成功后同时标记本地备份完成。
 *
 * @returns { confirmed, mode } —— mode: 'verified'（服务端强校验）| 'client_asserted'（旧钱包退化）
 */
export async function verifyAndConfirmBackup(): Promise<{ confirmed: boolean; mode: string }> {
  const recoveryCode = await getRecoveryCode();
  if (!recoveryCode) {
    throw new Error('No recovery code found on this device');
  }
  const proof = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    recoveryCode,
  );
  const start = await apiFetch<{ challengeId: string }>('/mpc-wallet/backup/verify-start', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const res = await apiFetch<{ confirmed: boolean; mode: string }>(
    '/mpc-wallet/backup/verify-confirm',
    {
      method: 'POST',
      body: JSON.stringify({ challengeId: start.challengeId, proof }),
    },
  );
  if (res.confirmed) {
    await markMPCBackupCompleted();
  }
  return res;
}

/**
 * 查询服务端备份状态（backup_confirmed 真实值）。
 */
export async function fetchBackupStatus(): Promise<{ hasWallet: boolean; backupConfirmed: boolean; confirmedAt?: string }> {
  return apiFetch('/mpc-wallet/backup/status');
}

/**
 * 恢复：换设备用恢复码重建（分片 B+C，地址不变）。
 * 需要客户端已能解出分片 C 的 hex（此处接口留给上层：传入解出的 shardCHex 与新密码）。
 */
export async function recoverWalletWithCode(
  shardCHex: string,
  newShardAPassword: string,
): Promise<{ walletAddress: string; encryptedShardA: string; encryptedShardC: string }> {
  const start = await apiFetch<{ recoveryId: string }>('/mpc-wallet/recover/start', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const res = await apiFetch<{ walletAddress: string; encryptedShardA: string; encryptedShardC: string }>(
    '/mpc-wallet/recover/complete',
    {
      method: 'POST',
      body: JSON.stringify({ recoveryId: start.recoveryId, shardCHex, newShardAPassword }),
    },
  );
  // 写入新分片 A + 新恢复码到本设备
  await storeShardA(res.encryptedShardA);
  await storeRecoveryCode(res.encryptedShardC);
  await resetBackupConfirmation();
  return res;
}

/**
 * 是否需要恢复（need 2.4）：服务端有钱包但本设备缺分片 A → UI 应引导进入恢复流程，
 * 而非静默继续。供登录后 / 钱包页调用做明确提示。
 */
export async function checkRecoveryNeeded(): Promise<boolean> {
  try {
    const check = await checkMPCWallet();
    if (!check.hasWallet) return false;
    const localShardA = await getStoredShardA();
    return !localShardA;
  } catch {
    return false;
  }
}

/**
 * 重建分片 A 的加密密码（need 4.1 派生密码流）。
 *
 * 后端创建时用 `${socialProviderId}_${userId}_agentrix_mpc_v1` 作为派生密码加密分片 A。
 * 客户端在创建时已持久化 socialProviderId；此处据此 + 当前 userId 复现同一密码用于签名。
 * 缺失 socialProviderId（旧钱包）时回退用 userId 作为 socialProviderId（多数创建路径口径）。
 */
export async function deriveShardAPassword(userId: string): Promise<string> {
  let socialProviderId: string | null = null;
  try {
    socialProviderId = await SecureStore.getItemAsync(MPC_SOCIAL_PROVIDER_KEY);
  } catch {
    socialProviderId = null;
  }
  const sid = socialProviderId || userId;
  return `${sid}_${userId}_agentrix_mpc_v1`;
}

/**
 * 用托管 MPC 钱包签名并发送真实链上交易（need 4.1；需服务端 MPC_ONCHAIN_TX_ENABLED）。
 *
 * intent 例：{ kind:'vault_deposit', chainId:1439, amountUsdc:'10' }。
 * 需本地分片 A（encryptedShardA）+ 派生密码（未传则自动按 userId 派生）；
 * 外部钱包(WalletConnect)充值路径不走此函数、保持并存。
 * 返回 { txHash, status, reason }；未备份返回 reason='BACKUP_REQUIRED'，flag 关返回 'FEATURE_DISABLED'。
 */
export async function signAndSendManaged(params: {
  walletAddress: string;
  intent: Record<string, any>;
  userId: string;
  shardAPassword?: string;
  agentId?: string;
}): Promise<{ txHash: string; status: 'submitted' | 'confirmed' | 'failed'; reason?: string }> {
  const encryptedShardA = await getStoredShardA();
  if (!encryptedShardA) {
    throw new Error('RECOVERY_REQUIRED: no local shard A on this device');
  }
  const shardAPassword = params.shardAPassword || (await deriveShardAPassword(params.userId));
  return apiFetch('/mpc-wallet/sign-and-send', {
    method: 'POST',
    body: JSON.stringify({
      walletAddress: params.walletAddress,
      intent: params.intent,
      encryptedShardA,
      shardAPassword,
      agentId: params.agentId,
    }),
  });
}

/**
 * 构造「用户主权钱包」的 x402 付款函数（agent-economy-hardening · R6，需求 4.1 / 4.3）。
 *
 * 返回一个 `UserWalletPayFn`（见 `aggregatedMarket.api`），供聚合代成交 `payment_required`
 * 回填时调用：用**用户自己的** MPC 自托管钱包在对应链发 `erc20_transfer`，把 USDC 转给
 * x402 收款地址（分佣合约），返回真 txHash。gas 由 relayer 代付（需 MPC_ONCHAIN_TX_ENABLED）。
 *
 * 与平台托管 agent autopay（后端 `AgentAutopayService` + `PlatformAgentWallet`）并存、互不影响：
 * 此处是客户端用用户钱包主动付款，autopay 是后端对平台托管 agent 自付。
 */
export function makeUserWalletX402Payer(params: {
  walletAddress: string;
  userId: string;
  agentId?: string;
}) {
  return async (p: { chainId: number; token: string; to: string; amountHuman: string }) => {
    return signAndSendManaged({
      walletAddress: params.walletAddress,
      userId: params.userId,
      agentId: params.agentId,
      intent: {
        kind: 'erc20_transfer',
        chainId: p.chainId,
        token: p.token,
        to: p.to,
        amount: p.amountHuman,
      },
    });
  };
}

/**
 * 确保当前社交登录用户拥有 MPC 钱包（幂等）。
 * 1. 检查是否已有钱包
 * 2. 如果没有，自动创建
 * 3. 存储分片 A 到 SecureStore
 * 
 * @returns 钱包地址，如果已有钱包则返回现有地址
 */
export async function ensureMPCWallet(socialProviderId: string): Promise<string> {
  try {
    // 1. 检查是否已有钱包
    const checkResult = await checkMPCWallet();

    if (checkResult.hasWallet && checkResult.wallet) {
      // 已有钱包，检查本地是否有分片 A
      const localShardA = await getStoredShardA();
      if (!localShardA) {
        console.warn('MPC wallet exists but shard A not found locally. Recovery may be needed.');
      }
      return checkResult.wallet.walletAddress;
    }

    // 2. 创建新钱包
    const createResult = await createMPCWalletForSocialLogin(socialProviderId);
    return createResult.walletAddress;
  } catch (e: any) {
    console.error('ensureMPCWallet failed:', e);
    // Re-throw with a friendlier message
    const msg = typeof e?.message === 'string' ? e.message : 'Unknown error';
    throw new Error(`Wallet creation failed: ${msg}`);
  }
}

/**
 * 恢复码录入恢复（主路径）：用用户保存的恢复码（=encryptedShardC）重建，地址不变。
 * 服务端解密恢复码 → combine(C,B) → 校验地址 → 重拆分 → 下发新分片 A/恢复码（已轮换）。
 * 客户端只需把恢复码原样传给服务端，无需实现分片解密。
 */
export async function recoverWithSavedCode(
  recoveryCode: string,
): Promise<{ walletAddress: string }> {
  let socialProviderId: string | null = null;
  try {
    socialProviderId = await SecureStore.getItemAsync(MPC_SOCIAL_PROVIDER_KEY);
  } catch {
    socialProviderId = null;
  }
  const start = await apiFetch<{ recoveryId: string }>('/mpc-wallet/recover/start', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const res = await apiFetch<{ walletAddress: string; encryptedShardA: string; encryptedShardC: string }>(
    '/mpc-wallet/recover/complete-with-code',
    {
      method: 'POST',
      body: JSON.stringify({
        recoveryId: start.recoveryId,
        recoveryCode: (recoveryCode || '').trim(),
        socialProviderId: socialProviderId || undefined,
      }),
    },
  );
  // 写入轮换后的新分片 A + 新恢复码；要求重新备份。
  await storeShardA(res.encryptedShardA);
  await storeRecoveryCode(res.encryptedShardC);
  await resetBackupConfirmation();
  return { walletAddress: res.walletAddress };
}

/**
 * 测试网换钱包（兜底）：没保存恢复码时的最后手段。**停用旧钱包（旧地址弃用）+ 建新钱包**。
 * 破坏性——调用前必须向用户强警告。需服务端 `MPC_WALLET_ROTATION_ENABLED=1`。
 */
export async function rotateWallet(): Promise<{ walletAddress: string; rotatedFrom?: string }> {
  let socialProviderId: string | null = null;
  try {
    socialProviderId = await SecureStore.getItemAsync(MPC_SOCIAL_PROVIDER_KEY);
  } catch {
    socialProviderId = null;
  }
  const res = await apiFetch<{
    walletAddress: string;
    encryptedShardA: string;
    encryptedShardC: string;
    rotatedFrom?: string;
  }>('/mpc-wallet/rotate', {
    method: 'POST',
    body: JSON.stringify({ socialProviderId: socialProviderId || undefined, confirm: true }),
  });
  await storeShardA(res.encryptedShardA);
  await storeRecoveryCode(res.encryptedShardC);
  await resetBackupConfirmation();
  return { walletAddress: res.walletAddress, rotatedFrom: res.rotatedFrom };
}
