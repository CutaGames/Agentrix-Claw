# 自定义 AI 模型接入 — 产品需求文档 (PRD)

**版本**: v1.0  
**日期**: 2026-03-12  
**产品名**: Agentrix Custom LLM Provider  
**定位**: 让用户接入自己的 AI API 密钥，选择厂商与模型，支持为不同 Agent 指定不同模型

---

## 一、需求背景

### 现状分析

| 维度 | 当前状态 | 问题 |
|------|---------|------|
| **前端 UI** | `ApiKeysScreen` 仅有 Anthropic / OpenAI / Gemini 三个输入框 | 缺少 DeepSeek、Groq、AWS Bedrock 等主流厂商；无模型选择；无连通测试 |
| **前端模型选择** | `settingsStore` 有 7 个模型定义，3 个标记 `coming_soon` | 模型列表写死、无法动态扩展；选了模型不等于选了厂商 |
| **后端服务** | 6 个 Provider 已分别实现 (`claude`, `openai`, `gemini`, `bedrock`, `deepseek`, `groq`)，均支持 `userApiKey` 参数 | 前端从未将用户自定义 API Key 传到后端；仅靠 env 变量配置 |
| **Per-Agent 模型** | `AgentAccount` 无模型字段 | 所有 Agent 共用一个全局模型，不利于高级用户场景 |
| **存储** | 用户 API Key 仅存在 `AsyncStorage` (`settingsStore`)，后端无持久化 | 换手机即丢失；后端无法验证/使用 |

### 目标

1. **增加国内外主流 AI 厂商**：Anthropic、OpenAI、Google Gemini、AWS Bedrock、DeepSeek、Groq、智谱 AI (GLM)、Moonshot (Kimi)、百度文心、阿里通义
2. **可视化配置**：用户可以为每个厂商输入 API Key，选择该厂商下的具体模型，一键验证连通性
3. **灵活切换**：全局默认模型 + Per-Agent 模型覆盖
4. **数据安全**：API Key 使用 AES-256 加密存储在后端数据库，传输使用 HTTPS
5. **优秀的用户体验**：分组卡片式 UI，实时连通性测试，模型能力标签，成本提示

---

## 二、产品设计

### 2.1 信息架构

```
设置 → 自定义 AI 模型
├── 🌐 全局默认模型（当前选中的模型 + 一键切换）
├── 📋 已配置的厂商（卡片列表，显示状态/已选模型）
│   ├── Anthropic (Claude)     ✅ 已连通 → Claude Haiku 4.5
│   ├── OpenAI                 ✅ 已连通 → GPT-4o
│   ├── DeepSeek               ⚪ 未配置
│   └── ...
└── ➕ 添加厂商（底部按钮，弹出厂商选择列表）
```

### 2.2 交互流程

```
用户进入「自定义 AI 模型」页面
  │
  ├─→ 顶部：全局默认模型选择器（下拉/弹出选择已配置的模型）
  │
  ├─→ 中间：已配置厂商卡片列表
  │   │  每张卡片显示：厂商 Logo + 名称 + 状态 + 当前模型
  │   │  点击卡片 → 展开/进入配置面板：
  │   │    ├── API Key 输入框（密文显示）
  │   │    ├── Base URL（可选，Azure/自部署场景）
  │   │    ├── Region（Bedrock 特有）
  │   │    ├── 模型选择（该厂商可用模型列表，标注能力/价格）
  │   │    ├── 「测试连通」按钮 → 调用后端验证 → 显示 ✅/❌
  │   │    └── 「保存」按钮
  │   └──→ 「删除配置」（右滑或长按）
  │
  └─→ 底部：添加更多厂商按钮
```

### 2.3 Per-Agent 模型分配

在 Agent 详情/设置页面，新增：
```
🧠 AI 模型
[当前模型] Claude Haiku 4.5 (全局默认)  ▼
  → 选择已配置的任意模型覆盖
  → 「恢复默认」选项
```

---

## 三、厂商与模型目录

### 3.1 国际厂商

| 厂商 | Provider ID | 必填参数 | 可用模型 |
|------|------------|---------|---------|
| **Anthropic** | `anthropic` | API Key | Claude Haiku 4.5, Claude Sonnet 4.5, Claude Opus 4 |
| **OpenAI** | `openai` | API Key, Base URL(可选) | GPT-4o, GPT-4o-mini, GPT-4.5, o3-mini |
| **Google Gemini** | `gemini` | API Key | Gemini 2.0 Flash, Gemini 2.0 Pro, Gemini 2.5 Pro |
| **AWS Bedrock** | `bedrock` | Access Key, Secret Key, Region | Claude 系列, Llama 系列, Amazon Nova |
| **DeepSeek** | `deepseek` | API Key | DeepSeek V3, DeepSeek R1 |
| **Groq** | `groq` | API Key | Llama 3.3 70B, Llama 3.1 405B, Mixtral 8x7B |

### 3.2 国内厂商

| 厂商 | Provider ID | 必填参数 | 可用模型 |
|------|------------|---------|---------|
| **智谱 AI** | `zhipu` | API Key | GLM-4-Plus, GLM-4-Flash, GLM-4-Long |
| **Moonshot (Kimi)** | `moonshot` | API Key | Moonshot-v1-8k, Moonshot-v1-32k, Moonshot-v1-128k |
| **百度文心** | `baidu` | API Key, Secret Key | ERNIE-4.0, ERNIE-3.5, ERNIE-Speed |
| **阿里通义** | `alibaba` | API Key | Qwen-Max, Qwen-Plus, Qwen-Turbo |

---

## 四、技术方案

### 4.1 数据模型

#### 新增 Entity: `UserProviderConfig`

```typescript
@Entity('user_provider_configs')
class UserProviderConfig {
  id: string;                    // UUID
  userId: string;                // 关联用户
  providerId: string;            // 厂商标识 (anthropic, openai, gemini, bedrock, deepseek, groq, zhipu, moonshot, baidu, alibaba)
  encryptedApiKey: string;       // AES-256-GCM 加密的 API Key
  encryptedSecretKey?: string;   // 部分厂商需要 Secret Key (Bedrock, 百度)
  baseUrl?: string;              // 自定义 Base URL
  region?: string;               // Bedrock 区域
  selectedModel: string;         // 当前选中的模型 ID
  isActive: boolean;             // 是否启用
  lastTestedAt?: Date;           // 最后测试时间
  lastTestResult?: 'success' | 'failed';
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
```

#### 修改 Entity: `AgentAccount`

新增字段：
```typescript
@Column({ nullable: true, length: 100 })
preferredModel?: string;         // 覆盖全局默认模型

@Column({ nullable: true, length: 50 })
preferredProvider?: string;      // 覆盖全局默认厂商
```

### 4.2 后端 API

| Method | Endpoint | 说明 |
|--------|----------|------|
| `GET` | `/api/ai-providers/catalog` | 获取支持的厂商+模型目录（静态数据）|
| `GET` | `/api/ai-providers/configs` | 获取当前用户所有已配置厂商 |
| `POST` | `/api/ai-providers/configs` | 新增/更新厂商配置 |
| `DELETE` | `/api/ai-providers/configs/:providerId` | 删除厂商配置 |
| `POST` | `/api/ai-providers/test` | 测试 API Key 连通性 |
| `PUT` | `/api/ai-providers/default-model` | 设置全局默认模型 |

### 4.3 Chat 流程改造

```
用户发送消息
  │
  ├─ 从 AgentAccount 读取 preferredModel / preferredProvider
  │  （如果未设置，使用全局默认）
  │
  ├─ 从 UserProviderConfig 读取该 provider 的加密 API Key
  │  解密后作为 userApiKey 传入对应 provider service
  │
  └─ 调用对应 provider 的 chatWithFunctions()
```

### 4.4 安全设计

1. **API Key 加密存储**：AES-256-GCM，密钥来自环境变量 `PROVIDER_ENCRYPTION_KEY`
2. **传输安全**：全链路 HTTPS
3. **访问控制**：只能查看/修改自己的配置，API Key 返回时只显示前缀
4. **审计日志**：记录配置变更操作

---

## 五、实现范围

### Phase 1（本次实现）

- [x] PRD 文档
- [ ] 后端：`UserProviderConfig` Entity + Migration
- [ ] 后端：Provider Catalog 静态数据
- [ ] 后端：CRUD Controller + Service（含加密）
- [ ] 后端：连通性测试端点
- [ ] 后端：Chat 流程集成用户自定义 API Key + 模型
- [ ] 后端：AgentAccount 新增 `preferredModel` / `preferredProvider`
- [ ] 前端：重写 `ApiKeysScreen` → `AIProviderSettingsScreen`
- [ ] 前端：全局默认模型选择
- [ ] 前端：厂商配置卡片 + 展开编辑
- [ ] 前端：连通性测试按钮
- [ ] 前端：Per-Agent 模型选择 UI
- [ ] 部署 + 测试

---

## 六、验收标准

1. 用户可以成功配置至少 6 个厂商的 API Key 并通过连通性测试
2. 切换全局默认模型后，Agent 对话使用新模型
3. 为指定 Agent 设置不同模型后，该 Agent 对话使用指定模型
4. API Key 在数据库中加密存储，API 响应中不暴露完整 Key
5. 删除厂商配置后，自动回退到平台默认模型
