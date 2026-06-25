import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionFoundationModel } from './transaction-foundation.model';
import { AssetFoundationModel } from './asset-foundation.model';
import { TransactionRoute } from './entities/transaction-route.entity';
import { RiskAssessment } from './entities/risk-assessment.entity';
import { FeeEstimate } from './entities/fee-estimate.entity';
import { AssetAggregation } from './entities/asset-aggregation.entity';
import { TransactionClassification } from './entities/transaction-classification.entity';
import { PaymentService } from '../payment/payment.service';
import { PaymentModule } from '../payment/payment.module';
import { IFoundationLLM } from './interfaces/foundation-llm.interface';
import { GroqFoundationLLM } from './llm-providers/groq-foundation-llm.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      TransactionRoute,
      RiskAssessment,
      FeeEstimate,
      AssetAggregation,
      TransactionClassification,
    ]),
    PaymentModule,
  ],
  providers: [
    // 底座大模型提供者（支持多种实现）
    {
      provide: 'FOUNDATION_LLM',
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>('FOUNDATION_LLM_PROVIDER', 'groq');
        
        switch (provider) {
          case 'groq':
            return new GroqFoundationLLM(configService);
          // case 'paymind':
          //   return new PayMindFoundationLLM(configService);
          // case 'openai':
          //   return new OpenAIFoundationLLM(configService);
          default:
            return new GroqFoundationLLM(configService); // 默认使用Groq
        }
      },
      inject: [ConfigService],
    },
    
    // Foundation Models
    TransactionFoundationModel,
    AssetFoundationModel,
  ],
  exports: ['FOUNDATION_LLM', TransactionFoundationModel, AssetFoundationModel],
})
export class FoundationModule {}

