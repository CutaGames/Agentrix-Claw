import { Injectable, Logger } from '@nestjs/common';

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  handler: (params: any) => Promise<any>;
}

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);
  private skills: Map<string, Skill> = new Map();

  constructor() {
    this.registerDefaultSkills();
  }

  /**
   * 注册技能
   */
  registerSkill(skill: Skill): void {
    this.skills.set(skill.id, skill);
    this.logger.log(`注册技能: ${skill.id} (${skill.name})`);
  }

  /**
   * 获取所有技能
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取启用的技能
   */
  getEnabledSkills(): Skill[] {
    return Array.from(this.skills.values()).filter(s => s.enabled);
  }

  /**
   * 执行技能
   */
  async executeSkill(skillId: string, params: any): Promise<any> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`技能不存在: ${skillId}`);
    }

    if (!skill.enabled) {
      throw new Error(`技能已禁用: ${skillId}`);
    }

    try {
      return await skill.handler(params);
    } catch (error: any) {
      this.logger.error(`执行技能失败: ${skillId}, 错误: ${error.message}`);
      throw error;
    }
  }

  /**
   * 注册默认技能
   */
  private registerDefaultSkills(): void {
    // 支付技能
    this.registerSkill({
      id: 'payment',
      name: '支付',
      description: '处理支付请求',
      version: '1.0.0',
      enabled: true,
      handler: async (params: any) => {
        return { success: true, message: '支付处理中' };
      },
    });

    // 查询余额技能
    this.registerSkill({
      id: 'balance',
      name: '查询余额',
      description: '查询账户余额',
      version: '1.0.0',
      enabled: true,
      handler: async (params: any) => {
        return { balance: 0, currency: 'USDC' };
      },
    });

    // 交易历史技能
    this.registerSkill({
      id: 'transaction_history',
      name: '交易历史',
      description: '查询交易历史',
      version: '1.0.0',
      enabled: true,
      handler: async (params: any) => {
        return { transactions: [] };
      },
    });
  }
}

