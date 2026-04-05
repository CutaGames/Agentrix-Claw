import { Controller, Get, Query } from '@nestjs/common';
import { LlmRouterService, TaskTier } from './llm-router.service';

@Controller('llm-router')
export class LlmRouterController {
  constructor(private readonly llmRouter: LlmRouterService) {}

  /**
   * GET /api/llm-router/tiers
   * Returns the tri-tier architecture info for client display.
   */
  @Get('tiers')
  getTiers() {
    return {
      tiers: [
        {
          id: TaskTier.LOCAL,
          name: 'On-Device',
          nameCn: '端侧本地',
          icon: '📱',
          models: ['Gemma 4 2B'],
          cost: 'Free',
          latency: '<50ms',
          description: 'Wake word, intent routing, simple queries. Runs offline.',
        },
        {
          id: TaskTier.LIGHT,
          name: 'Cloud Light',
          nameCn: '云端轻量',
          icon: '☁️',
          models: ['Nova Micro', 'Nova Lite'],
          cost: '$0.03-0.06/M tokens',
          latency: '<500ms',
          description: 'Simple Q&A, classification, translation.',
        },
        {
          id: TaskTier.MEDIUM,
          name: 'Cloud Standard',
          nameCn: '云端标准',
          icon: '⚡',
          models: ['Gemma 4 27B', 'Qwen 3.5+', 'DeepSeek V3'],
          cost: '$0.15-1.10/M tokens',
          latency: '<2s',
          description: 'Multi-step reasoning, code, analysis.',
        },
        {
          id: TaskTier.HEAVY,
          name: 'Cloud Heavy',
          nameCn: '云端重型',
          icon: '🔥',
          models: ['Claude Haiku 4.5', 'Nova Pro'],
          cost: '$0.80-5.00/M tokens',
          latency: '<5s',
          description: 'Complex reasoning, creative writing, tool chains.',
        },
        {
          id: TaskTier.ULTRA,
          name: 'Ultra (Frontier)',
          nameCn: '超脑',
          icon: '🧠',
          models: ['Claude Opus 4.6', 'GPT-5.4', 'Gemini Pro'],
          cost: '$3-75/M tokens',
          latency: '5-15s',
          description: 'Deep research, multi-agent orchestration, critical analysis.',
        },
      ],
    };
  }

  /**
   * GET /api/llm-router/classify?prompt=hello
   * Classify a prompt and return routing result.
   */
  @Get('classify')
  classify(@Query('prompt') prompt: string) {
    if (!prompt) {
      return { tier: TaskTier.LIGHT, reason: 'empty-prompt-default' };
    }
    const result = this.llmRouter.route(prompt);
    return {
      tier: result.tier,
      model: result.model.name,
      modelId: result.model.id,
      provider: result.model.provider,
      reason: result.reason,
      cost: {
        inputPer1M: result.model.inputCostPer1M,
        outputPer1M: result.model.outputCostPer1M,
      },
    };
  }
}
