# Agentrix Product User Manual

## 1. Overview
Agentrix provides a comprehensive suite of tools for the AI Agent economy, consisting of the **Workbench**, **SmartCheckout**, and the **HQ Console**.

---

## 2. Workbench: Developer Playground
The Workbench is where you build, test, and deploy AI Agents and their "Skills."
- **Skill Creation**: Define tools using JSON Schema or by importing OpenAPI/Swagger docs.
- **Workflow Orchestration**: Chain multiple skills together (e.g., Search -> Compare -> Pay).
- **Debugger**: Monitor real-time logs of Agent-to-Agent communication and X402 protocol handshakes.
- **MCP Preview**: Test how your tool will appear and behave inside ChatGPT or Claude.

## 3. SmartCheckout: The Unified Payment Entry
SmartCheckout is the user-facing widget used to complete transactions.
- **QuickPay**: Enabling "Session Keys" allows for one-click, gasless payments. Set your daily limits (e.g., $50/day) and let your agent pay instantly.
- **Wallet Pay**: Standard Web3 payment using MetaMask, Phantom, or WalletConnect.
- **Fiat Rails**: Pay with your credit card or Google Pay via Stripe/Transak integration. Your fiat is automatically converted to USDC to settle the transaction.

## 4. HQ Console: Merchant & User Dashboard
The central command center for managing your Agentrix identity and assets.
- **Identity Management (AX ID)**: Manage your ERC-8004 account abstraction settings and linked wallets.
- **Merchant Controls**: Track sales, manage product listings, and configure commission rates for the marketplace.
- **Asset Overview**: View your USDC balances, transaction history, and "Earn" statistics.
- **Agent Registry**: View a list of agents you have authorized to spend on your behalf and revoke access at any time.

---

## 5. Typical Workflows

### 5.1 For Developers: Launching an MCP Tool
1.  Open **Workbench**.
2.  Define your API schema.
3.  Deploy the skill to the **Marketplace**.
4.  Copy the MCP URL to your Claude/ChatGPT settings.

### 5.2 For Users: Shopping via AI
1.  Connect your wallet to the **HQ Console**.
2.  Enable **QuickPay** with a small daily limit (e.g., $20).
3.  Go to ChatGPT and say `@Agentrix find me a discounted e-book on AI`.
4.  Click "Buy" in the chat — the payment is processed instantly via QuickPay without any popups.

### 5.3 For Merchants: Selling Services
1.  Register in the **HQ Console**.
2.  Define your service and its X402 payment requirements.
3.  The service automatically appears in the **Agentrix Marketplace**.
4.  Receive payouts in USDC directly to your linked wallet.

---

## 6. Troubleshooting & Support
- **Transaction Failed?** Check your "Session Limit" in HQ Console.
- **Tool not showing in ChatGPT?** Ensure your MCP SSE endpoint is healthy in Workbench.
- **Need help?** Visit our documentation at [docs.agentrix.com](https://docs.agentrix.com).

---
# AGENTRIX_PRODUCT_USER_MANUAL (中文版)

# Agentrix 产品用户手册

## 1. 概述
Agentrix 为 AI Agent 经济提供了一套全方位的工具套件，由 **Workbench**、**SmartCheckout** 和 **HQ Console** 组成。

---

## 2. Workbench：开发者游乐场
Workbench 是您构建、测试和部署 AI Agent 及其“技能 (Skills)”的地方。
- **技能创建**：使用 JSON Schema 或通过导入 OpenAPI/Swagger 文档定义工具。
- **工作流编排**：将多个技能串联起来（例如：搜索 -> 比较 -> 支付）。
- **调试器 (Debugger)**：实时监控“智能体对智能体 (A2A)”通信和 X402 协议握手日志。
- **MCP 预览**：测试您的工具在 ChatGPT 或 Claude 内部的显示和运行情况。

## 3. SmartCheckout：统一支付入口
SmartCheckout 是用于完成交易的面向用户的组件。
- **QuickPay**：启用“会话密钥 (Session Keys)”可实现一键免 Gas 支付。设置您的每日上限（例如：50 美元/天），让您的智能体即时支付。
- **钱包支付 (Wallet Pay)**：使用 MetaMask、Phantom 或 WalletConnect 进行标准 Web3 支付。
- **法币通道 (Fiat Rails)**：通过 Stripe/Transak 集成，使用信用卡或 Google Pay 支付。您的法币将自动转换为 USDC 以结算交易。

## 4. HQ Console：商家与用户控制台
管理您的 Agentrix 身份和资产的中央指挥中心。
- **身份管理 (AX ID)**：管理您的 ERC-8004 账户抽象设置和关联钱包。
- **商家控制**：追踪销售情况、管理产品列表，并为 Marketplace 配置佣金率。
- **资产概览**：查看您的 USDC 余额、交易历史和“收益”统计数据。
- **智能体注册表**：查看您已授权代表您进行支出的智能体列表，并随可时撤销权限。

---

## 5. 典型工作流

### 5.1 开发者：发布 MCP 工具
1.  打开 **Workbench**。
2.  定义您的 API Schema。
3.  将技能部署到 **Marketplace**。
4.  将 MCP URL 复制到您的 Claude/ChatGPT 设置中。

### 5.2 用户：通过 AI 购物
1.  在 **HQ Console** 中连接您的钱包。
2.  启用 **QuickPay** 并设置较小的每日上限（例如：20 美元）。
3.  在 ChatGPT 中输入 `@Agentrix 帮我找一本有折扣的 AI 电子书`。
4.  在聊天中点击“购买” —— 支付将通过 QuickPay 立即处理，无需任何弹窗。

### 5.3 商家：销售服务
1.  在 **HQ Console** 中注册。
2.  定义您的服务及其 X402 支付要求。
3.  服务将自动出现在 **Agentrix Marketplace** 中。
4.  直接在关联钱包中接收 USDC 结算款。

---

## 6. 故障排除与支持
- **交易失败？** 在 HQ Console 中检查您的“会话限制 (Session Limit)”。
- **工具未在 ChatGPT 中显示？** 在 Workbench 中确保您的 MCP SSE 端点运行正常。
- **需要帮助？** 访问我们的文档：[docs.agentrix.com](https://docs.agentrix.com)。
