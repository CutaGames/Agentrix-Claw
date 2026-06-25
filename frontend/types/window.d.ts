/**
 * Window 对象类型扩展
 * 用于支持各种钱包提供者
 */

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>
      isMetaMask?: boolean
      on?: (event: string, handler: (...args: any[]) => void) => void
      removeListener?: (event: string, handler: (...args: any[]) => void) => void
    }
    solana?: {
      isPhantom?: boolean
      connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>
      disconnect: () => Promise<void>
    }
    okxwallet?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>
    }
  }
}

export {}

