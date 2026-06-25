/**
 * 多钱包连接服务
 * 支持 MetaMask, WalletConnect v2, Phantom (Solana), OKX Wallet
 */

export type WalletType = 'metamask' | 'walletconnect' | 'phantom' | 'okx'
export type ChainType = 'evm' | 'solana'

export interface WalletInfo {
  id: string
  type: WalletType
  name: string
  address: string
  chain: ChainType
  chainId?: string | number
  isConnected: boolean
  balance?: string
  icon?: string
}

export interface WalletConnector {
  id: WalletType
  name: string
  icon: string
  description: string
  chain: ChainType
  isInstalled: () => boolean
  connect: () => Promise<WalletInfo>
  disconnect: () => Promise<void>
  getAccounts: () => Promise<string[]>
  signMessage?: (message: string, wallet?: WalletInfo) => Promise<string>
}

const getEthereumProvider = (predicate: (provider: any) => boolean) => {
  try {
    if (typeof window === 'undefined') return undefined
    const { ethereum } = window as any
    if (!ethereum) return undefined
    // 打印当前 ethereum 注入状态以便调试
    try {
      console.debug('[getEthereumProvider] window.ethereum detected. providers length:', ethereum.providers?.length)
    } catch (e) {
      console.debug('[getEthereumProvider] window.ethereum present but cannot read providers')
    }

    if (ethereum.providers?.length) {
      const found = ethereum.providers.find((provider: any) => predicate(provider))
      if (found) {
        console.debug('[getEthereumProvider] Found matching provider in ethereum.providers')
        return found
      }
    }

    const ok = predicate(ethereum)
    if (ok) {
      console.debug('[getEthereumProvider] window.ethereum matches predicate')
      return ethereum
    }
    return undefined
  } catch (e) {
    console.error('[getEthereumProvider] Error accessing ethereum provider:', e);
    return undefined;
  }
}

const getMetaMaskProvider = () => {
  try {
    if (typeof window === 'undefined') return undefined
    
    const { ethereum } = window as any
    if (!ethereum) return undefined

    // 优先检查 window.okxwallet，如果存在则排除它
    const okxwallet = (window as any).okxwallet
    if (okxwallet) {
      // 如果ethereum是okxwallet注入的，需要排除
      if (ethereum === okxwallet || ethereum === okxwallet.ethereum) {
        // 如果有多个providers，尝试找到MetaMask
        if (ethereum.providers?.length) {
          const metamaskProvider = ethereum.providers.find((p: any) => {
            // 严格检查：必须是MetaMask且不是OKX
            return p.isMetaMask === true && 
                   !p.isOkxWallet && 
                   !p.isOKExWallet && 
                   !p.isOkxwallet &&
                   p !== okxwallet &&
                   p !== okxwallet.ethereum &&
                   !p.constructor?.name?.includes('Okx') &&
                   !p.constructor?.name?.includes('OKX')
          })
          return metamaskProvider
        }
        return undefined // 如果ethereum就是okxwallet，且没有providers，返回undefined
      }
    }

    // 如果有多个providers，需要找到MetaMask（严格检测）
    if (ethereum.providers?.length) {
      console.debug('[getMetaMaskProvider] ethereum.providers detected, count:', ethereum.providers.length)
      const metamaskProvider = ethereum.providers.find((p: any) => {
        return p.isMetaMask === true && 
               !p.isOkxWallet && 
               !p.isOKExWallet && 
               !p.isOkxwallet &&
               p !== okxwallet &&
               p !== okxwallet?.ethereum &&
               !p.constructor?.name?.includes('Okx') &&
               !p.constructor?.name?.includes('OKX')
      })
      if (metamaskProvider) {
        console.debug('[getMetaMaskProvider] Found strict MetaMask provider in providers list')
        return metamaskProvider
      }
    }

    // 单个 provider 的情况，严格检查优先
    if (ethereum.isMetaMask === true) {
      // 再次确认不是 OKX
      if (ethereum.isOkxWallet || ethereum.isOKExWallet || ethereum.isOkxwallet) {
        console.debug('[getMetaMaskProvider] ethereum looks like OKX wallet; ignoring for MetaMask')
        return undefined
      }
      if (ethereum === okxwallet || ethereum === okxwallet?.ethereum) {
        console.debug('[getMetaMaskProvider] ethereum equals okxwallet; ignoring for MetaMask')
        return undefined
      }
      if (ethereum.constructor?.name?.includes('Okx') || ethereum.constructor?.name?.includes('OKX')) {
        console.debug('[getMetaMaskProvider] ethereum constructor name indicates OKX; ignoring')
        return undefined
      }
      console.debug('[getMetaMaskProvider] Found MetaMask via strict check')
      return ethereum
    }

    // 宽松模式：如果 window.ethereum 存在且不是明确的 OKX，也返回它
    // 这允许其他兼容 EIP-1193 的钱包（如 Trust Wallet, Coinbase Wallet, Brave 等）通过 "MetaMask" 按钮连接
    if (ethereum && !ethereum.isOkxWallet && !ethereum.isOKExWallet && !ethereum.isOkxwallet) {
       console.log('[getMetaMaskProvider] Returning generic window.ethereum as fallback')
       return ethereum
    }

    // 回退：如果没有严格匹配，但 window.ethereum 存在，返回它用于诊断
    console.warn('[getMetaMaskProvider] 未找到严格匹配的 MetaMask provider；将回退至 window.ethereum 以便诊断（注意：这可能不是 MetaMask）')
    console.debug('[getMetaMaskProvider] window.ethereum object:', ethereum)
    return ethereum
  } catch (e) {
    console.error('[getMetaMaskProvider] Error accessing ethereum provider:', e);
    return undefined;
  }
}

const getOKXProvider = () => {
  if (typeof window === 'undefined') return undefined

  const { ethereum, okxwallet } = window as any

  // 1) 多钱包共存场景：优先从 ethereum.providers 中找到 OKX 的 EIP-1193 provider
  if (ethereum?.providers?.length) {
    console.debug('[getOKXProvider] Checking ethereum.providers for OKX providers...')
    const found = ethereum.providers.find((provider: any) => {
      const okxLike = !!provider?.isOkxWallet || !!provider?.isOKExWallet || !!provider?.isOkxwallet
      const constructorNameOkx =
        !!provider?.constructor?.name &&
        (provider.constructor.name.includes('Okx') || provider.constructor.name.includes('OKX'))
      return okxLike || constructorNameOkx
    })

    if (found && typeof found.request === 'function') {
      console.log('[getOKXProvider] Found OKX in ethereum.providers')
      return found
    }
  }

  // 2) 兼容性：window.ethereum 本身就是 OKX
  if (ethereum && (ethereum.isOkxWallet || ethereum.isOKExWallet || ethereum.isOkxwallet)) {
    console.log('[getOKXProvider] Found OKX via window.ethereum')
    return ethereum
  }

  // 3) OKX 标准注入：window.okxwallet.ethereum
  if (okxwallet?.ethereum && typeof okxwallet.ethereum.request === 'function') {
    console.log('[getOKXProvider] Found window.okxwallet.ethereum')
    return okxwallet.ethereum
  }

  // 4) 回退：window.okxwallet 直接是 provider
  if (okxwallet && typeof okxwallet.request === 'function') {
    console.log('[getOKXProvider] Found window.okxwallet (direct provider)')
    return okxwallet
  }

  return undefined
}


// 调试工具：在浏览器中调用 `walletService.inspectInjectedProviders()` 可以获取注入提供者的详细信息（便于排查所有插件）
export function inspectInjectedProviders() {
  if (typeof window === 'undefined') return { error: 'not-in-browser' }
  const win: any = window
  const res: any = {}

  res.hasWindowEthereum = !!win.ethereum
  try {
    res.ethereum = {
      providersCount: (win.ethereum && win.ethereum.providers) ? win.ethereum.providers.length : 0,
      keys: Object.keys(win.ethereum || {})
    }
  } catch (e) {
    res.ethereum = { error: String(e) }
  }

  res.hasOkxWallet = !!win.okxwallet
  try {
    res.okxwallet = Object.keys(win.okxwallet || {})
  } catch (e) {
    res.okxwallet = { error: String(e) }
  }

  res.hasSolana = !!win.solana
  try {
    res.solana = { isPhantom: !!win.solana?.isPhantom, keys: Object.keys(win.solana || {}) }
  } catch (e) {
    res.solana = { error: String(e) }
  }

  // detect other common injections
  res.hasWeb3 = !!win.web3
  try {
    res.web3 = win.web3 ? Object.keys(win.web3 || {}) : null
  } catch (e) {
    res.web3 = { error: String(e) }
  }

  return res
}

// MetaMask 连接器
export class MetaMaskConnector implements WalletConnector {
  id: WalletType = 'metamask'
  name = 'MetaMask'
  icon = '🦊'
  description = '以太坊生态系统钱包'
  chain: ChainType = 'evm'

  isInstalled(): boolean {
    if (typeof window === 'undefined') return false
    
    const provider = getMetaMaskProvider()
    // 只要能获取到 provider，就认为已安装（兼容其他钱包）
    return !!provider
  }

  async connect(): Promise<WalletInfo> {
    console.log('[MetaMaskConnector] Connecting...');
    if (typeof window === 'undefined') {
      throw new Error('请在浏览器环境中使用')
    }

    const okxwallet = (window as any).okxwallet
    const provider = getMetaMaskProvider()
    if (!provider) {
      if (okxwallet) {
        throw new Error('检测到 OKX Wallet 接管了浏览器注入。如需继续，请在登录弹窗选择“OKX Wallet”或使用 WalletConnect。')
      }
      throw new Error('请先安装 MetaMask 扩展。如果已安装，请刷新页面后重试。')
    }

    try {
      console.log('[MetaMaskConnector] Requesting accounts...');
      const requestPromise = provider.request({ method: 'eth_requestAccounts' });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('连接超时，请检查钱包插件是否弹出窗口')), 30000)
      );

      const accounts = await Promise.race([requestPromise, timeoutPromise]) as string[];
      if (!accounts || accounts.length === 0) {
        throw new Error('未获取到账户')
      }

      const chainId = await provider.request({ method: 'eth_chainId' })

      return {
        id: `metamask-${accounts[0]}`,
        type: 'metamask',
        name: 'MetaMask',
        address: accounts[0],
        chain: 'evm',
        chainId: parseInt(chainId, 16),
        isConnected: true,
        icon: '🦊'
      }
    } catch (error: any) {
      if (error.code === 4001) {
        throw new Error('用户拒绝了连接请求')
      }
      throw new Error(error.message || 'MetaMask 连接失败，请确认已在浏览器中启用扩展或尝试 WalletConnect。')
    }
  }

  async disconnect(): Promise<void> {
    // MetaMask 不支持程序化断开，需要用户手动断开
    console.log('MetaMask断开连接')
  }

  async getAccounts(): Promise<string[]> {
    const ethereum = getMetaMaskProvider()
    if (!ethereum) return []
    try {
      return await ethereum.request({ method: 'eth_accounts' })
    } catch {
      return []
    }
  }

  async signMessage(message: string, wallet?: WalletInfo): Promise<string> {
    if (!this.isInstalled()) {
      throw new Error('MetaMask 不可用')
    }
    const ethereum = getMetaMaskProvider()
    if (!ethereum) {
      throw new Error('未检测到MetaMask Provider')
    }
    const accounts =
      wallet?.address && wallet.address.length > 0
        ? [wallet.address]
        : await ethereum.request({ method: 'eth_requestAccounts' })
    if (!accounts || accounts.length === 0) {
      throw new Error('未获取到钱包地址')
    }
    return ethereum.request({
      method: 'personal_sign',
      params: [message, accounts[0]],
    })
  }
}

// WalletConnect v2 连接器
export class WalletConnectConnector implements WalletConnector {
  id: WalletType = 'walletconnect'
  name = 'WalletConnect'
  icon = '🔗'
  description = '多链钱包连接协议'
  chain: ChainType = 'evm'
  private provider: any = null

  isInstalled(): boolean {
    return true // WalletConnect 不需要安装扩展
  }

  async connect(): Promise<WalletInfo> {
    try {
      const { EthereumProvider } = await import('@walletconnect/ethereum-provider')
      
      const provider = await EthereumProvider.init({
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id',
        chains: [1, 137, 56], // Ethereum, Polygon, BSC
        showQrModal: true,
        metadata: {
          name: 'Agentrix',
          description: 'AI经济时代的支付协议层',
          url: typeof window !== 'undefined' ? window.location.origin : '',
          icons: []
        }
      })

      await provider.enable()
      this.provider = provider

      const accounts = provider.accounts
      if (!accounts || accounts.length === 0) {
        throw new Error('未获取到账户')
      }

      return {
        id: `walletconnect-${accounts[0]}`,
        type: 'walletconnect',
        name: 'WalletConnect',
        address: accounts[0],
        chain: 'evm',
        chainId: provider.chainId,
        isConnected: true,
        icon: '🔗'
      }
    } catch (error: any) {
      if (error.message?.includes('User rejected')) {
        throw new Error('用户拒绝了连接请求')
      }
      throw new Error(error.message || 'WalletConnect连接失败')
    }
  }

  async disconnect(): Promise<void> {
    if (this.provider) {
      await this.provider.disconnect()
      this.provider = null
    }
  }

  async getAccounts(): Promise<string[]> {
    if (!this.provider) return []
    return this.provider.accounts || []
  }

  async signMessage(message: string, wallet?: WalletInfo): Promise<string> {
    if (!this.provider) {
      throw new Error('WalletConnect 会话未建立，请重新连接钱包')
    }
    const account =
      wallet?.address ||
      (this.provider.accounts && this.provider.accounts.length > 0
        ? this.provider.accounts[0]
        : null)
    if (!account) {
      throw new Error('未获取到钱包地址')
    }
    return this.provider.request({
      method: 'personal_sign',
      params: [message, account],
    })
  }
}

// Phantom (Solana) 连接器
export class PhantomConnector implements WalletConnector {
  id: WalletType = 'phantom'
  name = 'Phantom'
  icon = '👻'
  description = 'Solana生态系统钱包'
  chain: ChainType = 'solana'
  private provider: any = null

  isInstalled(): boolean {
    if (typeof window === 'undefined') return false
    return !!(window as any).solana?.isPhantom
  }

  async connect(): Promise<WalletInfo> {
    console.log('[PhantomConnector] Connecting...');
    if (!this.isInstalled()) {
      throw new Error('请先安装Phantom扩展')
    }

    const solana = (window as any).solana
    try {
      console.log('[PhantomConnector] Requesting connection...');
      const requestPromise = solana.connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('连接超时，请检查钱包插件是否弹出窗口')), 30000)
      );
      
      const response = await Promise.race([requestPromise, timeoutPromise]) as any;
      this.provider = solana

      return {
        id: `phantom-${response.publicKey.toString()}`,
        type: 'phantom',
        name: 'Phantom',
        address: response.publicKey.toString(),
        chain: 'solana',
        isConnected: true,
        icon: '👻'
      }
    } catch (error: any) {
      console.error('[PhantomConnector] Connection failed:', error);
      if (error.code === 4001) {
        throw new Error('用户拒绝了连接请求')
      }
      throw new Error(error.message || 'Phantom连接失败')
    }
  }

  async disconnect(): Promise<void> {
    if (this.provider) {
      try {
        await this.provider.disconnect()
      } catch (error) {
        console.error('Phantom断开连接失败:', error)
      }
      this.provider = null
    }
  }

  async getAccounts(): Promise<string[]> {
    if (!this.provider) return []
    try {
      const response = await this.provider.connect({ onlyIfTrusted: true })
      return [response.publicKey.toString()]
    } catch {
      return []
    }
  }

  async signMessage(message: string): Promise<string> {
    if (!this.isInstalled()) {
      throw new Error('Phantom 不可用')
    }
    const provider = this.provider || (window as any).solana
    if (!provider) {
      throw new Error('Phantom 提供者不可用')
    }
    const encodedMessage = new TextEncoder().encode(message)
    const response = await provider.signMessage(encodedMessage, 'utf8')
    const signatureBytes: Uint8Array = response.signature || response
    return Array.from(signatureBytes)
      .map((byte: number) => byte.toString(16).padStart(2, '0'))
      .join('')
  }
}

// OKX Wallet 连接器
export class OKXConnector implements WalletConnector {
  id: WalletType = 'okx'
  name = 'OKX Wallet'
  icon = '🔶'
  description = '多链支持钱包'
  chain: ChainType = 'evm'

  isInstalled(): boolean {
    if (typeof window === 'undefined') return false
    
    // 检查 window.okxwallet 是否存在
    const okxwallet = (window as any).okxwallet
    if (okxwallet) {
      return true
    }
    
    // 检查 ethereum.providers 中是否有 OKX 钱包
    const provider = getOKXProvider()
    return !!provider
  }

  async connect(): Promise<WalletInfo> {
    console.log('[OKXConnector] Connecting...');
    if (!this.isInstalled()) {
      throw new Error('请先安装OKX Wallet扩展。如果已安装，请刷新页面后重试。')
    }

    const okxwallet = getOKXProvider()
    if (!okxwallet) {
      throw new Error('未检测到OKX Wallet Provider，请确认插件已启用')
    }

    if (typeof okxwallet.request !== 'function') {
      console.error('[OKXConnector] Provider does not have request method:', okxwallet)
      throw new Error('OKX Wallet Provider 异常：找不到 request 方法')
    }

    try {
      console.log('[OKXConnector] Requesting accounts...');
      const requestPromise = okxwallet.request({ method: 'eth_requestAccounts' });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('连接超时，请检查钱包插件是否弹出窗口')), 60000)
      );
      
      const accounts = await Promise.race([requestPromise, timeoutPromise]) as string[];
      
      console.log('[OKXConnector] Accounts received:', accounts);
      if (!accounts || accounts.length === 0) {
        throw new Error('未获取到账户')
      }

      const chainId = await okxwallet.request({ method: 'eth_chainId' })

      return {
        id: `okx-${accounts[0]}`,
        type: 'okx',
        name: 'OKX Wallet',
        address: accounts[0],
        chain: 'evm',
        chainId: parseInt(chainId, 16),
        isConnected: true,
        icon: '🔶'
      }
    } catch (error: any) {
      console.error('[OKXConnector] Connection failed:', error);
      if (error.code === 4001) {
        throw new Error('用户拒绝了连接请求')
      }
      throw new Error(error.message || 'OKX Wallet连接失败')
    }
  }

  async disconnect(): Promise<void> {
    console.log('OKX Wallet断开连接')
  }

  async getAccounts(): Promise<string[]> {
    const okxwallet = getOKXProvider()
    if (!okxwallet) return []
    try {
      return await okxwallet.request({ method: 'eth_accounts' })
    } catch {
      return []
    }
  }

  async signMessage(message: string, wallet?: WalletInfo): Promise<string> {
    if (!this.isInstalled()) {
      throw new Error('OKX Wallet 不可用')
    }
    const okxwallet = getOKXProvider()
    if (!okxwallet) {
      throw new Error('未检测到OKX Wallet Provider')
    }
    const accounts =
      wallet?.address && wallet.address.length > 0
        ? [wallet.address]
        : await okxwallet.request({ method: 'eth_requestAccounts' })
    if (!accounts || accounts.length === 0) {
      throw new Error('未获取到钱包地址')
    }
    return okxwallet.request({
      method: 'personal_sign',
      params: [message, accounts[0]],
    })
  }
}

// 钱包服务管理器
export class WalletService {
  private connectors: Map<WalletType, WalletConnector> = new Map()
  private connectedWallets: Map<string, WalletInfo> = new Map()

  constructor() {
    this.connectors.set('metamask', new MetaMaskConnector())
    this.connectors.set('walletconnect', new WalletConnectConnector())
    this.connectors.set('phantom', new PhantomConnector())
    this.connectors.set('okx', new OKXConnector())
  }

  getAvailableConnectors(): WalletConnector[] {
    return Array.from(this.connectors.values())
  }

  getConnector(type: WalletType): WalletConnector | undefined {
    return this.connectors.get(type)
  }

  async connectWallet(type: WalletType): Promise<WalletInfo> {
    const connector = this.connectors.get(type)
    if (!connector) {
      throw new Error(`不支持的钱包类型: ${type}`)
    }

    const walletInfo = await connector.connect()
    this.connectedWallets.set(walletInfo.id, walletInfo)
    
    // 保存到本地存储
    if (typeof window !== 'undefined') {
      const stored: WalletInfo[] = JSON.parse(localStorage.getItem('agentrix_wallets') || '[]')
      const filtered = stored.filter((w) => w.id !== walletInfo.id && w.address !== walletInfo.address)
      filtered.push(walletInfo)
      localStorage.setItem('agentrix_wallets', JSON.stringify(filtered))
    }

    return walletInfo
  }

  async disconnectWallet(walletId: string): Promise<void> {
    const wallet = this.connectedWallets.get(walletId)
    if (wallet) {
      const connector = this.connectors.get(wallet.type)
      if (connector) {
        await connector.disconnect()
      }
      this.connectedWallets.delete(walletId)
      
      // 更新本地存储
      if (typeof window !== 'undefined') {
        const stored = JSON.parse(localStorage.getItem('agentrix_wallets') || '[]')
        const filtered = stored.filter((w: WalletInfo) => w.id !== walletId)
        localStorage.setItem('agentrix_wallets', JSON.stringify(filtered))
      }
    }
  }

  getConnectedWallets(): WalletInfo[] {
    return Array.from(this.connectedWallets.values())
  }

  async restoreConnections(): Promise<WalletInfo[]> {
    if (typeof window === 'undefined') return []

    try {
      const stored = JSON.parse(localStorage.getItem('agentrix_wallets') || '[]')
      const restored: WalletInfo[] = []

      for (const wallet of stored) {
        const connector = this.connectors.get(wallet.type)
        if (connector) {
          try {
            const accounts = await connector.getAccounts()
            if (accounts.length > 0) {
              wallet.address = accounts[0]
              wallet.isConnected = true
              this.connectedWallets.set(wallet.id, wallet)
              restored.push(wallet)
            }
          } catch {
            // 连接失败，跳过
          }
        }
      }

      return restored
    } catch (error) {
      console.error('恢复钱包连接失败:', error)
      return []
    }
  }

  setDefaultWallet(walletId: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('agentrix_default_wallet', walletId)
    }
  }

  getDefaultWallet(): WalletInfo | null {
    const wallets = this.getConnectedWallets()
    if (wallets.length === 0) return null

    if (typeof window !== 'undefined') {
      const defaultId = localStorage.getItem('agentrix_default_wallet')
      if (defaultId) {
        const wallet = wallets.find(w => w.id === defaultId)
        if (wallet) return wallet
      }
    }

    return wallets[0] // 返回第一个连接的钱包
  }

  async signMessage(wallet: WalletInfo, message: string): Promise<string> {
    const connector = this.connectors.get(wallet.type)
    if (!connector || !connector.signMessage) {
      throw new Error('当前钱包暂不支持签名，请使用支持签名的钱包')
    }
    return connector.signMessage(message, wallet)
  }
}

// 单例实例
export const walletService = new WalletService()

