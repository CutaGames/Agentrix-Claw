# 智能模型路由配置指南

## 概述

智能模型路由系统可以根据任务复杂度自动选择最合适的 AI 模型，在保证性能的同时降低 token 消耗。

## 模型配置

### 前端 Gemini 模型
- **简单任务**: `gemini-2.5-flash-preview` (快速、便宜)
- **复杂任务**: `gemini-2.5-pro-exp` (高性能)

### 后端 Claude 模型
- **简单任务**: `claude-3.5-haiku` (快速、便宜)
- **复杂任务**: `claude-3-opus` (高性能)

## 环境变量配置

在 `.env` 文件中添加以下配置：

```env
# 前端 Gemini 模型配置
FRONTEND_GEMINI_SIMPLE_MODEL=gemini-2.5-flash-preview
FRONTEND_GEMINI_COMPLEX_MODEL=gemini-2.5-pro-exp

# 后端 Claude 模型配置
BACKEND_CLAUDE_SIMPLE_MODEL=claude-3.5-haiku
BACKEND_CLAUDE_COMPLEX_MODEL=claude-3-opus

# Gemini API 配置
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3-pro  # 向后兼容的默认模型

# Anthropic Claude API 配置
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_API_URL=https://api.anthropic.com/v1
ANTHROPIC_MODEL=claude-3-opus  # 向后兼容的默认模型

# 模型路由功能开关（可选，默认启用）
ENABLE_MODEL_ROUTING=true
```

## 复杂度判断标准

系统会根据以下因素自动判断任务复杂度：

1. **消息长度**: > 500 字符为复杂任务
2. **Function Calling**: 需要调用函数时为复杂任务
3. **对话轮数**: > 5 轮为复杂任务
4. **上下文长度**: > 10000 字符为复杂任务
5. **关键词检测**: 包含"重构"、"优化"、"分析"等关键词为复杂任务

## 使用方式

### Gemini 服务

```typescript
// 自动路由（推荐）
const result = await geminiService.chatWithFunctions(messages, {
  context: { userId: 'user123' },
  // enableModelRouting: true (默认启用)
});

// 手动指定模型
const result = await geminiService.chatWithFunctions(messages, {
  model: 'gemini-2.5-pro-exp', // 覆盖自动选择
  context: { userId: 'user123' },
});

// 禁用路由
const result = await geminiService.chatWithFunctions(messages, {
  enableModelRouting: false, // 使用默认模型
  context: { userId: 'user123' },
});
```

### Claude 服务

```typescript
// 自动路由（推荐）
const result = await claudeService.chatWithFunctions(messages, {
  context: { userId: 'user123' },
  // enableModelRouting: true (默认启用)
});

// 手动指定模型
const result = await claudeService.chatWithFunctions(messages, {
  model: 'claude-3-opus', // 覆盖自动选择
  context: { userId: 'user123' },
});
```

## API 接口

### Gemini

- `POST /api/gemini/chat` - 对话接口（自动路由）
- `GET /api/gemini/functions` - 获取可用函数列表

### Claude

- `POST /api/claude/chat` - 对话接口（自动路由）
- `GET /api/claude/functions` - 获取可用函数列表

## 降级策略

如果简单任务使用的初级模型失败，系统会自动升级到高级模型（如果配置了 fallbackModel）。

## 安装依赖

如果使用 Claude 服务，需要安装 Anthropic SDK：

```bash
npm install @anthropic-ai/sdk
```

## 预期效果

- **Token 消耗降低**: 简单任务使用初级模型，预计降低 60-80%
- **响应速度提升**: 初级模型通常响应更快
- **成本控制**: 按需使用高级模型，避免浪费
- **灵活性**: 支持手动覆盖和配置调整

## 监控和调试

模型路由决策会记录在日志中：

```
模型路由决策: gemini-2.5-flash-preview (simple) - 根据任务复杂度(simple)自动选择
模型路由决策: claude-3-opus (complex) - 根据任务复杂度(complex)自动选择
```

可以通过日志监控模型使用情况，优化路由策略。

