import { Injectable, Logger } from '@nestjs/common';
import { IPlatformAdapter } from '../adapters/platform-adapter.interface';
import { OpenAIAdapter } from '../adapters/openai.adapter';
import { ClaudeAdapter } from '../adapters/claude.adapter';
import { GeminiAdapter } from '../adapters/gemini.adapter';
import { GroqAdapter } from '../adapters/groq.adapter';

/**
 * 平台注册表服务
 * 支持动态注册新的 AI 平台适配器
 */
@Injectable()
export class PlatformRegistryService {
  private readonly logger = new Logger(PlatformRegistryService.name);
  private readonly adapters: Map<string, IPlatformAdapter> = new Map();
  private readonly defaultPlatforms: string[] = ['openai', 'claude', 'gemini', 'groq'];

  constructor(
    private openaiAdapter: OpenAIAdapter,
    private claudeAdapter: ClaudeAdapter,
    private geminiAdapter: GeminiAdapter,
    private groqAdapter: GroqAdapter,
  ) {
    // 注册默认平台
    this.registerAdapter('openai', openaiAdapter);
    this.registerAdapter('claude', claudeAdapter);
    this.registerAdapter('gemini', geminiAdapter);
    this.registerAdapter('groq', groqAdapter);
  }

  /**
   * 注册新的平台适配器
   */
  registerAdapter(platformId: string, adapter: IPlatformAdapter): void {
    if (this.adapters.has(platformId)) {
      this.logger.warn(`Platform ${platformId} already registered, overwriting...`);
    }
    this.adapters.set(platformId, adapter);
    this.logger.log(`Platform adapter registered: ${platformId}`);
  }

  /**
   * 获取平台适配器
   */
  getAdapter(platformId: string): IPlatformAdapter {
    const adapter = this.adapters.get(platformId);
    if (!adapter) {
      throw new Error(`Platform adapter not found: ${platformId}`);
    }
    return adapter;
  }

  /**
   * 获取所有已注册的平台 ID
   */
  getAllPlatformIds(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 获取所有已注册的平台适配器
   */
  getAllAdapters(): IPlatformAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * 检查平台是否已注册
   */
  isPlatformRegistered(platformId: string): boolean {
    return this.adapters.has(platformId);
  }

  /**
   * 获取默认平台列表（用于向后兼容）
   */
  getDefaultPlatforms(): string[] {
    return this.defaultPlatforms;
  }

  /**
   * 获取所有活跃平台（所有已注册的平台）
   */
  getAllActivePlatforms(): string[] {
    return this.getAllPlatformIds();
  }
}

