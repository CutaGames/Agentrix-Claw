import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { AgentSession } from '../../entities/agent-session.entity';
import { WalletConnection } from '../../entities/wallet-connection.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentSession, WalletConnection]),
    ConfigModule,
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}

