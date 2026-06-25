# Agentrix V7.0 - 统一支付协议

**版本**: V7.0 (Agent-First & Crypto-Rail Edition)  
**日期**: 2025年1月

---

## 🎯 核心特性

### ✨ 主要功能

- ✅ **ERC-8004 标准** - 轻量级账户抽象，支持 Session Key
- ✅ **QuickPay** - 链下签名验证，即时确认，异步上链
- ✅ **非托管模式** - 资金在用户钱包，通过授权划扣
- ✅ **Crypto-Rail 优先** - 法币通道作为 On-Ramp，底层统一 USDC 结算
- ✅ **Pre-Flight Check** - 200ms 路由决策，动态 UI 渲染
- ✅ **Agent 友好** - 支持自动化限额支付

---

## 🚀 快速开始

### 1. 安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd ../agentrixfrontend
npm install

# 合约
cd ../contract
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
# 数据库
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_DATABASE=agentrix

# Relayer
RELAYER_PRIVATE_KEY=your_relayer_private_key
RPC_URL=https://your-rpc-url
ERC8004_CONTRACT_ADDRESS=0x...
USDC_ADDRESS=0x...

# Provider
MOONPAY_API_KEY=your_moonpay_api_key
AGENTRIX_CONTRACT_ADDRESS=0x...
```

### 3. 运行数据库迁移

```bash
cd backend
npm run migration:run
```

### 4. 部署合约（可选，测试网）

```bash
cd contract
npx hardhat run scripts/deploy-erc8004.ts --network sepolia
```

### 5. 启动服务

```bash
# 后端
cd backend
npm run start:dev

# 前端
cd agentrixfrontend
npm run dev
```

---

## 📚 文档

- [支付重构反馈与优化方案](./Agentrix-V7.0-支付重构反馈与优化方案.md)
- [技术实施指南](./Agentrix-V7.0-技术实施指南.md)
- [执行摘要](./Agentrix-V7.0-执行摘要.md)
- [重构完成总结](./Agentrix-V7.0-重构完成总结.md)
- [完整实施清单](./Agentrix-V7.0-完整实施清单.md)
- [快速开始指南](./Agentrix-V7.0-快速开始指南.md)
- [测试验证指南](./Agentrix-V7.0-测试验证指南.md)

---

## 🏗️ 架构

### 智能合约层
- `ERC8004SessionManager.sol` - ERC-8004 标准实现

### 后端服务层
- `RelayerModule` - Relayer 服务（链下验证 + 异步上链）
- `SessionModule` - Session 管理服务
- `PreflightCheckService` - Pre-Flight Check 服务
- `CryptoRailService` - Crypto-Rail 聚合服务

### 前端/SDK 层
- `SmartCheckout` - 智能收银台组件
- `SessionManager` - Session 管理组件
- `SessionKeyManager` - Session Key 管理器
- `useQuickPay` - QuickPay Hook
- `usePreflightCheck` - Pre-Flight Check Hook

---

## 🔧 API 端点

### Relayer API
- `POST /relayer/quickpay` - 处理 QuickPay 请求
- `GET /relayer/queue/status` - 获取队列状态

### Payment API
- `GET /payment/preflight` - Pre-Flight Check

### Session API
- `POST /sessions` - 创建 Session
- `GET /sessions` - 获取用户所有 Session
- `GET /sessions/active` - 获取活跃 Session
- `DELETE /sessions/:sessionId` - 撤销 Session

---

## 💡 使用示例

### 创建 Session

```typescript
import { useSessionManager } from '@/hooks/useSessionManager';

function MyComponent() {
  const { createSession } = useSessionManager();

  const handleCreate = async () => {
    await createSession({
      singleLimit: 10, // 10 USDC
      dailyLimit: 100, // 100 USDC
      expiryDays: 30,
      agentId: 'my-agent',
    });
  };

  return <button onClick={handleCreate}>Create Session</button>;
}
```

### QuickPay 支付

```typescript
import { SmartCheckout } from '@/components/payment/SmartCheckout';

function PaymentPage() {
  return (
    <SmartCheckout
      order={{
        id: 'order_123',
        amount: 9.90,
        currency: 'USDC',
        description: 'Pro Subscription',
        merchantId: 'merchant_123',
        to: '0x...',
      }}
      onSuccess={(result) => console.log('Success:', result)}
    />
  );
}
```

---

## 🧪 测试

```bash
# 运行测试脚本（Linux/Mac/WSL）
./test-v7-features.sh

# 或手动测试
# 1. 启动服务
# 2. 访问 http://localhost:3000
# 3. 使用 Swagger UI: http://localhost:3001/api
```

---

## 📊 性能指标

- Pre-Flight Check: < 200ms
- QuickPay 确认: < 1秒
- 批量上链 Gas 节省: > 30%
- Relayer 可用性: > 99.9%

---

## 🔒 安全

- Session Key 私钥加密存储
- 签名验证（EIP-191）
- Nonce 防重放
- 限额保护（单笔/每日）
- 紧急撤销机制

---

## 📝 更新日志

### V7.0 (2025-01)
- ✅ 实现 ERC-8004 标准合约
- ✅ 构建 Relayer 服务
- ✅ 实现 Pre-Flight Check
- ✅ 创建 Session 管理 API
- ✅ 实现 Crypto-Rail 聚合
- ✅ 构建前端 UI 组件

---

## 🆘 支持

- 查看 [测试验证指南](./Agentrix-V7.0-测试验证指南.md)
- 查看 [快速开始指南](./Agentrix-V7.0-快速开始指南.md)
- 查看后端日志和前端控制台

---

**维护者**: Agentrix 开发团队

