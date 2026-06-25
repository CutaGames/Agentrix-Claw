# Agentrix UCP (Universal Commerce Protocol) 集成 PRD

## 1. 背景与目标

### 1.1 背景
Google 联合 Shopify、Etsy、Walmart、Target 等行业巨头于 2026 年 1 月发布了 **Universal Commerce Protocol (UCP)** 开放标准。该协议旨在解决 Agent 电商生态中的碎片化问题，实现：
- AI Agent 与商户之间的标准化通信
- 跨平台支付互操作（支持 Google Pay、PayPal、Stripe 等）
- MCP、A2A 协议原生支持
- AP2（Agent Payments Protocol）安全授权机制

### 1.2 目标
Agentrix 作为领先的 Agent 支付和电商平台，需要**快速兼容并增强 UCP 协议**，实现：
1. **作为 Business（商户）端**：暴露 UCP 兼容的结账 API，让外部 AI Agent 能够发现并调用 Agentrix 商户的商品和服务
2. **作为 Platform（平台）端**：让 Agentrix Agent 能够调用外部 UCP 商户完成购物
3. **支付增强**：集成 Google Pay、PayPal 作为 Payment Handler
4. **AP2 Mandate 支持**：增强自主 Agent 交易的安全性

## 2. 核心概念映射

| UCP 概念 | Agentrix 对应组件 | 说明 |
|---------|------------------|------|
| Business | Agentrix Merchant | 商户提供商品/服务 |
| Platform | Agentrix Agent | AI Agent 代表用户购物 |
| Checkout Session | Pay Intent | 支付意图/结账会话 |
| Payment Handler | Payment Method | 支付方式 (X402, Stripe, Google Pay, PayPal) |
| Identity Linking | OAuth 授权 | 用户账户关联 |
| AP2 Mandate | Authorization Entity | 授权凭证 |

## 3. 功能需求

### 3.1 Business Profile 暴露 (P0)
**目标**：让外部 AI Agent 发现 Agentrix 商户的能力

**实现**：
- 暴露 `/.well-known/ucp` 端点返回 Business Profile
- 声明支持的 Capabilities：
  - `dev.ucp.shopping.checkout` - 结账能力
  - `dev.ucp.shopping.fulfillment` - 履约能力
  - `dev.ucp.shopping.order` - 订单管理
  - `dev.ucp.shopping.ap2_mandate` - AP2 授权（可选）
- 声明支持的 Payment Handlers：
  - `com.google.pay` - Google Pay
  - `com.paypal.checkout` - PayPal
  - `dev.agentrix.x402` - X402 协议
  - `com.stripe.tokenizer` - Stripe

**API 端点**：
```
GET /.well-known/ucp
Response: UCP Business Profile JSON
```

### 3.2 Checkout REST API (P0)
**目标**：实现 UCP 标准的结账 REST 绑定

**端点列表**：
| 操作 | 方法 | 路径 | 说明 |
|-----|-----|------|------|
| Create Checkout | POST | /ucp/checkout-sessions | 创建结账会话 |
| Get Checkout | GET | /ucp/checkout-sessions/{id} | 获取结账状态 |
| Update Checkout | PUT | /ucp/checkout-sessions/{id} | 更新结账信息 |
| Complete Checkout | POST | /ucp/checkout-sessions/{id}/complete | 完成结账 |
| Cancel Checkout | POST | /ucp/checkout-sessions/{id}/cancel | 取消结账 |

**请求头要求**：
- `UCP-Agent`: 必填，包含 Platform Profile URI
- `Idempotency-Key`: 建议，防止重复操作
- `Authorization`: 可选，OAuth 2.0 Bearer Token

### 3.3 Payment Handler 集成 (P0)

#### 3.3.1 Google Pay Handler
```json
{
  "id": "gpay",
  "name": "com.google.pay",
  "version": "2026-01-11",
  "spec": "https://pay.google.com/gp/p/ucp/2026-01-11/",
  "config": {
    "api_version": 2,
    "environment": "PRODUCTION",
    "merchant_info": {
      "merchant_name": "Agentrix Merchant",
      "merchant_id": "..."
    }
  }
}
```

#### 3.3.2 PayPal Handler
```json
{
  "id": "paypal",
  "name": "com.paypal.checkout",
  "version": "2026-01-11",
  "spec": "https://developer.paypal.com/ucp/",
  "config": {
    "client_id": "...",
    "intent": "CAPTURE"
  }
}
```

#### 3.3.3 X402 Handler (Agentrix 原生)
```json
{
  "id": "x402",
  "name": "dev.agentrix.x402",
  "version": "2026-01-11",
  "spec": "https://agentrix.io/ucp/x402",
  "config": {
    "supported_chains": ["ethereum", "solana", "base"],
    "supported_tokens": ["USDC", "USDT"]
  }
}
```

### 3.4 MCP Binding 支持 (P1)
**目标**：支持通过 MCP 协议调用 UCP 能力

**工具映射**：
| MCP Tool | UCP Operation |
|----------|--------------|
| `create_checkout` | Create Checkout |
| `get_checkout` | Get Checkout |
| `update_checkout` | Update Checkout |
| `complete_checkout` | Complete Checkout |
| `cancel_checkout` | Cancel Checkout |

### 3.5 AP2 Mandate 支持 (P1)
**目标**：支持自主 Agent 的加密授权

**流程**：
1. Agent 生成用户签名的 Checkout Mandate
2. 包含 Payment Mandate（支付授权凭证）
3. Business 验证签名完成交易

### 3.6 Platform 能力 (P2)
**目标**：Agentrix Agent 作为 Platform 调用外部 UCP 商户

**功能**：
- 发现外部商户的 `/.well-known/ucp`
- 解析商户 Capabilities
- 发起 UCP 标准结账请求
- 处理各类 Payment Handler 响应

## 4. 技术架构

### 4.1 模块结构
```
backend/src/modules/ucp/
├── ucp.module.ts
├── ucp.controller.ts              # REST 端点
├── ucp.service.ts                 # 核心逻辑
├── dto/
│   ├── checkout-session.dto.ts
│   ├── ucp-profile.dto.ts
│   └── payment-data.dto.ts
├── handlers/
│   ├── google-pay.handler.ts
│   ├── paypal.handler.ts
│   └── x402.handler.ts
└── mcp/
    └── ucp-mcp.tools.ts           # MCP 工具定义
```

### 4.2 数据模型

#### UCP Checkout Session
```typescript
interface UCPCheckoutSession {
  id: string;
  status: 'incomplete' | 'ready_for_complete' | 'complete' | 'cancelled';
  currency: string;
  buyer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  line_items: UCPLineItem[];
  totals: UCPTotal[];
  payment?: {
    handlers: UCPPaymentHandler[];
  };
  fulfillment?: UCPFulfillment;
  ucp: {
    version: string;
    capabilities: UCPCapability[];
  };
}
```

### 4.3 与现有系统集成

| UCP 组件 | Agentrix 集成点 |
|---------|----------------|
| Checkout Session | PayIntent + Order 服务 |
| Line Items | Product 服务 |
| Payment Data | PaymentService, X402Service |
| Fulfillment | LogisticsService |
| Buyer | UserService |

## 5. 安全考虑

### 5.1 Transport Security
- 所有 UCP 端点必须通过 HTTPS (TLS 1.3+)
- 支持 mTLS 用于高安全场景

### 5.2 Authentication
- API Key 认证 (`X-API-Key`)
- OAuth 2.0 Bearer Token
- Request Signature 验证

### 5.3 PCI-DSS 合规
- 支付凭证仅以 Token 形式传递
- 不存储原始卡号
- 使用 PSP 托管的 tokenization

### 5.4 AP2 Non-Repudiation
- 验证用户签名的 Mandate
- 存储交易凭证用于争议解决

## 6. 实施计划

### Phase 1: 基础兼容 (本次实现)
- [x] Business Profile 暴露
- [x] Checkout REST API 基础实现
- [x] Google Pay Handler 集成
- [x] PayPal Handler 集成
- [x] 与现有 PayIntent 系统集成

### Phase 2: 增强功能
- [ ] MCP Binding 完整实现
- [ ] AP2 Mandate 支持
- [ ] Order Capability 实现
- [ ] Identity Linking 实现

### Phase 3: Platform 能力
- [ ] 外部商户发现
- [ ] 作为 Platform 发起 UCP 请求
- [ ] 多商户聚合结账

## 7. 验收标准

### 7.1 功能验收
- [ ] `/.well-known/ucp` 返回有效的 Business Profile
- [ ] 能创建、更新、完成 UCP Checkout Session
- [ ] Google Pay 支付流程可用
- [ ] PayPal 支付流程可用
- [ ] X402 支付继续兼容

### 7.2 兼容性验收
- [ ] 通过 UCP Playground 验证
- [ ] 符合 UCP 2026-01-11 版本规范
- [ ] JSON Schema 验证通过

### 7.3 性能验收
- [ ] Checkout Session 创建 < 200ms
- [ ] Complete Checkout < 3s (含支付处理)

## 8. 参考资料

- [UCP 官方规范](https://ucp.dev/specification/overview/)
- [UCP GitHub](https://github.com/Universal-Commerce-Protocol/ucp)
- [UCP Playground](https://ucp.dev/playground/)
- [AP2 Protocol](https://ap2-protocol.org/)
- [Google Pay UCP Handler](https://developers.google.com/merchant/ucp/)
