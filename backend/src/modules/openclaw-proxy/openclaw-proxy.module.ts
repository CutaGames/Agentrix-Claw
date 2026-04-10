import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentAccount } from '../../entities/agent-account.entity';
import { AgentMessage } from '../../entities/agent-message.entity';
import { AgentSession } from '../../entities/agent-session.entity';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { UserInstalledSkill } from '../../entities/user-installed-skill.entity';
import { Skill } from '../../entities/skill.entity';
import { OpenClawProxyService } from './openclaw-proxy.service';
import { OpenClawProxyController } from './openclaw-proxy.controller';
import { OpenClawConnectionModule } from '../openclaw-connection/openclaw-connection.module';
import { TokenQuotaModule } from '../token-quota/token-quota.module';
import { SkillModule } from '../skill/skill.module';
import { ClaudeIntegrationModule } from '../ai-integration/claude/claude-integration.module';
import { GeminiIntegrationModule } from '../ai-integration/gemini/gemini-integration.module';
import { OpenAIIntegrationModule } from '../ai-integration/openai/openai-integration.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { AgentIntelligenceModule } from '../agent-intelligence/agent-intelligence.module';
import { AgentContextModule } from '../agent-context/agent-context.module';
import { AgentOrchestrationModule } from '../agent-orchestration/agent-orchestration.module';
import { HookModule } from '../hooks/hook.module';
import { McpRegistryModule } from '../mcp-registry/mcp-registry.module';
import { DesktopSyncModule } from '../desktop-sync/desktop-sync.module';
import { LlmRouterModule } from '../llm-router/llm-router.module';
import { CostTrackerModule } from '../cost-tracker/cost-tracker.module';
import { QueryEngineModule } from '../query-engine/query-engine.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpenClawInstance, UserInstalledSkill, Skill, AgentAccount, AgentSession, AgentMessage]),
    forwardRef(() => OpenClawConnectionModule),
    TokenQuotaModule,
    forwardRef(() => SkillModule),
    forwardRef(() => ClaudeIntegrationModule),
    forwardRef(() => GeminiIntegrationModule),
    forwardRef(() => OpenAIIntegrationModule),
    AiProviderModule,
    AgentIntelligenceModule,
    AgentContextModule,
    AgentOrchestrationModule,
    HookModule,
    McpRegistryModule,
    DesktopSyncModule,
    LlmRouterModule,
    CostTrackerModule,
    forwardRef(() => QueryEngineModule),
  ],
  providers: [OpenClawProxyService],
  controllers: [OpenClawProxyController],
  exports: [OpenClawProxyService],
})
export class OpenClawProxyModule {}
