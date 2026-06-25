import { Module } from '@nestjs/common';
import { AgentPresenceModule } from '../agent-presence/agent-presence.module';
import { HandoffV1Controller } from './handoff-v1.controller';

/**
 * HandoffV1Module — 顿领 §5.1 v1 RESTful 接口包装层
 * 复用底层 SessionHandoffService（已存在），仅暴露统一契约路由 /api/v1/handoff/*
 */
@Module({
  imports: [AgentPresenceModule],
  controllers: [HandoffV1Controller],
})
export class HandoffV1Module {}
