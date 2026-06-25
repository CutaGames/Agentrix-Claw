import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AgentrixRelayerService } from './relayer.service';
import { RelayerController } from './relayer.controller';
import { Payment } from '../../entities/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    ConfigModule,
  ],
  controllers: [RelayerController],
  providers: [AgentrixRelayerService],
  exports: [AgentrixRelayerService],
})
export class RelayerModule {}

