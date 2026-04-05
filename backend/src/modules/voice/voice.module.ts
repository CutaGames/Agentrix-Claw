import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoiceController } from './voice.controller';
import { VoiceMetricsController } from './voice-metrics.controller';
import { VoiceService } from './voice.service';
import { RealtimeVoiceGateway } from './realtime-voice.gateway';
import { VoiceSessionStore } from './voice-session.store';
import { VoiceSessionHandoffService } from './voice-session-handoff.service';
import { VoiceABTestService } from './voice-ab-test.service';
import { SessionFabricService } from './session-fabric.service';
import { OutputDispatcherService } from './output-dispatcher.service';
import { DeepThinkOrchestratorService } from './deep-think-orchestrator.service';
import { OpenClawProxyModule } from '../openclaw-proxy/openclaw-proxy.module';
import { UserProviderConfig } from '../../entities/user-provider-config.entity';
import { DeviceSession } from '../../entities/device-session.entity';

@Module({
  imports: [JwtModule, ConfigModule, forwardRef(() => OpenClawProxyModule), TypeOrmModule.forFeature([UserProviderConfig, DeviceSession])],
  controllers: [VoiceController, VoiceMetricsController],
  providers: [
    VoiceService,
    RealtimeVoiceGateway,
    VoiceSessionStore,
    VoiceSessionHandoffService,
    VoiceABTestService,
    SessionFabricService,
    OutputDispatcherService,
    DeepThinkOrchestratorService,
  ],
  exports: [VoiceService, VoiceSessionStore, VoiceSessionHandoffService, VoiceABTestService, SessionFabricService, OutputDispatcherService, DeepThinkOrchestratorService],
})
export class VoiceModule {}
