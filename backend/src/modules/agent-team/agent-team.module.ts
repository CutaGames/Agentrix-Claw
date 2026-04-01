import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentTeamTemplate } from '../../entities/agent-team-template.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { Account } from '../../entities/account.entity';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { AgentTeamService } from './agent-team.service';
import { AgentTeamController } from './agent-team.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentTeamTemplate, AgentAccount, Account, OpenClawInstance]),
  ],
  controllers: [AgentTeamController],
  providers: [AgentTeamService],
  exports: [AgentTeamService],
})
export class AgentTeamModule implements OnModuleInit {
  constructor(private readonly agentTeamService: AgentTeamService) {}

  async onModuleInit() {
    // 应用启动时自动创建默认模板
    await this.agentTeamService.ensureDefaultTemplates();
  }
}
