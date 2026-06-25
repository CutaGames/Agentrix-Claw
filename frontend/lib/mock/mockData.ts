export const mockPaymentRequests = {
  agentPayment: {
    id: 'pay_001',
    amount: '¥7,999',
    currency: 'CNY',
    description: '联想 Yoga 笔记本电脑 - 通过AI购物助手推荐',
    merchant: '联想官方旗舰店',
    agent: 'AI购物助手',
    metadata: {
      productId: 'prod_123',
      category: 'electronics',
      agentCommission: '5%'
    },
    createdAt: new Date().toISOString()
  },
  directPayment: {
    id: 'pay_002', 
    amount: '¥299',
    currency: 'CNY',
    description: '无线蓝牙耳机',
    merchant: '数码配件商城',
    metadata: {
      productId: 'prod_456',
      category: 'audio'
    },
    createdAt: new Date().toISOString()
  }
}

export const mockWallets = [
  {
    id: '1',
    name: 'MetaMask',
    address: '0x742d35Cc6634C0532925a3b8Dc2388e46b6d35e8',
    chain: 'Ethereum',
    isConnected: true,
    balance: '¥1,234.56'
  },
  {
    id: '2',
    name: 'OKX Wallet',
    address: '0x8a3b9f2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8',
    chain: 'Polygon',
    isConnected: false,
    balance: '¥567.89'
  }
]

export const mockTransactions = [
  {
    id: 'TXN-001',
    description: 'AI购物助手 - 笔记本电脑',
    amount: '¥7,999',
    date: '2024-01-15 14:30',
    status: 'completed',
    type: 'payment',
    transactionHash: '0x123...abc'
  },
  {
    id: 'TXN-002',
    description: '钱包充值',
    amount: '¥1,000',
    date: '2024-01-14 10:15',
    status: 'completed',
    type: 'deposit',
    transactionHash: '0x456...def'
  }
]

export const mockAutoPayGrants = [
  {
    id: '1',
    agentName: 'AI购物助手',
    agentIcon: '🤖',
    singleLimit: '¥100',
    dailyLimit: '¥500',
    usedToday: '¥0',
    totalUsed: '¥0',
    expiresAt: '2024-02-15',
    createdAt: '2024-01-10'
  }
]
