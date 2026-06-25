import { Module, Global } from '@nestjs/common';
import { TransactionGuard } from './guards/transaction.guard';
import { AgentAccountModule } from '../agent-account/agent-account.module';
import { KYCModule } from '../kyc/kyc.module';

@Global()
@Module({
  imports: [AgentAccountModule, KYCModule],
  providers: [TransactionGuard],
  exports: [TransactionGuard],
})
export class CommonModule {}
