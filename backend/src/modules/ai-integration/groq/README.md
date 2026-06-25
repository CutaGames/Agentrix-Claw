# Groq集成模块

## 📋 概述

Groq API集成模块，支持Function Calling功能。Groq提供最大的免费额度（每天14,400次），非常适合前期测试和种子用户使用。

---

## 🚀 快速开始

### 1. 注册Groq账号

访问：https://console.groq.com/

### 2. 获取API Key

在控制台创建API Key

### 3. 安装依赖

```bash
npm install groq-sdk
```

### 4. 配置环境变量

```env
# .env
GROQ_API_KEY=gsk_xxx
```

### 5. 重启服务

```bash
npm run start:dev
```

---

## 📝 API端点

### 1. 获取Function Schemas

```bash
GET /api/groq/functions
```

返回所有可用的Function定义。

### 2. 执行Function Call

```bash
POST /api/groq/function-call
Content-Type: application/json

{
  "function": {
    "name": "search_paymind_products",
    "arguments": "{\"query\": \"耳机\"}"
  },
  "context": {
    "userId": "user-123"
  }
}
```

### 3. 测试接口

```bash
GET /api/groq/test?query=帮我搜索耳机
```

---

## 🔧 使用示例

### 在代码中使用

```typescript
import { GroqIntegrationService } from './modules/ai-integration/groq/groq-integration.service';

// 调用Groq API
const response = await groqIntegrationService.chatWithFunctions([
  {
    role: 'system',
    content: '你是一个购物助手。',
  },
  {
    role: 'user',
    content: '帮我搜索耳机',
  },
], {
  model: 'llama-3-groq-70b-tool-use',
  temperature: 0.7,
});
```

---

## 📊 免费额度

- **每天**：14,400次API调用
- **每分钟**：30次请求
- **每分钟**：6,000个令牌

---

## 🎯 推荐模型

- `llama-3-groq-70b-tool-use` - 70B模型，性能更好（默认）
- `llama-3-groq-8b-tool-use` - 8B模型，速度更快

---

## 📚 详细文档

查看 `PayMind-Groq集成完成报告.md` 了解完整功能和使用示例。

