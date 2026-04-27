import { Module } from '@nestjs/common';
import { CodeIntelligenceController } from './code-intelligence.controller';
import { CodeIntelligenceService } from './code-intelligence.service';

@Module({
  controllers: [CodeIntelligenceController],
  providers: [CodeIntelligenceService],
  exports: [CodeIntelligenceService],
})
export class CodeIntelligenceModule {}