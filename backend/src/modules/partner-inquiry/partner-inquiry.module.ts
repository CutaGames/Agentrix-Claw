import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnerInquiry } from '../../entities/partner-inquiry.entity';
import { PartnerInquiryController } from './partner-inquiry.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PartnerInquiry])],
  controllers: [PartnerInquiryController],
})
export class PartnerInquiryModule {}
