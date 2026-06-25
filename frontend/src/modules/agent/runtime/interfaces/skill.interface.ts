/**
 * Skills 系统接口定义
 * 用于模块化 Agent 的功能
 */

export interface SkillResult {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface SkillContext {
  sessionId: string;
  userId?: string;
  mode?: 'user' | 'merchant' | 'developer';
  memory?: any; // MemoryService 实例（通过 Runtime 访问）
  workflow?: any; // WorkflowEngine 实例（通过 Runtime 访问）
}

export interface ISkill {
  /**
   * Skill ID（唯一标识）
   */
  id: string;

  /**
   * Skill 名称
   */
  name: string;

  /**
   * Skill 描述
   */
  description?: string;

  /**
   * 支持的意图列表
   */
  supportedIntents?: string[];

  /**
   * 执行 Skill
   */
  execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult>;
}

export interface ISkillsRegistry {
  /**
   * 注册 Skill
   */
  registerSkill(skill: ISkill): void;

  /**
   * 获取 Skill
   */
  getSkill(skillId: string): ISkill | null;

  /**
   * 根据意图获取 Skill
   */
  getSkillByIntent(intent: string): ISkill | null;

  /**
   * 列出所有 Skill
   */
  listSkills(): ISkill[];

  /**
   * 执行 Skill
   */
  executeSkill(skillId: string, params: Record<string, any>, context: SkillContext): Promise<SkillResult>;
}

