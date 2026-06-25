import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceController } from './compliance.controller';
import { KYCService } from './kyc.service';
import { User } from '../../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [ComplianceController],
  providers: [KYCService],
  exports: [KYCService],
})
export class ComplianceModule {}

