import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KYCRecord } from '../../entities/kyc-record.entity';
import { KYCService } from './kyc.service';
import { KYCController } from './kyc.controller';

/**
 * KYC 认证模块
 * 
 * 提供 KYC（了解你的客户）认证管理能力：
 * - KYC 申请提交和审核
 * - 多级认证（基础/标准/高级/企业）
 * - 文档管理
 * - 风险评估
 */
@Module({
  imports: [TypeOrmModule.forFeature([KYCRecord])],
  controllers: [KYCController],
  providers: [KYCService],
  exports: [KYCService],
})
export class KYCModule {}
