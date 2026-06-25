// MPC 钱包服务 — 自动创建 + 分片 A 安全存储
import * as SecureStore from 'expo-secure-store';
import { apiFetch } from './api';

const MPC_SHARD_A_KEY = 'mpc_shard_a';
const MPC_RECOVERY_CODE_KEY = 'mpc_recovery_code';

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
 * 清除所有 MPC 钱包数据（登出时调用）
 */
export async function clearMPCWalletData(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(MPC_SHARD_A_KEY);
    await SecureStore.deleteItemAsync(MPC_RECOVERY_CODE_KEY);
  } catch (e) {
    console.warn('Failed to clear MPC wallet data:', e);
  }
}

/**
 * 社交登录后自动创建 MPC 钱包的完整流程
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
