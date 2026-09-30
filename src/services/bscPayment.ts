/**
 * BSC Testnet payment service (Mobile · v0.1).
 *
 * Wraps USDT/USDC ERC-20 transfers on Binance Smart Chain Testnet (chainId 97).
 * Used by `PayMpcDemoScreen` and Wallet flows while we are still on test chain.
 *
 * Production migration:
 *   - Flip `BSC_TESTNET` → `BSC_MAINNET` (chainId 56) and swap token addresses.
 *   - Replace `simulateTransfer` with real signing via MPC backend
 *     (`POST /api/v1/mpc/sign-tx { chainId, to, data, value }`).
 *
 * Privacy: no private keys handled in app; all signing goes through MPC backend
 * (AWS KMS Singapore custody) gated by `/api/v1/approval/*` (L2+ requires biometric).
 */
import { apiFetch } from './api';

export type BscToken = 'USDT' | 'USDC';

export interface BscNetworkInfo {
  chainId: number;
  name: string;
  rpcUrl: string;
  blockExplorer: string;
  nativeSymbol: string;
}

export const BSC_TESTNET: BscNetworkInfo = {
  chainId: 97,
  name: 'BSC Testnet',
  rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
  blockExplorer: 'https://testnet.bscscan.com',
  nativeSymbol: 'tBNB',
};

/** ERC-20 token contracts on BSC Testnet. */
export const BSC_TESTNET_TOKENS: Record<BscToken, { address: string; decimals: number }> = {
  // Binance-pegged USDT (test)
  USDT: { address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', decimals: 18 },
  // Test USDC commonly used on BSC testnet faucets
  USDC: { address: '0x64544969ed7EBf5f083679233325356EbE738930', decimals: 18 },
};

export interface BscTransferRequest {
  /** Sender wallet address (EVM 0x...). */
  from: string;
  /** Recipient wallet address (EVM 0x...). */
  to: string;
  /** Token symbol. */
  token: BscToken;
  /** Human amount, e.g. "1.5". Will be scaled by token decimals. */
  amount: string;
  /** Optional memo passed to backend audit log. */
  memo?: string;
}

export interface BscTransferResult {
  /** Backend approval row id (always required). */
  approvalId: string;
  /** Hex tx hash if broadcast already; otherwise null while awaiting approval. */
  txHash: string | null;
  /** Final state of the approval workflow. */
  status: 'awaiting_approval' | 'broadcast' | 'failed';
  /** Human-readable reason if status === 'failed'. */
  message?: string;
}

/**
 * Convert a human-readable token amount to a base-10 integer string with token decimals.
 * Avoids float drift; supports "0.5", "1", "1.234".
 */
export function toBaseUnits(amount: string, decimals: number): string {
  const trimmed = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid BSC amount: ${amount}`);
  }
  const [whole, frac = ''] = trimmed.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const result = `${whole}${padded}`.replace(/^0+(?=\d)/, '');
  return result || '0';
}

/**
 * Fetch the user's USDT/USDC balance via backend (which calls a JSON-RPC node).
 * Returns null on failure so the UI can degrade gracefully.
 */
export async function getBscBalance(address: string, token: BscToken): Promise<{ amount: string; decimals: number } | null> {
  try {
    const res = await apiFetch<{ amount: string; decimals: number }>(
      `/v1/wallet/bsc/balance?address=${encodeURIComponent(address)}&token=${token}&chainId=${BSC_TESTNET.chainId}`,
    );
    return res ?? null;
  } catch {
    return null;
  }
}

/**
 * Initiate a BSC testnet ERC-20 transfer.
 *
 * Flow:
 *   1. POST /api/v1/wallet/bsc/transfer { from, to, token, amountBase, chainId, memo }
 *      → backend creates an `approval` row gated to L2 (mobile + biometric).
 *   2. Caller invokes `/api/v1/approval/:id/approve` after biometric, then polls
 *      `/wallet/bsc/transfer/:approvalId` for `txHash`.
 *
 * This function returns after step 1 — broadcast happens server-side once
 * approval is recorded.
 */
export async function startBscTransfer(req: BscTransferRequest): Promise<BscTransferResult> {
  const meta = BSC_TESTNET_TOKENS[req.token];
  const amountBase = toBaseUnits(req.amount, meta.decimals);
  try {
    const res = await apiFetch<{ approvalId: string; status: BscTransferResult['status']; txHash?: string | null }>(
      '/v1/wallet/bsc/transfer',
      {
        method: 'POST',
        body: JSON.stringify({
          from: req.from,
          to: req.to,
          tokenAddress: meta.address,
          amountBase,
          chainId: BSC_TESTNET.chainId,
          memo: req.memo,
        }),
      },
    );
    return {
      approvalId: res.approvalId,
      txHash: res.txHash ?? null,
      status: res.status,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'BSC transfer failed';
    return { approvalId: '', txHash: null, status: 'failed', message };
  }
}

/**
 * Build an explorer URL for a tx hash on BSC testnet.
 */
export function explorerTxUrl(txHash: string): string {
  return `${BSC_TESTNET.blockExplorer}/tx/${txHash}`;
}
