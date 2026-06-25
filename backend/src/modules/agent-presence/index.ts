// Agent Presence Module — barrel exports
export { AgentPresenceModule } from './agent-presence.module';
export { AgentPresenceService } from './agent-presence.service';

// Channel layer
export { ChannelRegistry } from './channel/channel-registry';
export { PresenceRouterService } from './channel/presence-router.service';
export { TelegramAdapter } from './channel/telegram.adapter';
export { DiscordAdapter } from './channel/discord.adapter';
export { TwitterAdapter } from './channel/twitter.adapter';
export type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  DeliveryResult,
  HealthStatus,
} from './channel/channel-adapter.interface';

// Session Handoff + Device Presence
export { SessionHandoffService } from './handoff/session-handoff.service';
export { PresenceGateway } from './handoff/presence.gateway';

// Phase 4: Enterprise channel adapters
export { FeishuAdapter } from './channel/feishu.adapter';
export { WecomAdapter } from './channel/wecom.adapter';
export { SlackAdapter } from './channel/slack.adapter';
export { WhatsAppAdapter } from './channel/whatsapp.adapter';

// Phase 5: Scheduled tasks + Operations dashboard
export { AgentTaskSchedulerService } from './scheduler/agent-task-scheduler.service';
export { OperationsDashboardService } from './scheduler/operations-dashboard.service';
