import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentTemplate, AgentTemplateVisibility } from '../../entities/agent-template.entity';
import { DEFAULT_TEMPLATE_IDS, defaultAgentTemplates } from './agent-templates.seed';

@Injectable()
export class AgentTemplateSeederService implements OnModuleInit {
  private readonly logger = new Logger(AgentTemplateSeederService.name);

  constructor(
    @InjectRepository(AgentTemplate)
    private readonly templateRepository: Repository<AgentTemplate>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultTemplates();
  }

  async seedDefaultTemplates(): Promise<void> {
    this.logger.log('🌱 Checking and seeding default Agent templates...');

    for (const template of defaultAgentTemplates) {
      try {
        const existing = await this.templateRepository.findOne({ where: { id: template.id } });

        if (existing) {
          this.logger.debug(`Template already exists: ${template.name}`);
          continue;
        }

        const newTemplate = this.templateRepository.create({
          ...template,
          createdBy: null,
        } as Partial<AgentTemplate>);

        await this.templateRepository.save(newTemplate);
        this.logger.log(`✅ Created template: ${template.name}`);
      } catch (error) {
        this.logger.error(`Failed to create template ${template.name}:`, error);
      }
    }

    this.logger.log('🌱 Default Agent templates check complete!');
  }
}
