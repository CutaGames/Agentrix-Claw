# 多钱包连接和Stripe支付集成说明

## 📦 已实现功能

### 1. 多钱包连接支持

✅ **MetaMask** - 以太坊生态系统钱包
✅ **WalletConnect v2** - 多链钱包连接协议
✅ **Phantom** - Solana生态系统钱包
✅ **OKX Wallet** - 多链支持钱包

### 2. Stripe支付集成

✅ **信用卡支付** - 支持Visa、Mastercard、American Express等
✅ **支付意图创建** - 与后端API集成（需要后端支持）
✅ **支付确认** - 完整的支付流程

## 🔧 配置说明

### 环境变量

在项目根目录创建 `.env.local` 文件：

```env
# Stripe配置
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here

# WalletConnect配置
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id_here
```

### 获取Stripe密钥

1. 访问 [Stripe Dashboard](https://dashboard.stripe.com/)
2. 注册/登录账户
3. 在 Developers > API keys 中获取 Publishable key
4. 将密钥添加到 `.env.local`

### 获取WalletConnect Project ID

1. 访问 [WalletConnect Cloud](https://cloud.walletconnect.com/)
2. 创建新项目
3. 获取 Project ID
4. 将ID添加到 `.env.local`

## 📁 文件结构

```
agentrixfrontend/
├── lib/
│   ├── wallet/
│   │   └── WalletService.ts      # 多钱包连接服务
│   └── stripe/
│       └── config.ts              # Stripe配置
├── components/
│   └── payment/
│       ├── StripePayment.tsx      # Stripe支付组件
│       └── WalletConnect.tsx      # 钱包连接组件（已更新）
├── contexts/
│   └── Web3Context.tsx            # Web3上下文（已增强）
├── types/
│   └── window.d.ts                # Window类型扩展
└── pages/
    └── app/
        └── user/
            └── wallets.tsx        # 钱包管理页面（已更新）
```

## 🚀 使用方法

### 1. 连接钱包

```typescript
import { useWeb3 } from '@/contexts/Web3Context'
import { WalletType } from '@/lib/wallet/WalletService'

function MyComponent() {
  const { connect, connectedWallets, defaultWallet } = useWeb3()

  const handleConnect = async () => {
    try {
      await connect('metamask') // 或 'walletconnect', 'phantom', 'okx'
    } catch (error) {
      console.error('连接失败:', error)
    }
  }

  return (
    <div>
      {connectedWallets.map(wallet => (
        <div key={wallet.id}>
          {wallet.name} - {wallet.address}
        </div>
      ))}
    </div>
  )
}
```

### 2. 使用Stripe支付

Stripe支付已集成到 `PaymentModal` 组件中，会自动显示在支付方式列表中。

```typescript
// PaymentModal 会自动处理Stripe支付
// 用户选择"信用卡支付"后，会显示Stripe支付表单
```

### 3. 钱包管理

用户可以在 `/app/user/wallets` 页面：
- 查看已连接的钱包
- 连接新钱包
- 设置默认钱包
- 断开钱包连接

## 🔌 后端API集成

### Stripe支付意图创建

需要创建后端API端点 `/api/payments/create-intent`：

```typescript
// pages/api/payments/create-intent.ts
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { amount, currency } = req.body

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
    })

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
```

## 🧪 测试

### 测试钱包连接

1. 安装MetaMask浏览器扩展
2. 访问钱包管理页面
3. 点击"连接MetaMask"
4. 确认连接成功

### 测试Stripe支付

1. 使用Stripe测试卡号：`4242 4242 4242 4242`
2. 任意未来日期作为过期日期
3. 任意3位数字作为CVC
4. 任意邮编

## ⚠️ 注意事项

1. **WalletConnect**: 需要有效的Project ID才能正常工作
2. **Phantom**: 需要安装Phantom浏览器扩展
3. **OKX Wallet**: 需要安装OKX Wallet扩展
4. **Stripe**: 在生产环境使用前，需要配置Webhook处理支付结果
5. **本地存储**: 钱包连接信息存储在localStorage中

## 🐛 故障排除

### 钱包连接失败

- 检查是否安装了对应的钱包扩展
- 检查浏览器控制台是否有错误信息
- 确认网络连接正常

### Stripe支付失败

- 检查环境变量是否正确配置
- 确认后端API端点正常工作
- 检查Stripe Dashboard中的日志

## 📝 下一步

- [ ] 实现钱包余额查询
- [ ] 添加网络切换功能
- [ ] 完善错误处理
- [ ] 添加支付历史记录
- [ ] 实现多币种支持

