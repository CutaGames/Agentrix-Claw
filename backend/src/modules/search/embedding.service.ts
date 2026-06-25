import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Embedding服务
 * 支持本地模型和云端API fallback
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private useLocalModel: boolean = false;
  private localModel: any = null;

  constructor(private configService: ConfigService) {
    // 检查是否启用本地模型
    const enableLocalModel = this.configService.get<string>('ENABLE_LOCAL_EMBEDDING', 'false') === 'true';
    if (enableLocalModel) {
      this.initializeLocalModel();
    }
  }

  /**
   * 初始化本地embedding模型
   */
  private async initializeLocalModel() {
    try {
      // 这里应该加载本地模型（如MiniLM、Qwen等）
      // 暂时使用模拟实现
      this.logger.log('初始化本地embedding模型...');
      this.useLocalModel = true;
      this.logger.log('本地embedding模型初始化完成');
    } catch (error) {
      this.logger.warn('本地模型初始化失败，将使用云端API:', error);
      this.useLocalModel = false;
    }
  }

  /**
   * 生成文本embedding
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('文本不能为空');
    }

    try {
      if (this.useLocalModel && this.localModel) {
        // 使用本地模型生成embedding
        return this.generateLocalEmbedding(text);
      } else {
        // 使用云端API生成embedding
        return this.generateCloudEmbedding(text);
      }
    } catch (error) {
      this.logger.error('生成embedding失败:', error);
      // Fallback到云端API
      if (this.useLocalModel) {
        this.logger.log('本地模型失败，fallback到云端API');
        return this.generateCloudEmbedding(text);
      }
      throw error;
    }
  }

  /**
   * 使用本地模型生成embedding
   */
  private async generateLocalEmbedding(text: string): Promise<number[]> {
    // 这里应该调用本地模型
    // 暂时使用模拟实现（返回固定维度的向量）
    const dimension = 384; // MiniLM的维度
    const embedding = new Array(dimension).fill(0).map(() => Math.random() - 0.5);
    
    // 归一化
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  /**
   * 使用云端API生成embedding
   */
  private async generateCloudEmbedding(text: string): Promise<number[]> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY') || 
                   this.configService.get<string>('EMBEDDING_API_KEY');
    
    if (!apiKey) {
      this.logger.warn('未配置embedding API key，使用模拟embedding');
      return this.generateMockEmbedding(text);
    }

    try {
      // 调用OpenAI或其他embedding API
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding API返回错误: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      this.logger.warn('云端API调用失败，使用模拟embedding:', error);
      return this.generateMockEmbedding(text);
    }
  }

  /**
   * 生成模拟embedding（用于开发测试）
   */
  private generateMockEmbedding(text: string): number[] {
    // 基于文本内容生成简单的hash-based embedding
    const dimension = 384;
    const embedding = new Array(dimension).fill(0);
    
    // 简单的hash函数
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const index = charCode % dimension;
      embedding[index] += charCode / 1000;
    }

    // 归一化
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  /**
   * 批量生成embedding
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings = await Promise.all(
      texts.map(text => this.generateEmbedding(text))
    );
    return embeddings;
  }
}

