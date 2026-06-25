# Agentrix 核心知识库 (HQ Agents Knowledge Base)

## 1. 项目核心定位
Agentrix 是一个去中心化的 AI Agent 商务平台。通过 UCP (Unified Commerce Protocol) 和 X402 (Payment Protocol) 协议，打破 AI 之间的支付与信任壁垒，实现“Agent to Agent”以及“Agent to Merchant”的自动商业化。

## 2. 核心协议体系
- **UCP (统一商业协议)**: 规范了商品、购物车、订单在不同 Agent 间的传输格式。
- **X402 (支付协议)**: 专为 AI 设计的异步支付流，支持多链结算（EVM, Solana）和账户权限委托。
- **MCP (模型上下文协议)**: 作为 Agent 的“感官”，连接外部工具（搜索、数据库、文件流）。

## 3. 核心账户体系 (V2)
- **AgentAccount**: 每个 Agent 都有独立的 ID、余额、支出限额和信用评分。
- **Wallet**: 支持托管钱包和虚拟账户，便于 Agent 自动执行交易。
- **Workspace**: 团队作战的基础单元，如 "Global HQ"。

## 4. 商业模式 (一人公司)
CEO (用户) 指挥 4 名核心 Agent：
- **Architect**: 守望底层协议和安全。
- **Coder**: 负责具体业务逻辑和 UI 开发。
- **Growth**: 负责社交媒体传播、开发者社区 (DevRel) 和流量增长。
- **BD**: 负责寻找外部 API 合作伙伴、商户入驻和代币生态集成。

## 5. 当前开发重点
- 完善 V2 账户体系的 KYC 与合规性。
- 增强 MCP 工具集的深度，使其能抓取 Twitter/Discord 动态。
- 降低商户入驻门槛，实现 1 分钟一键开店。
