import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class DeepSeekIntegrationService {
  private readonly logger = new Logger(DeepSeekIntegrationService.name);
  private readonly openai: OpenAI | null;
  private readonly defaultModel = 'deepseek-chat';

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('deepseek_API_KEY');
    if (!apiKey) {
      this.logger.warn('deepseek_API_KEY not configured');
      this.openai = null;
    } else {
      this.openai = new OpenAI({
        apiKey,
        baseURL: 'https://api.deepseek.com',
      });
      this.logger.log('DeepSeek integration initialized');
    }
  }

  async chatWithFunctions(
    messages: any[],
    options: any = {}
  ): Promise<any> {
    if (!this.openai) throw new Error('DeepSeek not configured');

    try {
      const response = await this.openai.chat.completions.create({
        model: options.model || this.defaultModel,
        messages: messages as any,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2048,
      });

      return {
        text: response.choices[0].message.content || '',
        functionCalls: null
      };
    } catch (error: any) {
      this.logger.error(`DeepSeek call failed: ${error.message}`);
      throw error;
    }
  }
}
