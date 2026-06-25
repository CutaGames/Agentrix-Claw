import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DreamingSession } from '../../entities/dreaming-session.entity';
import { DreamingService } from './dreaming.service';
import { DreamingController } from './dreaming.controller';
import { AgentContextModule } from '../agent-context/agent-context.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DreamingSession]),
    forwardRef(() => AgentContextModule),
  ],
  controllers: [DreamingController],
  providers: [DreamingService],
  exports: [DreamingService],
})
export class DreamingModule {}
