import { mockTransactions, mockWallets } from './mockData'

// 模拟API调用
export const mockAPI = {
  // 支付相关
  createPayment: (paymentData: any) => 
    new Promise((resolve) => setTimeout(() => resolve({
      success: true,
      transactionHash: '0x' + Math.random().toString(16).substr(2, 64),
      timestamp: new Date().toISOString()
    }), 2000)),

  // 钱包相关
  connectWallet: (walletType: string) =>
    new Promise((resolve) => setTimeout(() => resolve({
      connected: true,
      address: '0x' + Math.random().toString(16).substr(2, 40),
      chain: 'Ethereum'
    }), 1000)),

  // 授权相关
  createAutoPayGrant: (grantData: any) =>
    new Promise((resolve) => setTimeout(() => resolve({
      success: true,
      grantId: 'grant_' + Date.now()
    }), 1500)),

  // 数据获取
  getTransactions: () =>
    new Promise((resolve) => setTimeout(() => resolve(mockTransactions), 500)),

  getWallets: () =>
    new Promise((resolve) => setTimeout(() => resolve(mockWallets), 500))
}
