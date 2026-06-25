/**
 * 钱包检测工具
 * 支持检测主流Web3钱包：Phantom、MetaMask、OKX、Coinbase、Binance等
 */

export interface WalletInfo {
  name: string;
  type: 'phantom' | 'metamask' | 'okx' | 'coinbase' | 'binance' | 'walletconnect';
  installed: boolean;
  chain: 'solana' | 'evm' | 'bsc';
  icon?: string;
}

// 支持的钱包列表
export const SUPPORTED_WALLETS: WalletInfo[] = [
  {
    name: 'Phantom',
    type: 'phantom',
    installed: false,
    chain: 'solana',
    icon: '👻',
  },
  {
    name: 'MetaMask',
    type: 'metamask',
    installed: false,
    chain: 'evm',
    icon: '🦊',
  },
  {
    name: 'OKX Wallet',
    type: 'okx',
    installed: false,
    chain: 'evm',
    icon: '🟢',
  },
  {
    name: 'Coinbase Wallet',
    type: 'coinbase',
    installed: false,
    chain: 'evm',
    icon: '🔵',
  },
  {
    name: 'Binance Wallet',
    type: 'binance',
    installed: false,
    chain: 'bsc',
    icon: '🟡',
  },
];

/**
 * 检测所有支持的钱包是否已安装
 */
export function detectInstalledWallets(): WalletInfo[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const wallets = SUPPORTED_WALLETS.map(wallet => {
    let installed = false;

    switch (wallet.type) {
      case 'phantom':
        installed = !!(window as any).solana?.isPhantom;
        break;
      case 'metamask':
        installed = !!(window as any).ethereum?.isMetaMask;
        break;
      case 'okx':
        installed = !!(window as any).okxwallet;
        break;
      case 'coinbase':
        installed = !!(window as any).ethereum?.isCoinbaseWallet;
        break;
      case 'binance':
        installed = !!(window as any).BinanceChain;
        break;
    }

    return {
      ...wallet,
      installed,
    };
  });

  return wallets;
}

/**
 * 检测特定钱包是否已安装
 */
export function isWalletInstalled(walletType: WalletInfo['type']): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  switch (walletType) {
    case 'phantom':
      return !!(window as any).solana?.isPhantom;
    case 'metamask':
      return !!(window as any).ethereum?.isMetaMask;
    case 'okx':
      return !!(window as any).okxwallet;
    case 'coinbase':
      return !!(window as any).ethereum?.isCoinbaseWallet;
    case 'binance':
      return !!(window as any).BinanceChain;
    default:
      return false;
  }
}

/**
 * 获取推荐的钱包（优先返回已安装的钱包）
 */
export function getRecommendedWallet(): WalletInfo | null {
  const installedWallets = detectInstalledWallets().filter(w => w.installed);
  
  if (installedWallets.length > 0) {
    // 优先返回MetaMask或Phantom
    return installedWallets.find(w => w.type === 'metamask' || w.type === 'phantom') || installedWallets[0];
  }

  // 如果没有已安装的钱包，返回第一个
  return SUPPORTED_WALLETS[0] || null;
}

/**
 * 根据链类型获取推荐的钱包
 */
export function getRecommendedWalletForChain(chain: 'solana' | 'evm' | 'bsc'): WalletInfo | null {
  const installedWallets = detectInstalledWallets().filter(w => w.installed && w.chain === chain);
  
  if (installedWallets.length > 0) {
    return installedWallets[0];
  }

  // 如果没有已安装的钱包，返回该链的第一个钱包
  const chainWallets = SUPPORTED_WALLETS.filter(w => w.chain === chain);
  return chainWallets[0] || null;
}

/**
 * 获取所有已安装的钱包
 */
export function getInstalledWallets(): WalletInfo[] {
  return detectInstalledWallets().filter(w => w.installed);
}

