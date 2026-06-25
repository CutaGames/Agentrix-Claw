/**
 * Memory 系统接口定义
 * 用于持久化和管理 Agent 的上下文记忆
 */

export enum MemoryType {
  CONVERSATION = 'conversation', // 对话记忆
  ENTITY = 'entity', // 实体记忆（商品、订单等）
  STATE = 'state', // 状态记忆（当前流程状态）
  WORKFLOW = 'workflow', // 流程记忆
  INTENT = 'intent', // 意图记忆
}

export interface MemoryEntry {
  id: string;
  sessionId: string;
  type: MemoryType;
  key: string; // 记忆的键（如 'last_search_products', 'current_cart'）
  value: any; // 记忆的值（JSON）
  metadata?: {
    importance?: number; // 重要性（0-1）
    expiresAt?: Date; // 过期时间
    tags?: string[]; // 标签
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface MemorySearchOptions {
  type?: MemoryType;
  key?: string;
  tags?: string[];
  limit?: number;
  since?: Date; // 只搜索此时间之后的记忆
}

export interface IMemoryService {
  /**
   * 保存记忆
   */
  saveMemory(
    sessionId: string,
    type: MemoryType,
    key: string,
    value: any,
    metadata?: MemoryEntry['metadata'],
  ): Promise<MemoryEntry>;

  /**
   * 获取记忆
   */
  getMemory(sessionId: string, key: string): Promise<MemoryEntry | null>;

  /**
   * 获取所有指定类型的记忆
   */
  getMemoriesByType(sessionId: string, type: MemoryType): Promise<MemoryEntry[]>;

  /**
   * 搜索记忆（关键词搜索）
   */
  searchMemory(sessionId: string, query: string, options?: MemorySearchOptions): Promise<MemoryEntry[]>;

  /**
   * 更新记忆
   */
  updateMemory(sessionId: string, key: string, value: any, metadata?: Partial<MemoryEntry['metadata']>): Promise<MemoryEntry>;

  /**
   * 删除记忆
   */
  deleteMemory(sessionId: string, key: string): Promise<void>;

  /**
   * 删除会话的所有记忆
   */
  clearSessionMemory(sessionId: string): Promise<void>;

  /**
   * 获取最近的记忆（按时间排序）
   */
  getRecentMemories(sessionId: string, limit?: number): Promise<MemoryEntry[]>;
}

