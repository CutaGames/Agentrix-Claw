import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeploymentController } from './deployment.controller';
import { DeploymentService } from './deployment.service';
import { AgentDeployment } from '../../../entities/agent-deployment.entity';
import { UserAgent } from '../../../entities/user-agent.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AgentDeployment, UserAgent])],
  controllers: [DeploymentController],
  providers: [DeploymentService],
  exports: [DeploymentService],
})
export class DeploymentModule {}

