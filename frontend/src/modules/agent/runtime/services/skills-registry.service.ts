import { Injectable, Logger } from '@nestjs/common';
import { ISkill, ISkillsRegistry, SkillResult, SkillContext } from '../interfaces/skill.interface';

@Injectable()
export class SkillsRegistry implements ISkillsRegistry {
  private readonly logger = new Logger(SkillsRegistry.name);
  private skills: Map<string, ISkill> = new Map();
  private intentToSkill: Map<string, ISkill> = new Map();

  registerSkill(skill: ISkill): void {
    if (this.skills.has(skill.id)) {
      this.logger.warn(`Skill ${skill.id} already registered, overwriting...`);
    }

    this.skills.set(skill.id, skill);

    // 注册意图映射
    if (skill.supportedIntents) {
      for (const intent of skill.supportedIntents) {
        if (this.intentToSkill.has(intent)) {
          this.logger.warn(`Intent ${intent} already mapped to another skill, overwriting...`);
        }
        this.intentToSkill.set(intent, skill);
      }
    }

    this.logger.log(`Skill registered: ${skill.id} (${skill.name})`);
  }

  getSkill(skillId: string): ISkill | null {
    return this.skills.get(skillId) || null;
  }

  getSkillByIntent(intent: string): ISkill | null {
    return this.intentToSkill.get(intent) || null;
  }

  listSkills(): ISkill[] {
    return Array.from(this.skills.values());
  }

  async executeSkill(
    skillId: string,
    params: Record<string, any>,
    context: SkillContext,
  ): Promise<SkillResult> {
    const skill = this.getSkill(skillId);

    if (!skill) {
      return {
        success: false,
        error: `Skill not found: ${skillId}`,
      };
    }

    try {
      this.logger.log(`Executing skill: ${skillId} with params: ${JSON.stringify(params)}`);
      const result = await skill.execute(params, context);
      this.logger.log(`Skill ${skillId} executed: ${result.success ? 'success' : 'failed'}`);
      return result;
    } catch (error) {
      this.logger.error(`Error executing skill ${skillId}: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

