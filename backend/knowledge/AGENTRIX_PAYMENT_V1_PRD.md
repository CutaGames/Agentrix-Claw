# Agentrix 支付 V1.0 产品需求文档 (PRD)

## 1. 背景与问题定义
Agent 时代的交易入口正在分化为两类：
- **传统入口 (Human Checkout)**：用户在网页/APP/门店完成支付。
- **Agent 入口 (Agent Checkout)**：用户表达意图，Agent 在授权范围内代表用户完成交易。

目前市场上大多数支付工具强于传统入口，但缺乏对 Agent 支付的标准化支持。Agentrix (AX) 支付的产品策略是：底层做成通用支付底座，上层通过 Agent 编排增强层形成差异化。

## 2. 产品定位与价值主张
AX 支付是面向传统商户与 AI/Agent 应用的一体化支付与交易基础设施。既可作为通用支付工具在网站/电商/线下使用，也可一键升级为 Agent 代付与自动化交易。

## 3. 核心架构
### Layer A: Core Payments (通用支付底座)
- **标准对象模型**：Order / PaymentIntent / Charge / Refund / Payout / Webhook
- **接入形态**：Hosted Checkout / Embedded Widget / Payment Links / QR / API-only
- **目标**：覆盖传统场景、保证成功率/对账/结算体验。

### Layer B: Agent Orchestration (Agent 编排增强层)
- **AX ID**：用户身份与授权载体。
- **Delegated Authorization**：授权与限额策略。
- **Intent-to-Pay**：意图支付与自动执行。
- **Agent Registry**：Agent 身份/风险分层/密钥。
- **Attribution & RevShare**：归因与分润。
- **Audit Proof**：可追溯审计证据链。

## 4. 核心功能清单
### 4.1 Layer A: Core Payments
- **接入形态**：
  - Hosted Checkout (托管收银台)
  - Payment Links (支付链接)
  - API-only (后端集成)
  - QR 收款 (线下门店)
- **平台能力**：
  - 商户入驻 (Merchant Onboarding)
  - API Keys (Sandbox/Production)
  - Webhooks (签名/重试/幂等)
  - 商户后台 (Console)：订单/交易/对账导出

### 4.2 Layer B: Agent Orchestration
- **AX ID**：用户身份与授权承载。
- **Authorization**：创建/撤销/查询/策略评估。
- **Agent Registry**：Agent 注册与风险分层。
- **Agent Execute**：授权范围内直接支付，超限降级为用户确认。
- **审计与归因**：全链路追溯与分润。

## 5. 核心对象模型
### 5.1 PaymentIntent 状态机
- `requires_payment_method`
- `processing`
- `succeeded`
- `failed`
- `canceled`
- `expired`

### 5.2 Order 状态机
- `created`
- `paid`
- `fulfilled`
- `canceled`
- `refunded`

## 6. 验收标准
- **传统路径**：商户 15 分钟内跑通首笔交易；Webhook P95 ≤ 3s。
- **Agent 路径**：Agent 可在授权内直接支付；超限必须跳转用户确认；每笔交易具备 Audit Proof。
