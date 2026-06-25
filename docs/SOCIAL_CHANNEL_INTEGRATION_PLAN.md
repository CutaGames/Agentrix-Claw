# Agentrix Social Channel Integration Plan

Generated: 2026-03-16
Owner: GitHub Copilot audit follow-up

Chinese version: docs/SOCIAL_CHANNEL_INTEGRATION_PLAN.zh-CN.md

User guide: docs/SOCIAL_PRODUCT_USER_GUIDE.zh-CN.md


## 1. Goal

Build a unified social messaging layer so a customer can connect one or more channels to an Agentrix agent, receive inbound messages, apply approval or auto-reply policy, and answer users consistently across mobile, web, desktop, and OpenClaw instances.

This document covers:

- Which channels we should support
- How the integration should work end-to-end
- What the customer must provide
- What Agentrix still needs to build
- How to provide the best possible user experience
- Whether desktop should be part of the solution

## 2. Current State Summary

Current repo status is split into two different architectures:

### A. Social Listener / Social Bridge

Purpose:

- Ingest Telegram, Discord, Twitter/X callbacks
- Persist events
- Show connection status, approval queue, and reply strategy in the mobile app

Current status:

- Inbound callback endpoints exist for Telegram, Discord, Twitter/X
- Event persistence exists
- Reply strategy configuration exists
- Mobile Social Listener screen exists
- Outbound agent reply orchestration is not complete yet

Result:

- This path is good as an admin console foundation
- It is not yet a complete conversational bridge for customers

### B. Telegram Bot Direct Chat via OpenClaw binding

Purpose:

- Bind a Telegram chat directly to an OpenClaw instance by relay token
- Forward messages to local, platform-hosted, or external agent runtime
- Send replies back to Telegram

Current status:

- Telegram deep-link binding exists
- Message forwarding exists
- Voice note transcription exists
- Reply send-back exists

Result:

- This is closer to a usable customer-facing conversation bridge
- But it is Telegram-only and not unified with the Social Listener data model yet

## 3. Recommended Product Direction

Do not keep two separate social architectures long-term.

Recommended unified architecture:

1. Channel Connector Layer
2. Identity and account binding layer
3. Event ingestion and normalization layer
4. Routing layer to selected agent or workspace
5. Policy engine for auto-reply, approval, escalation, quiet hours, and human handoff
6. Outbound delivery layer
7. Audit, analytics, and conversation history layer
8. Unified operator console on mobile, web, and desktop

Principle:

- Every channel should look different externally but identical internally.
- Internally, everything should become a normalized Conversation Event plus Delivery Action.

## 4. Priority Channel Matrix

### Tier 1: Must support first

#### Telegram

Use cases:

- Founder or creator bot
- Community DM
- Command bot
- International support

Integration mode:

- Bot token + webhook
- Optional deep-link binding to specific agent or workspace

Current repo status:

- Partially implemented

#### Discord

Use cases:

- Community server operations
- Support channels
- Role-based automation
- Slash commands

Integration mode:

- Application plus bot plus interaction endpoint
- Optional channel-scoped routing

Current repo status:

- Callback and setup guidance exist
- Full production conversation loop still incomplete

#### Twitter/X

Use cases:

- Brand mentions
- DM triage
- Campaign response

Integration mode:

- App credentials plus activity API or supported webhook mechanism
- Mention and DM routing

Current repo status:

- Callback structure exists
- Full production-grade outbound engagement is not complete

### Tier 2: High-value international

#### WhatsApp Business

Why important:

- Global business support and commerce
- Higher customer expectation than Telegram in many markets

Recommended integration mode:

- WhatsApp Business Cloud API

#### Slack

Why important:

- B2B workflow and internal automation
- Approval and escalation flows are natural here

Recommended integration mode:

- Slack app plus bot token plus event subscriptions plus slash commands

### Tier 3: China enterprise channels

#### Feishu

Why important:

- Best enterprise collaboration fit in China for agent workflows

Recommended integration mode:

- Feishu bot plus event subscriptions plus app authorization

#### WeCom

Why important:

- Best customer service and enterprise messaging bridge for China

Recommended integration mode:

- Enterprise WeChat app plus callback URL plus corp credentials

#### DingTalk

Why important:

- Enterprise process and approval stronghold

Recommended integration mode:

- DingTalk bot plus event callback plus app auth

#### QQ

Why important:

- Consumer reach exists, but business API maturity is much weaker

Recommendation:

- Do not prioritize before Feishu and WeCom

## 5. Standardized Integration Flow

Every platform should follow the same product flow.

### Step 1. Choose channel

Customer picks:

- Telegram
- Discord
- Twitter/X
- WhatsApp
- Slack
- Feishu
- WeCom
- DingTalk

### Step 2. Choose connection mode

Connection modes:

- Official bot/app owned by customer
- Agentrix-hosted shared bot for quick start
- Agentrix-managed dedicated bot for paid customers

Recommendation:

- Offer quick start with Agentrix-hosted shared bot
- Offer dedicated bot/app for production customers

### Step 3. Bind to workspace or agent

Customer chooses routing target:

- One OpenClaw instance
- One Agent account
- One team workspace
- One support queue

### Step 4. Configure routing rules

Customer configures:

- DM only or channel plus DM
- Mention only or all messages
- Language routing
- Department routing
- VIP routing
- Human escalation rules

### Step 5. Configure reply policy

Reply modes:

- Auto reply
- Draft then human approval
- Notify only
- Human only

### Step 6. Test loop

Test checklist:

- Send inbound test message
- Verify event ingestion
- Verify agent draft
- Verify outbound delivery
- Verify transcript logging
- Verify media and attachment handling

### Step 7. Go live

Go live checklist:

- Health status green
- Callback signature verified
- Rate limit guard enabled
- Moderation and prompt guard enabled
- Human takeover fallback enabled

## 6. What The Customer Must Provide

This should be surfaced as a platform-specific checklist in UI.

### Universal inputs

- Channel type
- Agent or workspace binding target
- Display name
- Business description or use case
- Reply policy
- Languages
- Escalation contacts

### Telegram

Customer must provide:

- Bot token from BotFather
- Optional bot username confirmation
- Whether to use webhook or polling

Agentrix must provide:

- Webhook URL
- Test button
- Bot deep-link for bind flow

### Discord

Customer must provide:

- Application ID
- Bot token
- Public key
- Server installation intent
- Required permissions

Agentrix must provide:

- Interactions endpoint URL
- OAuth invite URL generator
- Slash command registration helper

### Twitter/X

Customer must provide:

- App credentials
- Access token if required
- App environment setup

Agentrix must provide:

- Webhook URL
- CRC validation support
- Mention and DM scope explanation

### WhatsApp Business

Customer must provide:

- Meta app credentials
- Phone number ID
- Business account ID
- Access token
- Approved template names if outbound proactive messaging is needed

Agentrix must provide:

- Webhook URL
- Verification token
- Template mapping UI

### Slack

Customer must provide:

- Bot token
- Signing secret
- Workspace installation

Agentrix must provide:

- Events request URL
- Slash command URL
- OAuth redirect URL

### Feishu / WeCom / DingTalk

Customer must provide:

- Enterprise app credentials
- Tenant or corp identifiers
- Callback verification secrets
- Required scopes

Agentrix must provide:

- Callback URL
- Verification handshake support
- Admin guide with screenshots

## 7. Best UX Recommendation

### 7.1 Quick Start Mode

For first-time customers, the best experience is not asking for ten credentials.

Provide:

- One-click quick start using Agentrix-hosted connector
- Guided test message flow
- Live event monitor
- Suggested default reply strategy: approval mode

### 7.2 Production Mode

After validation, upgrade them to:

- Dedicated connector
- Dedicated bot/app identity
- Multi-agent routing
- SLA and escalation rules
- Audit logs and compliance export

### 7.3 Unified Operator Inbox

Best experience requires one inbox, not one screen per channel.

Operator inbox should show:

- Channel icon
- Customer name
- Conversation state
- Assigned agent
- Confidence score
- Approval required badge
- Human takeover button
- Retry delivery button

### 7.4 Approval Center

Approval should be unified across all platforms.

Approval actions:

- Approve and send
- Edit then send
- Reject
- Switch to human
- Change policy for this contact

### 7.5 Agent Memory and CRM Context

To improve customer experience:

- Persist contact identity across channels where allowed
- Store last conversation summary
- Attach CRM tags
- Remember language and tone preference
- Remember unresolved issue state

## 8. Should Desktop Be Part Of The Solution?

Yes, but desktop should be the operator console, not the required runtime.

### Desktop should be used for

- Real-time social inbox management
- Approval queue handling
- Multi-conversation triage
- Rich media preview
- File upload and download handling
- Internal notes and agent handoff
- Screen-sharing or desktop task execution in support workflows

### Desktop should not be required for

- Core webhook ingestion
- Message delivery
- Bot uptime
- Production routing engine

### Recommended role split

- Backend: source of truth for channels, events, policies, delivery, audit
- Mobile: lightweight management, quick approvals, status monitoring
- Desktop: power operator console for high-volume teams

## 9. Required Backend Architecture

To reach production quality, Agentrix still needs the following.

### 9.1 Channel connector abstraction

Create a connector interface like:

- validateConfig
- registerWebhook
- parseInboundEvent
- sendMessage
- sendRichMessage
- verifySignature
- fetchChannelMetadata

### 9.2 Normalized event schema

Every inbound event should normalize to:

- tenantId
- channelType
- channelAccountId
- conversationId
- externalMessageId
- senderId
- senderName
- messageType
- text
- attachments
- metadata
- receivedAt

### 9.3 Delivery log

Need a delivery table for:

- outboundMessageId
- targetChannel
- payload
- status
- provider response
- retryCount
- deliveredAt
- failedAt

### 9.4 Policy engine

Need rule evaluation for:

- business hours
- auto reply confidence threshold
- moderation blocks
- human escalation
- keyword routing
- VIP handling

### 9.5 Conversation store

Need persistent conversation history, not just event snapshots.

### 9.6 Media pipeline

Need unified handling for:

- image upload and transform
- file attachments
- voice transcription
- TTS or voice reply when supported

### 9.7 Observability

Need dashboards for:

- webhook health
- delivery success rate
- median response latency
- approval queue backlog
- per-channel error breakdown

## 10. Required Frontend Work

### Mobile

Need:

- unified social inbox
- approval queue
- channel connector wizard
- routing policy editor
- health dashboard

### Web

Need:

- admin setup console
- customer onboarding forms
- channel diagnostics
- analytics

### Desktop

Need:

- multi-pane inbox
- keyboard-first triage
- approval editor
- attachment preview
- live monitor and retry tools

## 11. Current Gaps In This Repo

Based on current audit:

### Gap 1. Social Listener is not yet a full reply bridge

The callback controller currently persists events and explicitly leaves them pending for mobile approval visibility. The full draft generation plus outbound delivery loop is not completed yet.

### Gap 2. Telegram has two parallel product paths

One path is Social Listener webhook ingestion.

Another path is TelegramBotService direct chat binding to OpenClaw instances.

This creates product confusion and duplicated routing logic.

### Gap 3. Discord and Twitter are not production-complete

Connection status and callback shells exist, but a complete conversation delivery workflow is still missing.

### Gap 4. No unified inbox yet

The current UI provides status pages and event views, but not a real multi-channel operational inbox.

### Gap 5. Social wall and social listener are conceptually mixed

Showcase is public content and growth.

Listener is private customer communication.

They should share some primitives, but not be treated as the same product.

## 12. Recommended Delivery Phases

### Phase 1. Fix and unify current foundations

- Keep Telegram direct chat path working
- Finish Social Listener outbound reply loop
- Add delivery log table
- Add unified connector interface
- Separate public showcase data model from private support conversation model

### Phase 2. Productionize first three channels

- Telegram
- Discord
- Twitter/X

Deliver:

- connector setup wizard
- approval center
- conversation history
- analytics and retries

### Phase 3. Expand to business channels

- WhatsApp Business
- Slack
- Feishu
- WeCom
- DingTalk

### Phase 4. Launch desktop operator console

- unified inbox
- keyboard shortcuts
- bulk actions
- team collaboration

## 13. Final Recommendation

The strongest commercial path is:

1. Use Telegram as the fully working reference implementation.
2. Merge Social Listener and Telegram direct chat into one connector architecture.
3. Build a unified conversation inbox plus approval center.
4. Add WhatsApp, Slack, Feishu, and WeCom next, because those create the most business value.
5. Make desktop the premium operator experience, while backend remains the always-on runtime.

If Agentrix wants the best customer experience, the customer should feel:

- setup is guided
- test is immediate
- failures are diagnosable
- approval is simple
- switching channels does not change workflow
- desktop helps power users but is never required for uptime