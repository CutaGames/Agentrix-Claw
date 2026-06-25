/**
 * 多链配置 - 支持 EVM 和 Solana 链
 * 商业化上线所需的链配置
 */

export interface ChainConfig {
  chainId: number | string;
  name: string;
  displayName: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  isTestnet: boolean;
  isEVM: boolean;
  // 空投相关配置
  airdropContracts?: {
    merkleDistributor?: string;
    claimContract?: string;
  };
  // 常用代币地址
  tokens: {
    USDC?: string;
    USDT?: string;
    WETH?: string;
  };
}

export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
  // ========== Mainnet ==========
  ethereum: {
    chainId: 1,
    name: 'ethereum',
    displayName: 'Ethereum',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    isTestnet: false,
    isEVM: true,
    tokens: {
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
  },
  bsc: {
    chainId: 56,
    name: 'bsc',
    displayName: 'BNB Smart Chain',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org',
    explorerUrl: 'https://bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    isTestnet: false,
    isEVM: true,
    tokens: {
      USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      USDT: '0x55d398326f99059fF775485246999027B3197955',
    },
  },
  polygon: {
    chainId: 137,
    name: 'polygon',
    displayName: 'Polygon',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    isTestnet: false,
    isEVM: true,
    tokens: {
      USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    },
  },
  arbitrum: {
    chainId: 42161,
    name: 'arbitrum',
    displayName: 'Arbitrum One',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    isTestnet: false,
    isEVM: true,
    tokens: {
      USDC: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
      USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    },
  },
  base: {
    chainId: 8453,
    name: 'base',
    displayName: 'Base',
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    isTestnet: false,
    isEVM: true,
    tokens: {
      USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
  },
  solana: {
    chainId: 'mainnet-beta',
    name: 'solana',
    displayName: 'Solana',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    explorerUrl: 'https://solscan.io',
    nativeCurrency: { name: 'SOL', symbol: 'SOL', decimals: 9 },
    isTestnet: false,
    isEVM: false,
    tokens: {
      USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    },
  },

  // ========== Testnet ==========
  sepolia: {
    chainId: 11155111,
    name: 'sepolia',
    displayName: 'Sepolia Testnet',
    rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    isTestnet: true,
    isEVM: true,
    tokens: {},
  },
  bsc_testnet: {
    chainId: 97,
    name: 'bsc_testnet',
    displayName: 'BSC Testnet',
    rpcUrl: process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545',
    explorerUrl: 'https://testnet.bscscan.com',
    nativeCurrency: { name: 'Test BNB', symbol: 'tBNB', decimals: 18 },
    isTestnet: true,
    isEVM: true,
    tokens: {},
  },
  solana_devnet: {
    chainId: 'devnet',
    name: 'solana_devnet',
    displayName: 'Solana Devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    explorerUrl: 'https://solscan.io?cluster=devnet',
    nativeCurrency: { name: 'SOL', symbol: 'SOL', decimals: 9 },
    isTestnet: true,
    isEVM: false,
    tokens: {},
  },
};

// 获取链配置
export function getChainConfig(chainName: string): ChainConfig | undefined {
  return SUPPORTED_CHAINS[chainName.toLowerCase()];
}

// 获取所有主网链
export function getMainnetChains(): ChainConfig[] {
  return Object.values(SUPPORTED_CHAINS).filter(c => !c.isTestnet);
}

// 获取所有EVM链
export function getEVMChains(): ChainConfig[] {
  return Object.values(SUPPORTED_CHAINS).filter(c => c.isEVM);
}

// 获取链的RPC Provider
export function getChainRpcUrl(chainName: string): string {
  const config = getChainConfig(chainName);
  return config?.rpcUrl || '';
}
