/**
 * UCP Module
 * 
 * Universal Commerce Protocol integration for Agentrix
 * Enables agentic commerce with Google Pay, PayPal, Stripe, and X402
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UCPController } from './ucp.controller';
import { UCPService } from './ucp.service';
import { UCPScannerService } from './ucp-scanner.service';
import { OrderModule } from '../order/order.module';
import { Skill } from '../../entities/skill.entity';
import { Product } from '../../entities/product.entity';
import { UCPCheckoutSessionEntity } from '../../entities/ucp-checkout-session.entity';
import { AP2MandateEntity } from '../../entities/ap2-mandate.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Skill, Product, UCPCheckoutSessionEntity, AP2MandateEntity]),
    forwardRef(() => OrderModule),
  ],
  controllers: [UCPController],
  providers: [UCPService, UCPScannerService],
  exports: [UCPService, UCPScannerService],
})
export class UCPModule {}
