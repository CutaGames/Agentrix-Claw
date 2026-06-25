import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Payment, PaymentMethod, PaymentStatus } from '../../entities/payment.entity';
import { CreateProviderPaymentSessionDto } from './dto/payment.dto';
import { FiatToCryptoService, ExchangeQuote } from './fiat-to-crypto.service';
import { ConfigService } from '@nestjs/config';

interface ProviderSessionMetadata {
  providerId: string;
  paymentRail: string;
  lockId?: string;
  quote: ExchangeQuote;
  routeId?: string;
  scenario?: string;
}

@Injectable()
export class ProviderPaymentFlowService {
  private readonly logger = new Logger(ProviderPaymentFlowService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly fiatToCryptoService: FiatToCryptoService,
    private readonly configService: ConfigService,
  ) {}

  async createSession(userId: string | undefined, dto: CreateProviderPaymentSessionDto) {
    const quote: ExchangeQuote =
      dto.quote ||
      (await this.pickBestQuote(dto.amount, dto.currency, dto.toCurrency, dto.providerId));

    const lockId = dto.lockId || (await this.fiatToCryptoService.lockQuote(uuidv4(), quote));
    const sessionId = uuidv4();

    const metadata: ProviderSessionMetadata = {
      providerId: dto.providerId,
      paymentRail: dto.paymentRail,
      lockId,
      quote,
      routeId: dto.routeId,
      scenario: dto.metadata?.scenario,
    };

    const payment = this.paymentRepository.create({
      userId: userId || null,
      amount: dto.amount,
      currency: dto.currency,
      paymentMethod: PaymentMethod.STRIPE, // 复用法币渠道存储
      status: PaymentStatus.PENDING,
      description: dto.description,
      merchantId: dto.merchantId,
      metadata: {
        ...(dto.metadata || {}),
        providerSession: metadata,
      },
      sessionId,
    });
    await this.paymentRepository.save(payment);

    const checkoutBase =
      this.configService.get<string>('PROVIDER_CHECKOUT_URL') ||
      'https://demo.paymind.io/provider-checkout';

    return {
      sessionId,
      paymentId: payment.id,
      lockId,
      provider: metadata.providerId,
      quote,
      checkoutUrl: `${checkoutBase}?sessionId=${sessionId}&provider=${metadata.providerId}`,
      expiresAt: quote.lockExpiresAt,
    };
  }

  async getSessionStatus(sessionId: string) {
    const payment = await this.paymentRepository.findOne({
      where: { sessionId },
    });
    if (!payment) {
      throw new NotFoundException('Provider session not found');
    }

    const providerMetadata = payment.metadata?.providerSession;

    return {
      sessionId,
      paymentId: payment.id,
      status: payment.status,
      transactionHash: payment.transactionHash,
      provider: providerMetadata?.providerId,
      quote: providerMetadata?.quote,
    };
  }

  async completeSession(sessionId: string, payload?: { transactionHash?: string }) {
    const payment = await this.paymentRepository.findOne({
      where: { sessionId },
    });
    if (!payment) {
      throw new NotFoundException('Provider session not found');
    }

    payment.status = PaymentStatus.COMPLETED;
    payment.transactionHash =
      payload?.transactionHash || `0x${Math.random().toString(16).substring(2, 66)}`;
    payment.metadata = {
      ...(payment.metadata || {}),
      providerSession: {
        ...(payment.metadata?.providerSession || {}),
        status: 'completed',
        completedAt: new Date().toISOString(),
      },
    };

    await this.paymentRepository.save(payment);
    return payment;
  }

  async failSession(sessionId: string, reason: string) {
    const payment = await this.paymentRepository.findOne({
      where: { sessionId },
    });
    if (!payment) {
      throw new NotFoundException('Provider session not found');
    }

    payment.status = PaymentStatus.FAILED;
    payment.metadata = {
      ...(payment.metadata || {}),
      providerSession: {
        ...(payment.metadata?.providerSession || {}),
        status: 'failed',
        reason,
      },
    };

    await this.paymentRepository.save(payment);
    return payment;
  }

  async handleWebhook(providerId: string, payload: { sessionId: string; status: string; txHash?: string }) {
    if (payload.status === 'completed') {
      await this.completeSession(payload.sessionId, { transactionHash: payload.txHash });
      this.logger.log(`Provider session ${payload.sessionId} completed via webhook`);
    } else if (payload.status === 'failed') {
      await this.failSession(payload.sessionId, 'provider_failed');
      this.logger.warn(`Provider session ${payload.sessionId} failed via webhook`);
    }
  }

  private async pickBestQuote(
    fromAmount: number,
    fromCurrency: string,
    toCurrency: string,
    preferredProvider?: string,
  ): Promise<ExchangeQuote> {
    const quotes = await this.fiatToCryptoService.getProviderQuotes(
      fromAmount,
      fromCurrency,
      toCurrency,
    );
    if (!quotes.length) {
      throw new NotFoundException('未找到可用的Provider报价');
    }

    if (preferredProvider) {
      const found = quotes.find((quote) => quote.provider.id === preferredProvider);
      if (found) {
        return found;
      }
    }

    return quotes[0];
  }
}

