/**
 * 链切换工具
 * 支持自动检测当前链并切换到目标链
 */

export type Chain = 'solana' | 'ethereum' | 'base' | 'polygon' | 'arbitrum' | 'optimism' | 'bsc';

export interface ChainInfo {
  chainId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

// 链配置
export const CHAIN_CONFIGS: Record<Chain, ChainInfo> = {
  ethereum: {
    chainId: '0x1',
    chainName: 'Ethereum Mainnet',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: ['https://mainnet.infura.io/v3/'],
    blockExplorerUrls: ['https://etherscan.io'],
  },
  base: {
    chainId: '0x2105',
    chainName: 'Base',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org'],
  },
  polygon: {
    chainId: '0x89',
    chainName: 'Polygon',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18,
    },
    rpcUrls: ['https://polygon-rpc.com'],
    blockExplorerUrls: ['https://polygonscan.com'],
  },
  arbitrum: {
    chainId: '0xa4b1',
    chainName: 'Arbitrum One',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
    blockExplorerUrls: ['https://arbiscan.io'],
  },
  optimism: {
    chainId: '0xa',
    chainName: 'Optimism',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: ['https://mainnet.optimism.io'],
    blockExplorerUrls: ['https://optimistic.etherscan.io'],
  },
  bsc: {
    chainId: '0x38',
    chainName: 'BNB Smart Chain',
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
    },
    rpcUrls: ['https://bsc-dataseed.binance.org'],
    blockExplorerUrls: ['https://bscscan.com'],
  },
  solana: {
    chainId: 'mainnet-beta',
    chainName: 'Solana Mainnet',
    nativeCurrency: {
      name: 'SOL',
      symbol: 'SOL',
      decimals: 9,
    },
    rpcUrls: ['https://api.mainnet-beta.solana.com'],
    blockExplorerUrls: ['https://solscan.io'],
  },
};

/**
 * 检测当前连接的链（EVM）
 */
export async function detectCurrentChain(): Promise<Chain | null> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    return null;
  }

  try {
    const chainId = await (window as any).ethereum.request({ method: 'eth_chainId' });
    
    // 将chainId转换为Chain类型
    const chainIdMap: Record<string, Chain> = {
      '0x1': 'ethereum',
      '0x2105': 'base',
      '0x89': 'polygon',
      '0xa4b1': 'arbitrum',
      '0xa': 'optimism',
      '0x38': 'bsc',
    };

    return chainIdMap[chainId] || null;
  } catch (error) {
    console.error('检测当前链失败:', error);
    return null;
  }
}

/**
 * 切换到目标链（EVM）
 */
export async function switchChain(targetChain: Chain): Promise<boolean> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('请先安装MetaMask或其他EVM钱包');
  }

  // Solana不需要切换链
  if (targetChain === 'solana') {
    return true;
  }

  const chainConfig = CHAIN_CONFIGS[targetChain];
  if (!chainConfig) {
    throw new Error(`不支持的链: ${targetChain}`);
  }

  try {
    // 尝试切换到目标链
    await (window as any).ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainConfig.chainId }],
    });
    return true;
  } catch (error: any) {
    // 如果链不存在，尝试添加
    if (error.code === 4902) {
      try {
        await (window as any).ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [chainConfig],
        });
        return true;
      } catch (addError) {
        console.error('添加链失败:', addError);
        throw new Error(`无法切换到 ${chainConfig.chainName}`);
      }
    }
    throw error;
  }
}

/**
 * 自动切换链（如果当前链不是目标链）
 */
export async function autoSwitchChain(targetChain: Chain): Promise<boolean> {
  const currentChain = await detectCurrentChain();
  
  if (currentChain === targetChain) {
    return true;
  }

  return await switchChain(targetChain);
}

