# Agentrix MCP 多生态集成 - 产品需求文档 (PRD)

**版本**: 1.0.0  
**日期**: 2025-12-27  
**状态**: Draft

---

## 1. 背景与目标

### 1.1 背景

OpenAI 于 2025 年推出的 "Apps in ChatGPT" 基于 MCP (Model Context Protocol) 协议，允许用户在任何对话中通过 `@App名称` 直接调用第三方服务。这比传统的 GPTs Custom Actions 更加强大和便捷：

- **即时调用**: 用户无需离开当前对话，直接 @ 即可调用
- **上下文感知**: AI 可以根据对话上下文智能决定何时调用
- **多 App 协作**: 单次对话可以调用多个 App 协同完成任务

Anthropic (Claude) 作为 MCP 协议的发起者，已在 Claude Desktop 中深度集成 MCP 支持。

### 1.2 目标

**核心目标**: 让 Agentrix 成为主流 AI 生态中的支付和交易基础设施，实现"一次开发，多处调用"。

**具体目标**:

1. **用户可以在 ChatGPT 中 `@Agentrix` 直接完成**:
   - 搜索商品/服务
   - 比价和推荐
   - 创建订单并支付
   - 查询订单状态
   - 管理钱包和授权

2. **用户可以在 Claude 中使用 Agentrix Tools**:
   - 通过 MCP Server 提供完整的交易能力
   - 支持 Agent 授权、空投、自动收益等高级功能

3. **在 Gemini / Grok 等支持 Function Calling 的平台**:
   - 通过 OpenAPI Schema 提供标准化 REST API 访问
   - 支持 Extensions / Custom Tools 配置

4. **接入 Agentrix SDK 的第三方 Agent**:
   - 自动获得 MCP Server 能力
   - 可一键生成自己的 MCP 配置
   - 用户可以在 AI 对话中 @ 第三方 Agent

---

## 2. 用户故事

### 2.1 终端用户 (ChatGPT Plus / Claude Pro 用户)

**用户故事 1: 自然语言购物**
```
作为一个 ChatGPT 用户，
我想要在对话中说 "@Agentrix 帮我找一款蓝牙耳机，200元以内"，
以便 AI 能直接调用 Agentrix 搜索商品并展示结果卡片。
```

**用户故事 2: 一键支付**
```
作为一个 ChatGPT 用户，
当 Agentrix 展示商品后，
我想要点击"购买"按钮完成授权和支付，
而不需要跳转到其他网站。
```

**用户故事 3: Claude 中使用 Agent 功能**
```
作为一个 Claude Desktop 用户，
我想要通过 Agentrix MCP 工具管理我的钱包授权，
发现并领取空投，以及查看自动收益统计。
```

### 2.2 商户/开发者

**用户故事 4: 快速接入 AI 生态**
```
作为一个电商商户，
我想要将我的商品接入到 ChatGPT 和 Claude，
以便 AI 用户可以直接搜索和购买我的商品。
```

**用户故事 5: SDK Agent 获得 MCP 能力**
```
作为一个使用 Agentrix SDK 的开发者，
我想要我开发的 Agent 也能被用户通过 @ 调用，
以便用户可以在任何 AI 对话中使用我的 Agent 服务。
```

---

## 3. 功能范围

### 3.1 P0 - 必须实现 (MVP)

| 功能 | 描述 | 平台支持 |
|------|------|----------|
| MCP Server 核心 | 标准 MCP 协议实现 | ChatGPT, Claude |
| 商品搜索 Tool | 自然语言搜索 Marketplace 商品 | 全平台 |
| 创建支付意图 Tool | 为商品创建支付链接 | 全平台 |
| 查看订单 Tool | 查询订单状态和历史 | 全平台 |
| OAuth 2.0 认证 | 用户授权流程 | ChatGPT |
| 结构化数据渲染 | 商品卡片、支付按钮 | ChatGPT |

### 3.2 P1 - 高优先级

| 功能 | 描述 | 平台支持 |
|------|------|----------|
| 钱包授权管理 | ERC8004/MPC 钱包授权 | Claude, SDK Agent |
| 空投发现与领取 | 扫描和领取空投 | Claude, SDK Agent |
| 自动收益统计 | 收益看板和策略管理 | Claude, SDK Agent |
| Gemini Extensions | Function Calling 集成 | Gemini |
| Grok Tools | API Tools 配置 | Grok |

### 3.3 P2 - 中优先级

| 功能 | 描述 | 平台支持 |
|------|------|----------|
| SDK Agent MCP 能力 | 第三方 Agent 获得 MCP | SDK Agent |
| 比价服务 | 跨商户比价 | 全平台 |
| 推荐系统 | 智能商品推荐 | 全平台 |
| 订阅管理 | 订阅和续费 | 全平台 |

---

## 4. 平台支持矩阵

| 平台 | 协议支持 | 集成方式 | 实现优先级 |
|------|----------|----------|------------|
| **ChatGPT** | MCP (原生) | Apps in ChatGPT | P0 |
| **Claude** | MCP (原生) | Claude Desktop + MCP Server | P0 |
| **Gemini** | OpenAPI + Function Calling | Extensions / Tools | P1 |
| **Grok** | OpenAPI | API Tools | P1 |
| **SDK Agent** | MCP + REST | SDK 内置 MCP Server | P1 |

---

## 5. MCP Tools 定义

### 5.1 核心交易 Tools

```yaml
search_products:
  description: 搜索 Agentrix Marketplace 商品
  parameters:
    query: string (required) - 搜索关键词
    assetType: enum [physical, service, nft, ft, game_asset, rwa]
    priceMin: number
    priceMax: number
    limit: integer (default: 10)
  returns: Array<Product>

create_pay_intent:
  description: 为商品创建支付意图，返回支付链接
  parameters:
    productId: string (required)
    quantity: integer (default: 1)
    walletAddress: string (for crypto payment)
    chain: string (blockchain)
  returns: PaymentIntent with paymentUrl

get_order:
  description: 查询订单详情
  parameters:
    orderId: string (required)
  returns: Order

list_orders:
  description: 列出用户订单
  parameters:
    status: enum [pending, paid, shipped, completed, cancelled]
    limit: integer
  returns: Array<Order>
```

### 5.2 Agent 高级 Tools (P1)

```yaml
agent_authorize:
  description: 创建 Agent 支付授权
  parameters:
    agentId: string (required)
    limit: { singleLimit: number, dailyLimit: number }
    allowedStrategies: Array<string>
  returns: Authorization

airdrop_discover:
  description: 发现可领取的空投
  parameters:
    chains: Array<string>
    minValue: number
  returns: Array<Airdrop>

autoearn_stats:
  description: 获取自动收益统计
  returns: EarningsStats

wallet_balance:
  description: 查询 MPC 钱包余额
  parameters:
    walletId: string (required)
  returns: Array<TokenBalance>
```

---

## 6. 用户交互流程

### 6.1 ChatGPT 购物流程

```
用户: @Agentrix 我想买一个机械键盘
     ↓
ChatGPT: 调用 search_products({query: "机械键盘"})
     ↓
Agentrix: 返回商品列表 (结构化数据)
     ↓
ChatGPT: 渲染商品卡片，包含图片、价格、购买按钮
     ↓
用户: 点击"购买"第一个
     ↓
ChatGPT: 调用 create_pay_intent({productId: "xxx"})
     ↓
Agentrix: 返回 PaymentIntent with paymentUrl
     ↓
ChatGPT: 显示支付按钮/二维码
     ↓
用户: 点击支付，完成 OAuth 授权（首次）
     ↓
用户: 确认支付
     ↓
Agentrix: 执行支付，返回订单确认
```

### 6.2 Claude 钱包管理流程

```
用户: 帮我查看当前的 Agent 授权情况

Claude: (调用 Agentrix MCP tool: agent_list_authorizations)

Agentrix MCP: 返回授权列表 JSON

Claude: 您当前有 2 个活跃的 Agent 授权：
        1. Trading Bot - 每日限额 1000 USDT
        2. Airdrop Hunter - 每日限额 100 USDT
        
用户: 撤销 Airdrop Hunter 的授权

Claude: (调用 agent_revoke_authorization)

Agentrix MCP: 授权已撤销

Claude: 已成功撤销 Airdrop Hunter 的授权
```

---

## 7. 认证与安全

### 7.1 OAuth 2.0 流程 (ChatGPT)

```
1. 用户首次使用 @Agentrix
   ↓
2. ChatGPT 发起 OAuth 请求到 Agentrix
   ↓
3. 用户被重定向到 Agentrix 登录/授权页面
   ↓
4. 用户完成登录并授权
   ↓
5. Agentrix 返回 Access Token 给 ChatGPT
   ↓
6. 后续请求携带 Token，无需重复授权
```

### 7.2 安全措施

| 安全点 | 实现方式 |
|--------|----------|
| Token 安全 | JWT + 短期有效期 + Refresh Token |
| 权限隔离 | Scope 控制 (read, write, payment) |
| 支付二次确认 | 敏感操作需用户确认 |
| 限额控制 | 单笔/每日限额 |
| 审计日志 | 全链路操作记录 |

---

## 8. 成功指标

### 8.1 核心指标

| 指标 | 定义 | 目标 (6个月) |
|------|------|-------------|
| MAU | 月活跃 MCP 用户数 | 10,000+ |
| 交易量 | 通过 MCP 完成的交易额 | $100,000+ |
| 转化率 | 搜索到支付的转化率 | >5% |
| 留存率 | 7日留存 | >30% |

### 8.2 技术指标

| 指标 | 定义 | 目标 |
|------|------|------|
| 响应时间 | Tool 调用 P95 延迟 | <500ms |
| 可用性 | 服务可用率 | >99.9% |
| 错误率 | Tool 调用错误率 | <0.1% |

---

## 9. 时间线

| 阶段 | 内容 | 时间 |
|------|------|------|
| Phase 1 | MCP Server MVP + ChatGPT 集成 | 2周 |
| Phase 2 | Claude MCP + OAuth 完整流程 | 2周 |
| Phase 3 | Gemini/Grok + SDK Agent MCP | 2周 |
| Phase 4 | 优化和扩展 | 持续 |

---

## 10. 附录

### 10.1 相关文档

- [ChatGPT-GPTs配置指南.md](./ChatGPT-GPTs配置指南.md)
- [Agent-SDK-AI-Ecosystem-Integration-Guide.md](./Agent-SDK-AI-Ecosystem-Integration-Guide.md)
- [Gemini-3使用指南.md](./Gemini-3使用指南.md)

### 10.2 技术参考

- [MCP Protocol Specification](https://modelcontextprotocol.io/docs)
- [OpenAI Apps in ChatGPT](https://platform.openai.com/docs/apps)
- [Claude MCP Integration](https://docs.anthropic.com/en/docs/mcp)
