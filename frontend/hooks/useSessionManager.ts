import { useState, useEffect } from 'react';
import { SessionKeyManager } from '@/lib/session-key-manager';
import { paymentApi } from '@/lib/api/payment.api';
import { sessionApi, type Session } from '@/lib/api/session.api';
import { useWeb3 } from '@/contexts/Web3Context';
import { ethers } from 'ethers';

// 完整的 ERC8004SessionManager ABI（包含事件）
const SESSION_MANAGER_ABI = [
  'function createSession(address signer, uint256 singleLimit, uint256 dailyLimit, uint256 expiry) returns (bytes32)',
  'function getSession(bytes32) view returns (tuple(address signer, address owner, uint256 singleLimit, uint256 dailyLimit, uint256 usedToday, uint256 expiry, uint256 lastResetDate, bool isActive))',
  'event SessionCreated(bytes32 indexed sessionId, address indexed owner, address indexed signer, uint256 singleLimit, uint256 dailyLimit, uint256 expiry)',
];

export function useSessionManager() {
  const { isConnected, defaultWallet, signMessage } = useWeb3();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载 Session 列表
  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await sessionApi.getSessions();
      setSessions(data);
      
      // 查找活跃 Session
      const active = data.find((s: Session) => s.isActive && new Date(s.expiry) > new Date());
      setActiveSession(active || null);
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
      setError(err.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  // 加载活跃 Session
  const loadActiveSession = async () => {
    try {
      setLoading(true);
      const session = await sessionApi.getActiveSession();
      setActiveSession(session);
      return session;
    } catch (err) {
      console.error('Failed to load active session:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 创建 Session
  const createSession = async (config: {
    singleLimit: number; // USDC amount
    dailyLimit: number;
    expiryDays: number;
    agentId?: string;
  }) => {
    if (!isConnected || !defaultWallet) {
      throw new Error('Please connect your wallet first');
    }

    try {
      setLoading(true);
      setError(null);

      // 校验限额（后端要求：单笔 >= 0.0001，日限 >= 0.001）
      const safeSingleLimit = Math.max(config.singleLimit, 0.0001);
      const safeDailyLimit = Math.max(config.dailyLimit, Math.max(safeSingleLimit, 0.001));

      // 1. 生成 Session Key（浏览器本地）
      const sessionKey = await SessionKeyManager.generateSessionKey();

      // 2. 使用主钱包签名授权（一次性）
      if (!signMessage) {
        throw new Error('Wallet signMessage not available');
      }

      // 检查并切换网络
      if (typeof window !== 'undefined' && window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        const currentChainId = parseInt(chainIdHex as string, 16);
        const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97);
        
        if (currentChainId !== targetChainId) {
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${targetChainId.toString(16)}` }],
            });
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: `0x${targetChainId.toString(16)}`,
                    chainName: 'BSC Testnet',
                    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                    rpcUrls: [process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL || 'https://bsc-testnet.publicnode.com'],
                    blockExplorerUrls: ['https://testnet.bscscan.com'],
                  },
                ],
              });
            } else {
              throw new Error(`Please switch to BSC Testnet (Chain ID: ${targetChainId})`);
            }
          }
        }
      }

      const message = `Authorize Session Key: ${sessionKey.publicKey}\nSingle Limit: ${config.singleLimit} USDC\nDaily Limit: ${config.dailyLimit} USDC\nExpiry: ${config.expiryDays} days`;
      const signature = await signMessage(message);

      // 3. 获取合约地址
      let erc8004Address: string;
      let tokenAddress: string;
      
      try {
        const contractInfo = await paymentApi.getContractAddress?.();
        erc8004Address = contractInfo?.erc8004ContractAddress || process.env.NEXT_PUBLIC_ERC8004_CONTRACT_ADDRESS || '0x3310a6e841877f28C755bFb5aF90e6734EF059fA';
        tokenAddress = contractInfo?.usdcAddress || process.env.NEXT_PUBLIC_USDT_ADDRESS || '0xc23453b4842FDc4360A0a3518E2C0f51a2069386';
      } catch {
        erc8004Address = process.env.NEXT_PUBLIC_ERC8004_CONTRACT_ADDRESS || '0x3310a6e841877f28C755bFb5aF90e6734EF059fA';
        tokenAddress = process.env.NEXT_PUBLIC_USDT_ADDRESS || '0xc23453b4842FDc4360A0a3518E2C0f51a2069386';
      }

      // 4. 检查并授权USDT给ERC8004合约
      let provider: ethers.BrowserProvider | null = null;
      let signer: ethers.Signer | null = null;
      let userAddress: string | null = null;

      if (typeof window !== 'undefined' && window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        
        const tokenContract = new ethers.Contract(
          tokenAddress,
          [
            'function allowance(address owner, address spender) view returns (uint256)',
            'function approve(address spender, uint256 amount) returns (bool)',
            'function decimals() view returns (uint8)',
          ],
          provider
        );
        
        const decimals = await tokenContract.decimals?.().then((d: number) => Number(d)).catch(() => 18);
        const currentAllowance = await tokenContract.allowance(userAddress, erc8004Address);
        const approvalHumanAmount = Number((safeDailyLimit * 3).toFixed(6));
        const approvalAmount = ethers.parseUnits(approvalHumanAmount.toString(), decimals);
        
        if (currentAllowance < approvalAmount) {
          const tokenWithSigner = tokenContract.connect(signer) as any;
          const approveTx = await tokenWithSigner.approve(erc8004Address, approvalAmount);
          await approveTx.wait();
        }
      }

      // 5. 调用合约创建Session
      let onChainSessionId: string | null = null;
      const expiryTimestamp = Math.floor(Date.now() / 1000) + config.expiryDays * 86400;
      
      // 获取代币 decimals
      let tokenDecimals = 18;
      try {
        const tokenContractForDecimals = new ethers.Contract(
          tokenAddress,
          ['function decimals() view returns (uint8)'],
          provider || undefined
        );
        tokenDecimals = await tokenContractForDecimals.decimals();
        tokenDecimals = Number(tokenDecimals);
      } catch (e) {
        console.error('Error fetching decimals, defaulting to 18:', e);
      }

      const singleLimitUnits = ethers.parseUnits(safeSingleLimit.toFixed(Math.min(tokenDecimals, 6)), tokenDecimals);
      const dailyLimitUnits = ethers.parseUnits(safeDailyLimit.toFixed(Math.min(tokenDecimals, 6)), tokenDecimals);

      if (signer) {
        const sessionManagerContract = new ethers.Contract(
          erc8004Address,
          SESSION_MANAGER_ABI,
          signer,
        );

        const tx = await sessionManagerContract.createSession(
          sessionKey.publicKey,
          singleLimitUnits,
          dailyLimitUnits,
          expiryTimestamp,
        );
        const receipt = await tx.wait();
        
        for (const log of receipt.logs) {
          try {
            const parsed = sessionManagerContract.interface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            });
            if (parsed?.name === 'SessionCreated') {
              onChainSessionId = parsed.args.sessionId || parsed.args[0];
              break;
            }
          } catch (e) {}
        }
      }

      // 6. 调用后端登记 Session
      const session = await sessionApi.createSession({
        signer: sessionKey.publicKey,
        singleLimit: safeSingleLimit * 1e6,
        dailyLimit: safeDailyLimit * 1e6,
        expiryDays: config.expiryDays,
        signature,
        sessionId: onChainSessionId || undefined,
        agentId: config.agentId,
      });

      // 立即加载sessions和active session
      await Promise.all([
        loadSessions(),
        loadActiveSession(),
      ]);
      
      return session;
    } catch (err: any) {
      console.error('Failed to create session:', err);
      setError(err.message || 'Failed to create session');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // 撤销 Session
  const revokeSession = async (sessionId: string) => {
    if (!isConnected || !defaultWallet) {
      throw new Error('Please connect your wallet first');
    }

    try {
      setLoading(true);
      setError(null);

      // 1. 撤销后端Session
      await sessionApi.revokeSession(sessionId);

      // 2. 撤销USDT授权（可选，为了安全建议执行）
      if (typeof window !== 'undefined' && window.ethereum) {
        try {
          const erc8004Address = process.env.NEXT_PUBLIC_ERC8004_CONTRACT_ADDRESS || '0x3310a6e841877f28C755bFb5aF90e6734EF059fA';
          const tokenAddress = process.env.NEXT_PUBLIC_USDT_ADDRESS || '0xc23453b4842FDc4360A0a3518E2C0f51a2069386';

          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          
          const tokenContract = new ethers.Contract(
            tokenAddress,
            ['function approve(address spender, uint256 amount) returns (bool)'],
            signer
          );

          const revokeTx = await tokenContract.approve(erc8004Address, 0);
          await revokeTx.wait();
        } catch (e) {
          console.warn('Failed to revoke USDT allowance on-chain, but session is revoked in backend:', e);
        }
      }

      await loadSessions();
    } catch (err: any) {
      console.error('Failed to revoke session:', err);
      setError(err.message || 'Failed to revoke session');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // 初始化时加载
  useEffect(() => {
    if (isConnected) {
      loadSessions();
    }
  }, [isConnected]);

  return {
    sessions,
    activeSession,
    loading,
    error,
    createSession,
    revokeSession,
    loadSessions,
    loadActiveSession,
  };
}

