import { Module } from '@nestjs/common';
import { ContractDeploymentService } from './contract-deployment.service';

@Module({
  providers: [ContractDeploymentService],
  exports: [ContractDeploymentService],
})
export class ContractModule {}
