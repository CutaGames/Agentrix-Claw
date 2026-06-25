# Agentrix V2.2 后端和合约开发工作清单

**创建日期**: 2025-01-XX  
**目的**: 评估后端和合约开发工作量，制定开发策略

---

## 📊 总体评估

| 模块 | 工作量估算 | 依赖关系 | 优先级 |
|------|-----------|---------|--------|
| 后端开发 | 6-8周 | 部分依赖前端API定义 | P0 |
| 合约开发 | 4-6周 | 相对独立 | P0 |
| 集成测试 | 2-3周 | 依赖前后端和合约 | P1 |

---

## 🔧 后端开发工作内容

### 一、核心服务模块（P0 - MVP必须）

#### 1.1 钱包服务（WalletService）- 新增 ⏱️ 1周

**工作内容**:
- [ ] 多钱包连接身份验证API
- [ ] 钱包-用户绑定关系管理
  - [ ] 创建/更新/删除钱包绑定
  - [ ] 查询用户所有钱包
  - [ ] 设置默认钱包
- [ ] 多链地址映射和验证
  - [ ] EVM地址验证
  - [ ] Solana地址验证
  - [ ] 地址格式转换
- [ ] 钱包签名验证逻辑
  - [ ] 消息签名验证
  - [ ] 交易签名验证
- [ ] 钱包连接状态同步

**API端点**:
```
POST   /api/wallets/connect          # 连接钱包
DELETE /api/wallets/:walletId         # 断开钱包
GET    /api/wallets                  # 获取用户钱包列表
PUT    /api/wallets/:walletId/default # 设置默认钱包
POST   /api/wallets/verify-signature  # 验证签名
```

**数据库表**:
```sql
wallet_connections (
  id, user_id, wallet_type, wallet_address, 
  chain_id, connected_at, last_used_at
)
```

**依赖关系**:
- ✅ 前端已定义接口需求
- ⚠️ 需要与前端联调测试

---

#### 1.2 支付引擎与X402协议 - 增强 ⏱️ 2周

**工作内容**:
- [ ] X402协议支付适配器
  - [ ] X402协议接口实现
  - [ ] 交易压缩逻辑
  - [ ] 批量签名验证
  - [ ] Gas优化计算
- [ ] 智能路由X402优先级算法
  - [ ] 通道选择算法
  - [ ] 成本评估
  - [ ] 回退机制
- [ ] 与现有Stripe、Web3支付渠道集成
  - [ ] Stripe支付意图创建
  - [ ] Web3支付处理
  - [ ] 支付状态同步
- [ ] 支付状态机管理
- [ ] Webhook回调处理

**API端点**:
```
POST   /api/payments/create-intent    # 创建支付意图（Stripe）
POST   /api/payments/process         # 处理支付
POST   /api/payments/x402/create     # 创建X402支付会话
GET    /api/payments/:paymentId      # 查询支付状态
POST   /api/payments/webhook         # 支付Webhook
```

**数据库表**:
```sql
payments (
  id, user_id, amount, currency, status,
  payment_method, transaction_hash, created_at
)

x402_payment_sessions (
  id, payment_id, session_id, compressed_data,
  status, gas_saved, created_at
)
```

**依赖关系**:
- ✅ 前端已定义支付流程
- ⚠️ 需要X402协议详细规范
- ⚠️ 需要与合约交互

---

#### 1.3 自动支付服务（AutoPayService）- 新增 ⏱️ 1.5周

**工作内容**:
- [ ] 自动支付授权管理API
  - [ ] 创建授权
  - [ ] 查询授权列表
  - [ ] 更新授权
  - [ ] 撤销授权
- [ ] 授权规则验证引擎
  - [ ] 时间验证（有效期）
  - [ ] 限额验证（单次/每日）
  - [ ] 频率验证
- [ ] 自动支付执行逻辑
  - [ ] 触发条件检查
  - [ ] 自动执行支付
  - [ ] 额度使用追踪
- [ ] 与智能合约交互
  - [ ] 授权记录上链
  - [ ] 执行结果同步

**API端点**:
```
POST   /api/auto-pay/grants          # 创建授权
GET    /api/auto-pay/grants          # 查询授权列表
PUT    /api/auto-pay/grants/:id      # 更新授权
DELETE /api/auto-pay/grants/:id      # 撤销授权
POST   /api/auto-pay/execute         # 执行自动支付
GET    /api/auto-pay/usage           # 查询使用情况
```

**数据库表**:
```sql
auto_pay_grants (
  id, user_id, agent_id, single_limit,
  daily_limit, used_today, expires_at,
  is_active, created_at
)
```

**依赖关系**:
- ✅ 前端已定义授权流程
- ⚠️ 需要与合约交互
- ⚠️ 需要Agent服务支持

---

#### 1.4 产品市场服务（ProductCatalog）- 保留+增强 ⏱️ 1周

**工作内容**:
- [ ] 商品CRUD API
  - [ ] 创建/更新/删除商品
  - [ ] 商品搜索和筛选
  - [ ] 商品详情查询
- [ ] 库存管理
  - [ ] 库存扣减
  - [ ] 库存预警
- [ ] 与支付系统集成
  - [ ] 商品购买流程
  - [ ] 订单创建
- [ ] 商品推荐功能
  - [ ] Agent推荐商品列表
  - [ ] 推荐效果统计

**API端点**:
```
GET    /api/products                 # 商品列表（支持搜索筛选）
GET    /api/products/:id            # 商品详情
POST   /api/products                 # 创建商品（商户）
PUT    /api/products/:id             # 更新商品
DELETE /api/products/:id             # 删除商品
GET    /api/products/recommended     # 推荐商品（Agent）
POST   /api/products/:id/purchase    # 购买商品
```

**数据库表**:
```sql
products (
  id, merchant_id, name, description,
  price, stock, category, commission_rate,
  status, created_at
)
```

**依赖关系**:
- ✅ 前端已定义商品管理界面
- ⚠️ 需要与支付系统集成

---

#### 1.5 分润服务（CommissionService）- 增强 ⏱️ 1.5周

**工作内容**:
- [ ] 分润规则计算引擎
  - [ ] 分润比例计算
  - [ ] 多级分润支持
  - [ ] 分润记录生成
- [ ] 自动结算逻辑（T+1）
  - [ ] 结算周期管理
  - [ ] 自动结算任务
  - [ ] 结算状态追踪
- [ ] 多币种结算支持
- [ ] 结算失败重试机制
- [ ] 与智能合约交互
  - [ ] 分润上链记录
  - [ ] 自动结算触发

**API端点**:
```
GET    /api/commissions              # 分润记录查询
GET    /api/commissions/settlements  # 结算记录
POST   /api/commissions/calculate   # 计算分润
POST   /api/commissions/settle      # 执行结算
GET    /api/commissions/stats       # 分润统计
```

**数据库表**:
```sql
commissions (
  id, payment_id, payee_id, payee_type,
  amount, currency, status, created_at
)

commission_settlements (
  id, payee_id, payee_type, amount,
  currency, settlement_date, status,
  transaction_hash, created_at
)
```

**依赖关系**:
- ✅ 前端已定义分润界面
- ⚠️ 需要与支付系统集成
- ⚠️ 需要与合约交互

---

#### 1.6 订单与交易管理 - 保留+增强 ⏱️ 1周

**工作内容**:
- [ ] 订单生命周期管理
  - [ ] 订单创建
  - [ ] 订单状态更新
  - [ ] 订单查询
- [ ] 支付状态同步
  - [ ] 支付成功回调
  - [ ] 支付失败处理
  - [ ] 退款处理
- [ ] 与新支付方式适配
  - [ ] Stripe订单
  - [ ] Web3订单
  - [ ] X402订单
- [ ] 订单统计和分析

**API端点**:
```
GET    /api/orders                   # 订单列表
GET    /api/orders/:id               # 订单详情
POST   /api/orders                   # 创建订单
PUT    /api/orders/:id/status        # 更新订单状态
POST   /api/orders/:id/refund        # 退款
GET    /api/orders/stats             # 订单统计
```

**数据库表**:
```sql
orders (
  id, user_id, merchant_id, product_id,
  amount, status, payment_method,
  transaction_hash, created_at
)
```

**依赖关系**:
- ✅ 前端已定义订单管理界面
- ⚠️ 需要与支付系统集成

---

### 二、Passkey认证服务（P1 - 重要）⏱️ 1周

**工作内容**:
- [ ] WebAuthn API集成
- [ ] Passkey注册流程
  - [ ] 主钱包签名验证
  - [ ] Passkey凭证创建
  - [ ] 公钥存储
- [ ] Passkey认证流程
  - [ ] 认证请求
  - [ ] 签名验证
  - [ ] 支付执行
- [ ] 支付限额验证
- [ ] 设备管理

**API端点**:
```
POST   /api/passkey/register          # 注册Passkey
POST   /api/passkey/authenticate     # 认证
GET    /api/passkey/devices          # 设备列表
DELETE /api/passkey/devices/:id      # 删除设备
```

**数据库表**:
```sql
passkey_credentials (
  id, user_id, credential_id,
  public_key, sign_count, device_type,
  registered_at, last_used_at
)
```

**依赖关系**:
- ✅ 前端已定义Passkey UI
- ⚠️ 需要WebAuthn规范实现

---

### 三、多签支付服务（P1 - 重要）⏱️ 1周

**工作内容**:
- [ ] 多签交易构建
- [ ] 多签审批流程状态机
- [ ] 审批通知服务
- [ ] 超时与撤销机制
- [ ] Safe（Gnosis）钱包集成

**API端点**:
```
POST   /api/multisig/create          # 创建多签交易
GET    /api/multisig/:id             # 查询多签交易
POST   /api/multisig/:id/approve     # 审批
POST   /api/multisig/:id/cancel      # 取消
```

**数据库表**:
```sql
multisig_transactions (
  id, payment_id, multisig_address,
  required_signatures, current_signatures,
  status, created_at, expires_at
)
```

**依赖关系**:
- ✅ 前端已定义多签UI
- ⚠️ 需要Safe钱包SDK集成

---

### 四、SDK服务 - 增强 ⏱️ 1周

**工作内容**:
- [ ] JS SDK更新
  - [ ] 新功能接口封装
  - [ ] 文档更新
- [ ] Python SDK（AI Agent专用）
  - [ ] 支付接口
  - [ ] 商品推荐接口
  - [ ] 分润查询接口
- [ ] API文档更新
- [ ] 示例代码与教程

**依赖关系**:
- ⚠️ 需要后端API稳定后开发

---

### 五、基础设施 ⏱️ 1周

**工作内容**:
- [ ] 数据库设计与迁移
- [ ] Redis缓存配置
- [ ] 消息队列配置
- [ ] 日志系统
- [ ] 监控和告警
- [ ] API网关配置
- [ ] 部署脚本

---

## 🔗 智能合约开发工作内容

### 一、自动支付合约（AutoPayContract）- 新增 ⏱️ 2周

**工作内容**:
- [ ] 合约架构设计
- [ ] 用户授权规则存储
  - [ ] 限额存储（单次/每日）
  - [ ] 有效期管理
  - [ ] Agent授权映射
- [ ] Agent自动支付执行逻辑
  - [ ] 授权验证
  - [ ] 限额检查
  - [ ] 支付执行
- [ ] 额度使用追踪与更新
- [ ] 权限管理与安全控制
- [ ] 事件定义和emit
- [ ] 单元测试
- [ ] 集成测试

**合约接口**:
```solidity
interface IAutoPay {
  function createGrant(
    address agent,
    uint256 singleLimit,
    uint256 dailyLimit,
    uint256 expiresAt
  ) external;
  
  function executeAutoPayment(
    address agent,
    address recipient,
    uint256 amount
  ) external returns (bool);
  
  function revokeGrant(address agent) external;
}
```

**依赖关系**:
- ✅ 前端已定义授权流程
- ⚠️ 需要与后端API交互
- ⚠️ 需要支付路由合约支持

---

### 二、X402协议交互合约 - 新增 ⏱️ 1.5周

**工作内容**:
- [ ] X402协议接口适配
- [ ] 压缩交易数据处理
- [ ] 防重放攻击机制
- [ ] Gas优化验证
- [ ] 批量交易处理
- [ ] 事件定义
- [ ] 单元测试

**合约接口**:
```solidity
interface IX402Adapter {
  function createPaymentSession(
    bytes calldata compressedData
  ) external returns (bytes32);
  
  function executePayment(
    bytes32 sessionId,
    bytes calldata signatures
  ) external;
}
```

**依赖关系**:
- ⚠️ 需要X402协议详细规范
- ⚠️ 需要与后端交互

---

### 三、分润结算合约 - 增强 ⏱️ 1.5周

**工作内容**:
- [ ] 分润规则链上记录
- [ ] 自动结算触发逻辑
- [ ] 多签treasury管理（如需要）
- [ ] 结算状态追踪
- [ ] 多币种支持
- [ ] 事件定义
- [ ] 单元测试

**合约接口**:
```solidity
interface ICommission {
  function recordCommission(
    address payee,
    uint256 amount,
    address currency
  ) external;
  
  function settleCommission(
    address payee,
    address currency
  ) external;
}
```

**依赖关系**:
- ✅ 前端已定义分润流程
- ⚠️ 需要与后端API交互

---

### 四、支付路由合约 - 增强 ⏱️ 1周

**工作内容**:
- [ ] 多支付渠道路由逻辑
- [ ] X402协议优先级设置
- [ ] 手续费优化算法
- [ ] 回退机制
- [ ] 事件定义
- [ ] 单元测试

**依赖关系**:
- ⚠️ 需要与其他合约集成

---

### 五、安全审计与部署 ⏱️ 1周

**工作内容**:
- [ ] 合约安全审计
- [ ] 漏洞修复
- [ ] 测试网部署
- [ ] 主网部署脚本
- [ ] 部署文档

---

## 📋 依赖关系分析

### 前端 → 后端依赖

| 前端功能 | 需要的后端API | 状态 |
|---------|-------------|------|
| 钱包连接 | `/api/wallets/*` | ✅ 接口已定义 |
| Stripe支付 | `/api/payments/create-intent` | ✅ 接口已定义 |
| 支付流程 | `/api/payments/*` | ✅ 接口已定义 |
| 自动支付授权 | `/api/auto-pay/grants/*` | ✅ 接口已定义 |
| 商品管理 | `/api/products/*` | ✅ 接口已定义 |
| 分润查询 | `/api/commissions/*` | ✅ 接口已定义 |
| 订单管理 | `/api/orders/*` | ✅ 接口已定义 |

### 后端 → 合约依赖

| 后端功能 | 需要的合约接口 | 状态 |
|---------|--------------|------|
| 自动支付 | `AutoPayContract` | ⚠️ 需要开发 |
| X402支付 | `X402Adapter` | ⚠️ 需要开发 |
| 分润结算 | `CommissionContract` | ⚠️ 需要开发 |
| 支付路由 | `PaymentRouter` | ⚠️ 需要开发 |

### 合约 → 后端依赖

| 合约功能 | 需要的后端支持 | 状态 |
|---------|--------------|------|
| 事件监听 | Webhook/事件监听服务 | ⚠️ 需要开发 |
| 状态同步 | 状态同步API | ⚠️ 需要开发 |

---

## 🎯 开发策略建议

### 方案一：前端全部完成后再开发后端和合约 ❌ 不推荐

**优点**:
- 前端需求明确
- 避免返工

**缺点**:
- 开发周期长（前端6-8周 + 后端6-8周 + 合约4-6周 = 16-22周）
- 无法并行开发
- 集成风险高
- 无法及时发现问题

**总时长**: 16-22周

---

### 方案二：同步推进（推荐）✅

#### 阶段一：基础架构（Week 1-2）
- **前端**: 完成基础组件和路由
- **后端**: 数据库设计、基础框架搭建、用户认证
- **合约**: 合约架构设计、基础合约框架

**并行工作**: ✅ 可以并行

---

#### 阶段二：核心功能（Week 3-6）
- **前端**: 支付流程UI、钱包连接UI
- **后端**: 
  - Week 3-4: 钱包服务、支付引擎基础
  - Week 5-6: Stripe集成、X402适配器
- **合约**: 
  - Week 3-4: 支付路由合约
  - Week 5-6: X402适配器合约

**并行工作**: ✅ 可以并行，需要定期同步接口定义

---

#### 阶段三：业务功能（Week 7-10）
- **前端**: 自动支付、分润、产品市场
- **后端**: 
  - Week 7-8: 自动支付服务、产品市场
  - Week 9-10: 分润服务、订单管理
- **合约**: 
  - Week 7-8: 自动支付合约
  - Week 9-10: 分润结算合约

**并行工作**: ✅ 可以并行，需要API Mock支持

---

#### 阶段四：集成测试（Week 11-12）
- **前端**: 与后端API集成
- **后端**: 与合约集成
- **合约**: 主网部署准备
- **全栈**: 端到端测试

**并行工作**: ⚠️ 需要协调

---

#### 阶段五：优化与发布（Week 13-14）
- 性能优化
- 安全审计
- 文档完善
- 发布准备

**总时长**: 13-14周（比方案一节省3-8周）

---

### 方案三：后端优先，合约并行 ⚠️ 备选

**策略**: 先完成后端核心API，前端使用Mock数据，合约并行开发

**优点**:
- 后端API稳定后，前端开发更顺畅
- 合约可以独立开发

**缺点**:
- 前端需要维护Mock数据
- 集成测试延后

**总时长**: 14-16周

---

## 💡 推荐方案：方案二（同步推进）

### 关键成功因素

1. **接口定义先行**
   - Week 1: 定义所有API接口规范（OpenAPI/Swagger）
   - 前端使用Mock数据开发
   - 后端按接口规范实现

2. **定期同步**
   - 每周技术同步会
   - 接口变更及时通知
   - 问题及时解决

3. **Mock数据支持**
   - 前端使用MSW或Mock Service
   - 后端提供Mock API
   - 合约提供测试网版本

4. **分阶段集成**
   - Week 4: 钱包连接集成测试
   - Week 6: 支付流程集成测试
   - Week 8: 自动支付集成测试
   - Week 10: 分润结算集成测试

5. **持续测试**
   - 单元测试
   - 集成测试
   - E2E测试

---

## 📊 工作量对比

| 方案 | 总时长 | 并行度 | 风险 | 推荐度 |
|------|--------|--------|------|--------|
| 方案一：串行 | 16-22周 | 低 | 中 | ⭐⭐ |
| 方案二：同步 | 13-14周 | 高 | 低 | ⭐⭐⭐⭐⭐ |
| 方案三：后端优先 | 14-16周 | 中 | 中 | ⭐⭐⭐ |

---

## 🎯 最终建议

**推荐采用方案二（同步推进）**，原因：

1. ✅ **时间效率**: 节省3-8周开发时间
2. ✅ **风险控制**: 早期发现问题，及时调整
3. ✅ **团队协作**: 充分利用并行开发能力
4. ✅ **质量保证**: 持续集成测试，质量更高

**关键行动项**:
1. Week 1完成所有API接口规范定义
2. 建立Mock数据服务
3. 建立每周技术同步机制
4. 建立持续集成流程

---

## 📝 下一步

1. **确认开发策略**: 选择方案二（同步推进）
2. **制定详细计划**: 按阶段制定周计划
3. **分配资源**: 确定前后端和合约开发人员
4. **建立流程**: 接口规范、Mock服务、同步机制

