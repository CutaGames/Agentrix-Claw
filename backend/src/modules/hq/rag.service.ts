import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private vectorStore: MemoryVectorStore | null = null;
  private readonly knowledgePath = path.join(process.cwd(), 'knowledge');

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.logger.log('准备初始化 RAG 引擎...');
    
    // 确保知识库目录存在
    if (!fs.existsSync(this.knowledgePath)) {
      try {
        fs.mkdirSync(this.knowledgePath, { recursive: true });
        this.logger.log(`创建知识库目录: ${this.knowledgePath}`);
      } catch (err) {
        this.logger.error(`创建知识库目录失败: ${err.message}`);
      }
    }
    
    await this.initializeVectorStore();
  }

  /**
   * 初始化向量库
   */
  async initializeVectorStore() {
    try {
      const apiKey = this.configService.get<string>('GEMINI_API_KEY');
      if (!apiKey) {
        this.logger.warn('未配置 GEMINI_API_KEY，RAG 服务将受限 (无法生成向量)');
        return;
      }

      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey,
        modelName: "embedding-001",
      });

      // 如果目录不存在或为空，初始化一个空的向量库
      if (!fs.existsSync(this.knowledgePath)) {
        this.vectorStore = await MemoryVectorStore.fromDocuments([], embeddings);
        return;
      }

      // 加载支持的文档类型
      const loader = new DirectoryLoader(
        this.knowledgePath,
        {
          ".txt": (path) => new TextLoader(path),
          ".md": (path) => new TextLoader(path),
          ".pdf": (path) => new PDFLoader(path),
        }
      );

      let docs = [];
      try {
        docs = await loader.load();
      } catch (e) {
        this.logger.warn(`加载文件时出错 (可能是目录为空): ${e.message}`);
      }
      
      if (docs.length === 0) {
        this.logger.warn('知识库目录下暂无有效文件');
        this.vectorStore = await MemoryVectorStore.fromDocuments([], embeddings);
        return;
      }

      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const splitDocs = await textSplitter.splitDocuments(docs);
      this.vectorStore = await MemoryVectorStore.fromDocuments(splitDocs, embeddings);
      this.logger.log(`RAG 引擎初始化成功：加载了 ${docs.length} 个文件，共 ${splitDocs.length} 个知识分块`);
    } catch (error: any) {
      this.logger.error(`RAG 引擎初始化失败: ${error.message}`);
    }
  }

  /**
   * 搜索本地知识库
   */
  async searchLocalDocs(query: string, limit: number = 5) {
    if (!this.vectorStore) {
      return { 
        source: 'Local RAG',
        results: [], 
        note: "本地向量库未就绪或知识库为空。" 
      };
    }

    try {
      const results = await this.vectorStore.similaritySearch(query, limit);
      return {
        source: 'Local RAG (Agentrix Internal KB)',
        results: results.map(doc => ({
          content: doc.pageContent,
          metadata: doc.metadata,
          fileName: doc.metadata.source ? path.basename(doc.metadata.source) : '未知文件'
        })),
        note: `从本地知识库中匹配到 ${results.length} 个相关片段。`
      };
    } catch (error: any) {
      this.logger.error(`RAG 检索过程中出错: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 刷新知识库（当用户上传新文件后调用）
   */
  async reloadKnowledge() {
    this.logger.log('手动触发知识库重新加载...');
    await this.initializeVectorStore();
    return { 
      success: true, 
      message: "RAG 知识库已重新扫描并完成向量化同步。" 
    };
  }
}
