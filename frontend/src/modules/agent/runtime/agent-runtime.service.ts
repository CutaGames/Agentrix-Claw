import { Injectable } from '@nestjs/common';
import { MemoryService } from './services/memory.service';
import { WorkflowEngine } from './services/workflow-engine.service';
import { SkillsRegistry } from './services/skills-registry.service';

/**
 * AgentRuntime - Runtime 架构的核心服务
 * 整合 Memory、Workflow、Skills 三大系统
 */
@Injectable()
export class AgentRuntime {
  constructor(
    public readonly memory: MemoryService,
    public readonly workflow: WorkflowEngine,
    public readonly skills: SkillsRegistry,
  ) {}
}

