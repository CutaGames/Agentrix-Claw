# Agentrix 移动端上线方案 — 邀请制内测 (200→1000)

> 生成日期: 2026-03-05 | 最后更新: 2026-03-05  
> 服务器: 18.139.157.116 (新加坡 ap-southeast-1)  
> 域名: agentrix.top / api.agentrix.top  
> LLM: AWS Bedrock (Bearer Token Auth) — 默认模型 Claude Haiku 4.5  
> Token配额: 1,000,000 tokens/用户/月 (Free Trial)

---

## 一、当前项目全景

### 1.1 架构总览

```
                   ┌───────────────────┐
                   │  Mobile (Expo 54) │
                   │  React Native 0.81│
                   └──────┬────────────┘
                          │ HTTPS
┌────────────────┐        │        ┌──────────────────────────┐
│ Web Frontend   │        │        │   新加坡 EC2              │
│ Next.js 13.5   ├────────┼───────►│  Nginx → Backend :3001   │
│ (agentrix.top) │        │        │  NestJS 10 / PostgreSQL  │
└────────────────┘        │        │  Docker Compose           │
                          ▼        │                          │
                  api.agentrix.top │  ┌─────────────────────┐ │
                                   │  │ Cloud OpenClaw       │ │
                                   │  │ Docker容器(每用户1个) │ │
                                   │  └─────────────────────┘ │
                                   └──────────────────────────┘
```

### 1.2 三端现状

| 组件 | 技术栈 | 状态 | 代码仓库 |
|------|--------|------|----------|
| **移动端** | Expo SDK 54 + RN 0.81 + Zustand 5 | 功能完整，未公开发布 | github.com/CutaGames/Agentrix-Clawlink |
| **Web前端** | Next.js 13.5 + Tailwind + ethers | 已上线 agentrix.top | github.com/CutaGames/Agentrix |
| **后端** | NestJS 10 + TypeORM + PostgreSQL | 已上线 api.agentrix.top | 同上 |

### 1.3 移动端功能完备度

| 模块 | 功能 | 完成度 | 上线阻塞? |
|------|------|--------|-----------|
| **认证** | Google/Apple/Twitter/Discord/Telegram/Wallet/Email | ✅ 8种登录 | 否 |
| **Onboarding** | 部署选择→云端/本地/连接已有 | ✅ 完整 | 否 |
| **Agent Console** | 聊天/流式/语音/日志/记忆/工作流 | ✅ 完整 | 否 |
| **Marketplace** | Skill市场/任务市场/购买/详情 | ✅ 完整 | 否 |
| **Social** | Feed/帖子/DM/群聊 | ✅ 基础完成 | 否 |
| **Profile** | 设置/账号/钱包/通知/分享卡片 | ✅ 完整 | 否 |
| **推广系统** | 推荐链接/佣金/分成 | ✅ 完整（含mock fallback） | 否 |
| **⚠️ 邀请码注册** | 注册时输入邀请码 | ❌ 未实现 | **是** |
| **⚠️ 实例限制** | 每用户1云端+1本地 | ❌ 无限制 | **是** |
| **⚠️ 用量控制** | Token配额UI显示 | ✅ 后端1M配额已配置 | 否 |
| **✅ 模型切换** | 傻瓜式模型切换 | ✅ 已实现(4个可用模型) | 否 |
| **⚠️ 推送通知** | Push Notification | 🟡 Polling模式，需完善 | 中等 |

---

## 二、与上线200用户的差距分析 (Gap Analysis)

### 2.1 🔴 关键阻塞项 (P0 — 必须完成)

#### Gap 1: 邀请码注册门控系统
- **现状**: 注册流程直接进入OAuth/钱包登录，无邀请码验证环节
- **需要**: 类似KimiClaw的邀请码制度，用户注册时必须输入有效邀请码
- **后端**: 需新建 `invitation-code` 模块 (生成/验证/统计)
- **前端**: LoginScreen 增加邀请码输入步骤
- **参考**: KimiClaw用邀请码+排队机制，CoPaw用邀请链接+限额

#### Gap 2: 云端OpenClaw资源隔离与限制
- **现状**: `provisionCloudInstance()` 在新加坡服务器上docker run，无CPU/内存限制
- **需要**: 
  - 单EC2实例(t3.xlarge 4vCPU/16GB)最多承载约20-30个容器
  - 200用户同时在线需要水平扩展或限制并发
- **方案**: 分时复用 + 容器资源限制 + idle自动休眠

#### Gap 3: 每用户实例数量限制
- **现状**: 用户可无限创建云端和本地实例
- **需要**: 邀请码用户限制1个免费云端实例 + 1个本地实例
- **方案**: 在 `provisionCloudInstance` 和 `provisionLocalInstance` 中增加计数检查

#### ~~Gap 3 (已完成): AWS Bedrock 凭证配置~~
- ✅ 已配置 Bearer Token Auth (`AWS_BEARER_TOKEN_BEDROCK`)
- ✅ 默认模型: `anthropic.claude-haiku-4-5-20251001-v1:0`
- ✅ Token配额: 1M/用户/月 (可通过 `FREE_TRIAL_TOKEN_LIMIT` 环境变量调整)

#### Gap 4: Apple OAuth 配置
- **现状**: `APPLE_TEAM_ID=YOUR_TEAM_ID` 是占位符
- **需要**: 完成Apple Developer配置 (iOS发布必需)

#### Gap 5: BSC主网切换
- **现状**: Chain ID 97 (BSC Testnet)
- **需要**: 内测阶段可以先不切，但需明确标注测试网

### 2.2 🟡 重要优化项 (P1 — 上线前应完成)

| # | 项目 | 现状 | 需要做 |
|---|------|------|--------|
| 6 | **Rate Limiting增强** | 内存Map，进程重启丢失 | 改用Redis，per-user精细控制 |
| 7 | **Token配额前端集成** | ✅ TokenEnergyBar已集成 | 已完成 |
| 8 | **Mock数据移除** | referral/identity API失败时返回mock | 生产环境应显示真实错误 |
| 9 | **密钥安全** | .env.prod含私钥在源码中 | 迁移到AWS Secrets Manager或.gitignore |
| 10 | **部署标准化** | PM2和Docker共存 | 统一为Docker Compose |
| 11 | **WebSocket URL硬编码** | `streamAgentChat()` 硬编码 `wss://api.agentrix.top` | 使用 `WS_BASE` 配置 |
| 12 | **推送通知** | Polling模式 | 接入Expo Push Notifications |
| 13 | **EAS Build配置** | iOS production无provisioning配置 | 完成App Store Connect配置 |

### 2.3 🟢 上线后可迭代项 (P2)

- 移除15+遗留重复screens（减少bundle体积）
- 生物认证守卫（app resume时验证）
- 离线模式（缓存最近消息）
- AI模型选择与chat请求联动
- Settings URL配置清理（settingsStore中无效的apiBaseUrl）

---

## 三、关于本地部署方案的资源影响确认

### 3.1 本地部署（local-agent）方案分析

**结论：本地部署方案也使用你们的API，但程度不同。**

| 部署类型 | LLM 调用 | 后端API调用 | 资源消耗 |
|----------|---------|-------------|----------|
| **Cloud** (云端) | 平台API Key → LLM Router → Bedrock/DeepSeek | 全部经过 api.agentrix.top | **最高** — LLM费用+服务器Docker容器 |
| **Local** (本地桌面) | 用户本地OpenClaw → **平台LLM Gateway** | 仅注册/认证/社交/Marketplace | **中等** — 仍消耗LLM Token配额 |
| **Self-hosted** (自托管) | 用户自行配置API Key | 仅注册/认证 | **最低** |

**关键发现**: 
- [openclaw-connection.service.ts](backend/src/modules/openclaw-connection/openclaw-connection.service.ts#L126) 第126行：云端部署时，平台将自己的 API Key 注入到Docker容器中 (`PLATFORM_DEEPSEEK_API_KEY` 等)
- [llm-router.service.ts](backend/src/modules/llm-router/llm-router.service.ts) 的 LLM Gateway 架构：所有OpenClaw实例通过 `/api/llm/v1/chat/completions` 网关路由，平台统一承担LLM开销
- 本地部署的用户，其本地OpenClaw仍然连接平台的LLM Gateway（通过relay），**依然消耗平台Token配额**
- `FREE_TRIAL_TOKENS = 1,000,000` tokens/月/用户 (可通过环境变量 `FREE_TRIAL_TOKEN_LIMIT` 调整)
- **实例限制**: 每个邀请码用户最多1个云端实例 + 1个本地实例（免费tier）

### 3.2 200用户月度LLM成本估算

使用 `LlmRouterService.estimateMonthlyCost()` 的逻辑：

| 假设 | 值 |
|------|-----|
| Free Trial配额 | 1M tokens/用户/月 |
| 活跃率 | 60% (120个活跃用户) |
| 平均消耗 | 0.6M tokens/月/活跃用户 |
| 任务分布 | 55% Light + 30% Medium + 15% Heavy |
| Input/Output比 | 60% / 40% |

**每用户月成本 (0.6M tokens, 默认Claude Haiku 4.5):**

| 模型 | Input (60%) | Output (40%) | 小计 |
|------|-------------|--------------|------|
| Claude Haiku 4.5 (默认) | 360K × $0.80/M = $0.29 | 240K × $4.00/M = $0.96 | **$1.25** |
| DeepSeek V3 (可选) | 360K × $0.27/M = $0.10 | 240K × $1.10/M = $0.26 | **$0.36** |
| Gemini 2.0 Flash (可选) | 360K × $0.075/M = $0.03 | 240K × $0.30/M = $0.07 | **$0.10** |

**200用户月度总成本 (假设80%用默认Haiku):**
- 120活跃用户 × 96 Haiku + 24 其他 ≈ 96×$1.25 + 24×$0.20 = **~$125/月 LLM费用**
- EC2 t3.xlarge (新加坡) ≈ **$120/月**
- **保守总预算: $300-400/月 (200用户)**

---

## 四、邀请码上线方案

### 4.1 邀请码系统设计（参考KimiClaw/MaxClaw/CoPaw）

```
┌─────────────────────────────────────────────┐
│            Invitation Code System            │
├─────────────────────────────────────────────┤
│                                             │
│  Admin 后台                                  │
│  ├── 批量生成邀请码 (batch generate)          │
│  ├── 设置批次 (batch_1: 200码, batch_2: 1000) │
│  ├── 绑定渠道来源 (twitter/discord/friend)   │
│  └── 查看使用统计                             │
│                                             │
│  用户流程                                    │
│  ├── 打开App → 显示邀请码输入页（新增）        │
│  ├── 输入有效邀请码 → 进入登录/注册            │
│  ├── 邀请码与用户绑定（一码一用）              │
│  └── 注册成功 → 自动获得 Free Trial 配额       │
│                                             │
│  KimiClaw参考                                │
│  ├── 邀请码6-8位字母数字                      │
│  ├── 支持批量导出CSV                          │
│  ├── 带过期时间                               │
│  └── 可追踪来源(推广/社交/官方)               │
│                                             │
│  CoPaw参考                                   │
│  ├── 邀请链接而非码（deep link）              │
│  ├── 自动填充邀请码                           │
│  └── 分享者可见邀请状态                       │
│                                             │
└─────────────────────────────────────────────┘
```

### 4.2 数据库Schema

```sql
-- 邀请码表
CREATE TABLE invitation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(12) UNIQUE NOT NULL,          -- 如 'AX-A3F7K9'
  batch VARCHAR(50) NOT NULL,                -- 'batch_1_200', 'batch_2_1000'
  status VARCHAR(20) DEFAULT 'available',    -- available/used/expired/disabled
  max_uses INT DEFAULT 1,                    -- 通常1，团队码可多次
  used_count INT DEFAULT 0,
  used_by_user_id UUID REFERENCES users(id),
  used_at TIMESTAMP,
  channel VARCHAR(50),                       -- twitter/discord/kol/friend/official
  expires_at TIMESTAMP,                      -- 过期时间
  created_by VARCHAR(50) DEFAULT 'system',
  metadata JSONB,                            -- 额外信息
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_invitation_code ON invitation_codes(code);
CREATE INDEX idx_invitation_batch ON invitation_codes(batch);
CREATE INDEX idx_invitation_status ON invitation_codes(status);
```

### 4.3 后端实现要点

**新建 `backend/src/modules/invitation/`:**

```
invitation/
├── invitation.module.ts
├── invitation.controller.ts      # POST /validate, POST /redeem, GET /admin/list
├── invitation.service.ts         # 生成/验证/兑换/统计
├── invitation.entity.ts          # TypeORM entity
├── dto/
│   ├── validate-code.dto.ts      # { code: string }
│   └── generate-codes.dto.ts     # { batch, count, channel, expiresAt }
└── invitation.guard.ts           # 注册拦截Guard
```

**关键API:**

| 端点 | 方法 | 说明 | 鉴权 |
|------|------|------|------|
| `/api/invitation/validate` | POST | 验证邀请码有效性(不消耗) | 无 |
| `/api/invitation/redeem` | POST | 兑换邀请码(绑定用户) | JWT |
| `/api/admin/invitation/generate` | POST | 批量生成邀请码 | Admin |
| `/api/admin/invitation/list` | GET | 查看所有邀请码及状态 | Admin |
| `/api/admin/invitation/stats` | GET | 使用统计 | Admin |
| `/api/admin/invitation/disable` | PATCH | 禁用指定码 | Admin |

**注册流程改造:**
1. `/auth/register` 增加可选 `invitationCode` 字段
2. 新增 `InvitationGuard`：当环境变量 `INVITATION_REQUIRED=true` 时，所有新用户注册必须带邀请码
3. OAuth首次登录同样需要邀请码验证（在callback处理中增加检查）

### 4.4 移动端改造

**LoginScreen 增加邀请码步骤:**

```
当前流程:
  LoginScreen → [选择登录方式] → OAuth → Onboarding → Main

改造后流程:
  LoginScreen → [输入邀请码] → [验证通过] → [选择登录方式] → OAuth → Onboarding → Main
  
  或者(更优):
  LoginScreen → [选择登录方式] → OAuth → [首次登录检测] → [输入邀请码] → Onboarding → Main
```

推荐第二种方案（后置邀请码），原因：
- 用户先走完OAuth有了身份，邀请码绑定更可靠
- 参考KimiClaw模式：先登录再激活
- 技术上更简单：只需在Onboarding前加一个Gate Screen

---

## 五、分阶段上线执行计划

### Phase 0: 基础设施准备 (1-2天)

| 任务 | 优先级 | 负责 |
|------|--------|------|
| 配置真实AWS Bedrock凭证 | P0 | 运维 |
| 配置真实Apple OAuth凭证 | P0 | iOS开发 |
| 统一部署为Docker Compose，移除PM2路径 | P1 | 运维 |
| 设置PostgreSQL自动备份 | P1 | 运维 |
| 密钥迁移出源码(.gitignore + Secrets Manager) | P1 | 全员 |

### Phase 1: 邀请码系统开发 (3-5天)

| 任务 | 工作量 | 说明 |
|------|--------|------|
| 后端 invitation module | 2天 | Entity + Service + Controller + Guard |
| 后端 admin 邀请码管理 | 1天 | 生成/查看/统计API |
| 移动端 InvitationGateScreen | 1天 | 邀请码输入页面 |
| 移动端 navigation 改造 | 0.5天 | Auth流程中增加邀请码步骤 |
| Web端 admin邀请码管理页 | 1天 | admin/invitation 页面 |
| 批量生成200个第一批邀请码 | 0.5天 | seed脚本 |

### Phase 2: 资源控制与优化 (2-3天)

| 任务 | 工作量 | 说明 |
|------|--------|------|
| Cloud容器资源限制 | 1天 | docker run增加 `--memory=512m --cpus=0.5` |
| 容器idle自动休眠 | 1天 | 30min无活动暂停容器，请求时唤醒 |
| Token配额前端集成 | 1天 | 移动端显示能量条 + 额度用尽提示 |
| Rate Limiting迁移到Redis | 1天 | 安装Redis容器，替换内存Map |

### Phase 3: 发布准备 (2-3天)

| 任务 | 工作量 | 说明 |
|------|--------|------|
| EAS Build production配置 | 0.5天 | Android AAB + iOS Archive |
| iOS TestFlight 提交 | 1天 | 需Apple Developer账号+App Store Connect |
| Android APK/Play内测 | 0.5天 | EAS internal distribution |
| 清理legacy screens | 0.5天 | 减少bundle体积 |
| 端到端测试 | 1天 | 注册→邀请码→部署→聊天 完整流程 |
| 监控告警 | 0.5天 | CloudWatch / 容器健康检查 |

### Phase 4: 第一批200用户内测 (持续)

| 里程碑 | 时间 | 内容 |
|--------|------|------|
| 内部测试 | 第1周 | 团队5-10人测试，修bug |
| KOL种子用户 | 第2周 | 发放50个邀请码给KOL/早期用户 |
| 扩大内测 | 第3-4周 | 发放剩余150个邀请码 |
| 收集反馈 | 持续 | 通过社交模块+Discord收集 |
| **Phase 5判定** | 第4周末 | 评估是否开放第二批1000码 |

---

## 六、200→1000用户扩展规划

| 维度 | 200用户 | 1000用户 |
|------|---------|----------|
| **服务器** | 1× t3.xlarge ($120/月) | 2-3× t3.xlarge 或 1× m5.2xlarge |
| **LLM成本** | ~$125/月 | ~$500-700/月 |
| **数据库** | 单节点PostgreSQL | 考虑RDS或读写分离 |
| **Cloud容器** | 同一EC2上多容器 | 需ECS/EKS或多EC2 |
| **CDN** | 无 | CloudFront加速静态资源 |
| **Redis** | 单节点容器 | ElastiCache |
| **总预算** | ~$300-400/月 | ~$1200-2000/月 |

### 1000用户时的关键优化:
1. **LLM Gateway 缓存**: 相似query复用结果，减少30-40% LLM调用
2. **容器池化**: 预热复用，而非每用户独立容器
3. **付费tier引入**: Starter ($9.9) / Pro ($19.9)，用付费覆盖成本
4. **本地部署引导**: 鼓励用户自建OpenClaw，减少云端压力

---

## 七、技术实现建议

### 7.1 参考竞品的关键策略

| 策略 | KimiClaw | MaxClaw | CoPaw | **Agentrix建议** |
|------|----------|---------|-------|-------------------|
| 注册门控 | 邀请码必填 | 排队等候 | 邀请链接 | **邀请码 + 分享链接** |
| 额度控制 | 每日对话次数 | Token额度 | 按功能付费 | **月度Token额度 (已有)** |
| 模型策略 | 单一模型 | 多模型选择 | 中间层路由 | **LLM Router (已有)** |
| 云端资源 | 共享推理 | 独立实例 | 按需分配 | **独立容器+休眠** |
| 本地方案 | 不支持 | 桌面客户端 | 浏览器扩展 | **OpenClaw桌面端 (已有)** |

### 7.2 邀请码生成规则

```
格式: AX-[6位字母数字]
示例: AX-3KF7M9, AX-T2P8N5

批次1 (200码): batch_1_200, channel根据分发渠道标记
批次2 (1000码): batch_2_1000

特殊码:
  - AX-TEAM01 ~ AX-TEAM10  (团队内部测试)
  - AX-KOL001 ~ AX-KOL050  (KOL专属)
  - AX-EARLY1 ~ AX-EARLY150 (早期用户)
```

### 7.3 需要立即处理的安全项

1. **移除源码中的密钥**: `backend/.env.prod` 包含JWT Secret、Relayer Private Key、OAuth Secret
2. **强制HTTPS**: 确认nginx配置强制HTTP→HTTPS重定向
3. **登录失败限制**: 当前无暴力破解保护
4. **API Key轮换**: 为各LLM provider设置独立的service account

---

## 八、执行优先级总结

```
Week 1:  [P0] 邀请码系统 + AWS凭证配置 + Apple OAuth
Week 2:  [P0] 资源限制 + Token配额前端 + 部署标准化
Week 3:  [P1] EAS Build + TestFlight + 监控 + 端到端测试  
Week 4:  [Launch] 内部测试 → KOL → 第一批200用户
Week 5-8: [运营] 收集反馈 + 修bug + 评估扩展到1000
```

**预计从现在开始到第一批200用户上线: 3-4周**

---

## 九、Checklist

### 上线前必须完成 ✅

- [x] AWS Bedrock 真实凭证配置 (Bearer Token Auth)
- [x] Token配额调整为1M/用户/月
- [x] 模型切换功能 (前后端联动)
- [ ] 邀请码后端模块 (invitation module)
- [ ] 邀请码移动端UI (InvitationGateScreen)
- [ ] 邀请码管理后台 (集成到现有admin面板)
- [ ] 实例数量限制 (1云端 + 1本地/用户)
- [ ] Apple OAuth 配置 (iOS发布必需)
- [ ] Cloud容器资源限制 (--memory, --cpus)
- [ ] 密钥从源码迁出
- [ ] 批量生成200个邀请码
- [ ] EAS production build (Android + iOS)
- [ ] 端到端测试通过
- [ ] 监控告警配置

### 上线前建议完成 🟡

- [x] Token配额前端能量条 (已集成 TokenEnergyBar 组件)
- [ ] Redis替代内存Rate Limiting
- [ ] 去除Mock数据fallback
- [ ] 部署统一为Docker Compose
- [ ] 推送通知接入
- [ ] WebSocket URL使用配置而非硬编码

### 上线后迭代 🔵

- [ ] 容器idle自动休眠
- [ ] LLM response缓存
- [ ] 付费tier + Stripe收费
- [ ] 清理legacy screens
- [ ] 生物认证守卫
- [ ] BSC主网切换
