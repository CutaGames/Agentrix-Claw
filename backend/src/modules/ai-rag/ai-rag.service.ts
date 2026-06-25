import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { GeminiIntegrationService } from '../ai-integration/gemini/gemini-integration.service';

interface KnowledgeChunk {
  filePath: string;
  content: string;
  vector?: number[];
}

@Injectable()
export class AiRagService implements OnModuleInit {
  private readonly logger = new Logger(AiRagService.name);
  private readonly knowledgeDir = path.join(process.cwd(), 'knowledge');
  private chunks: KnowledgeChunk[] = [];

  constructor(private geminiService: GeminiIntegrationService) {}

  async onModuleInit() {
    await this.indexKnowledgeBase();
  }

  /**
   * 扫描 /knowledge 目录并进行初步索引（切片）
   */
  async indexKnowledgeBase() {
    this.logger.log('正在索引本地知识库文件...');
    if (!fs.existsSync(this.knowledgeDir)) {
      fs.mkdirSync(this.knowledgeDir);
    }

    const files = fs.readdirSync(this.knowledgeDir);
    const newChunks: KnowledgeChunk[] = [];

    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.txt')) {
        const fullPath = path.join(this.knowledgeDir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        
        // 简单切片：每 800 字一段
        const segments = content.match(/[\s\S]{1,800}/g) || [];
        segments.forEach((seg) => {
          newChunks.push({
            filePath: file,
            content: seg,
          });
        });
      }
    }

    this.chunks = newChunks;
    this.logger.log(`知识库索引完成：共加载 \${this.chunks.length} 个文本块`);
  }

  /**
   * 搜索最相关的知识块
   */
  async searchSimilarContent(query: string, limit: number = 3): Promise<string[]> {
    if (this.chunks.length === 0) return [];

    this.logger.log(`正在检索知识库: "\${query}"`);

    // 真正的 RAG 应该使用 Vector Embedding 进行余弦相似度计算
    // 鉴于目前是本地轻量化版本，我们先使用关键词关联 + Gemini 语义辅助
    // 后续可以接入真正的 Vector DB (如 Chroma)
    
    const results = this.chunks
      .filter(chunk => {
        const keywords = query.toLowerCase().split(' ');
        return keywords.some(k => chunk.content.toLowerCase().includes(k));
      })
      .slice(0, limit);

    return results.map(r => `[文件: \${r.filePath}] \${r.content}`);
  }
}
