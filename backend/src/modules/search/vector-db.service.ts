import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';

/**
 * 向量数据库服务
 * 支持ChromaDB、Milvus、Pinecone等
 */
@Injectable()
export class VectorDbService {
  private readonly logger = new Logger(VectorDbService.name);
  private vectorDbType: 'chroma' | 'milvus' | 'pinecone' | 'memory' = 'memory';
  private vectorDb: any = null;

  constructor(
    private configService: ConfigService,
    private embeddingService: EmbeddingService,
  ) {
    this.initializeVectorDb();
  }

  /**
   * 初始化向量数据库
   */
  private async initializeVectorDb() {
    const dbType = this.configService.get<string>('VECTOR_DB_TYPE', 'memory');
    this.vectorDbType = dbType as any;

    try {
      switch (this.vectorDbType) {
        case 'chroma':
          await this.initializeChroma();
          break;
        case 'milvus':
          await this.initializeMilvus();
          break;
        case 'pinecone':
          await this.initializePinecone();
          break;
        default:
          this.logger.log('使用内存向量数据库（开发模式）');
          this.vectorDb = new Map();
      }
    } catch (error) {
      this.logger.warn('向量数据库初始化失败，使用内存模式:', error);
      this.vectorDb = new Map();
      this.vectorDbType = 'memory';
    }
  }

  /**
   * 初始化ChromaDB
   */
  private async initializeChroma() {
    // 这里应该初始化ChromaDB客户端
    // 暂时使用内存模式
    this.logger.log('ChromaDB初始化（使用内存模式）');
    this.vectorDb = new Map();
  }

  /**
   * 初始化Milvus
   */
  private async initializeMilvus() {
    // 这里应该初始化Milvus客户端
    // 暂时使用内存模式
    this.logger.log('Milvus初始化（使用内存模式）');
    this.vectorDb = new Map();
  }

  /**
   * 初始化Pinecone
   */
  private async initializePinecone() {
    const apiKey = this.configService.get<string>('PINECONE_API_KEY');
    if (!apiKey) {
      this.logger.warn('未配置Pinecone API key，使用内存模式');
      this.vectorDb = new Map();
      return;
    }

    // 这里应该初始化Pinecone客户端
    // 暂时使用内存模式
    this.logger.log('Pinecone初始化（使用内存模式）');
    this.vectorDb = new Map();
  }

  /**
   * 添加向量到数据库
   */
  async addVector(
    id: string,
    text: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    try {
      // 生成embedding
      const embedding = await this.embeddingService.generateEmbedding(text);

      // 存储到向量数据库
      if (this.vectorDbType === 'memory') {
        (this.vectorDb as Map<string, any>).set(id, {
          id,
          embedding,
          text,
          metadata,
        });
      } else {
        // 调用实际的向量数据库API
        await this.addVectorToDb(id, embedding, metadata);
      }
    } catch (error) {
      this.logger.error('添加向量失败:', error);
      throw error;
    }
  }

  /**
   * 搜索相似向量
   */
  async searchSimilar(
    queryText: string,
    topK: number = 10,
    filters?: Record<string, any>,
  ): Promise<Array<{ id: string; score: number; metadata: any }>> {
    try {
      // 生成查询embedding
      const queryEmbedding = await this.embeddingService.generateEmbedding(queryText);

      // 在向量数据库中搜索
      if (this.vectorDbType === 'memory') {
        return this.searchInMemory(queryEmbedding, topK, filters);
      } else {
        return this.searchInDb(queryEmbedding, topK, filters);
      }
    } catch (error) {
      this.logger.error('向量搜索失败:', error);
      throw error;
    }
  }

  /**
   * 在内存数据库中搜索
   */
  private searchInMemory(
    queryEmbedding: number[],
    topK: number,
    filters?: Record<string, any>,
  ): Array<{ id: string; score: number; metadata: any }> {
    const results: Array<{ id: string; score: number; metadata: any }> = [];

    for (const [id, item] of (this.vectorDb as Map<string, any>).entries()) {
      // 应用过滤器
      if (filters) {
        let matches = true;
        for (const [key, value] of Object.entries(filters)) {
          if (item.metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      // 计算余弦相似度
      const score = this.cosineSimilarity(queryEmbedding, item.embedding);
      results.push({
        id,
        score,
        metadata: item.metadata,
      });
    }

    // 按相似度排序并返回topK
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * 添加到实际向量数据库
   */
  private async addVectorToDb(
    id: string,
    embedding: number[],
    metadata: Record<string, any>,
  ): Promise<void> {
    // 这里应该调用实际的向量数据库API
    // 暂时使用内存模式
    (this.vectorDb as Map<string, any>).set(id, {
      id,
      embedding,
      metadata,
    });
  }

  /**
   * 在实际向量数据库中搜索
   */
  private async searchInDb(
    queryEmbedding: number[],
    topK: number,
    filters?: Record<string, any>,
  ): Promise<Array<{ id: string; score: number; metadata: any }>> {
    // 这里应该调用实际的向量数据库API
    // 暂时使用内存模式
    return this.searchInMemory(queryEmbedding, topK, filters);
  }

  /**
   * 删除向量
   */
  async deleteVector(id: string): Promise<void> {
    if (this.vectorDbType === 'memory') {
      (this.vectorDb as Map<string, any>).delete(id);
    } else {
      // 调用实际的向量数据库API
      await this.deleteVectorFromDb(id);
    }
  }

  /**
   * 从实际向量数据库删除
   */
  private async deleteVectorFromDb(id: string): Promise<void> {
    // 这里应该调用实际的向量数据库API
    (this.vectorDb as Map<string, any>).delete(id);
  }
}

