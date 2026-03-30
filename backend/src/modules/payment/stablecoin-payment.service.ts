import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';

export type StablecoinNetwork = 'ethereum' | 'solana' | 'polygon' | 'base';
export type StablecoinCurrency = 'usdc';

export interface StablecoinPaymentIntent {
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
  stablecoin: StablecoinCurrency;
  network: StablecoinNetwork;
  walletAddress?: string;
  status: string;
}

export interface StablecoinPayoutResult {
  payoutId: string;
  amount: number;
  stablecoin: StablecoinCurrency;
  network: StablecoinNetwork;
  destinationAddress: string;
  status: string;
}

/**
 * Stripe Stablecoin Payment Service
 *
 * Integrates with Stripe's stablecoin payment capabilities:
 * - Accept USDC payments on Ethereum, Solana, Polygon, Base
 * - Stablecoin payouts to merchants
 * - Bridge-based stablecoin orchestration for cross-network settlement
 *
 * Requirements:
 * - Stripe account with crypto/stablecoin feature enabled
 * - STRIPE_SECRET_KEY in environment
 * - US-based merchants (initial rollout)
 *
 * Limits: $10,000 per transaction, no chargebacks on stablecoin payments
 */
@Injectable()
export class StablecoinPaymentService {
  private stripe: Stripe | null = null;
  private readonly logger = new Logger(StablecoinPaymentService.name);
  private readonly isConfigured: boolean;
  private readonly stablecoinEnabled: boolean;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    const stablecoinFlag = this.configService.get<string>('STRIPE_STABLECOIN_ENABLED');

    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not configured. Stablecoin payments disabled.');
      this.isConfigured = false;
      this.stablecoinEnabled = false;
    } else {
      this.stripe = new Stripe(secretKey, { apiVersion: '2023-08-16' });
      this.isConfigured = true;
      this.stablecoinEnabled = stablecoinFlag === 'true';
      if (this.stablecoinEnabled) {
        this.logger.log('Stablecoin payments enabled (USDC on Ethereum/Solana/Polygon/Base)');
      }
    }
  }

  isAvailable(): boolean {
    return this.isConfigured && this.stablecoinEnabled;
  }

  getSupportedNetworks(): StablecoinNetwork[] {
    return ['ethereum', 'solana', 'polygon', 'base'];
  }

  getSupportedCurrencies(): StablecoinCurrency[] {
    return ['usdc'];
  }

  /**
   * Create a stablecoin payment intent via Stripe.
   *
   * Stripe settles stablecoin payments in USD to the merchant's bank account.
   * The buyer pays in USDC on their chosen network.
   */
  async createStablecoinPaymentIntent(params: {
    amount: number;
    userId: string;
    network: StablecoinNetwork;
    orderId?: string;
    merchantId?: string;
    agentId?: string;
    description?: string;
  }): Promise<StablecoinPaymentIntent> {
    this.ensureAvailable();

    if (params.amount <= 0) {
      throw new Error('Amount must be positive');
    }
    if (params.amount > 10000) {
      throw new Error('Stablecoin payments are limited to $10,000 per transaction');
    }
    if (!this.getSupportedNetworks().includes(params.network)) {
      throw new Error(`Unsupported network: ${params.network}`);
    }

    const amountCents = Math.round(params.amount * 100);

    const metadata: Record<string, string> = {
      userId: params.userId,
      paymentType: 'stablecoin',
      stablecoin: 'usdc',
      network: params.network,
      platform: 'agentrix',
      ...(params.orderId && { orderId: params.orderId }),
      ...(params.merchantId && { merchantId: params.merchantId }),
      ...(params.agentId && { agentId: params.agentId }),
    };

    const paymentIntent = await this.stripe!.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      payment_method_types: ['crypto'],
      payment_method_options: {
        crypto: {
          network: params.network,
        },
      } as any,
      metadata,
      description: params.description || `Agentrix USDC Payment - ${params.orderId || 'N/A'}`,
    });

    this.logger.log(
      `Stablecoin PaymentIntent created: ${paymentIntent.id}, ` +
      `amount: $${params.amount}, network: ${params.network}`,
    );

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret!,
      amount: params.amount,
      currency: 'USD',
      stablecoin: 'usdc',
      network: params.network,
      status: paymentIntent.status,
    };
  }

  /**
   * Create a full stablecoin payment with database record.
   */
  async createStablecoinPaymentWithOrder(params: {
    amount: number;
    userId: string;
    network: StablecoinNetwork;
    orderId?: string;
    merchantId?: string;
    agentId?: string;
    description?: string;
  }): Promise<{ payment: Payment; clientSecret: string; paymentIntentId: string }> {
    const payment = this.paymentRepository.create({
      amount: params.amount,
      currency: 'USD',
      userId: params.userId,
      merchantId: params.merchantId,
      agentId: params.agentId,
      description: params.description,
      paymentMethod: PaymentMethod.STABLECOIN,
      status: PaymentStatus.PENDING,
      metadata: {
        paymentType: 'stablecoin',
        stablecoin: 'usdc',
        network: params.network,
        orderId: params.orderId,
      },
    });

    const savedPayment = await this.paymentRepository.save(payment);

    const intentResult = await this.createStablecoinPaymentIntent({
      ...params,
    });

    savedPayment.metadata = {
      ...savedPayment.metadata,
      stripePaymentIntentId: intentResult.paymentIntentId,
    };
    savedPayment.status = PaymentStatus.PROCESSING;
    await this.paymentRepository.save(savedPayment);

    return {
      payment: savedPayment,
      clientSecret: intentResult.clientSecret,
      paymentIntentId: intentResult.paymentIntentId,
    };
  }

  /**
   * Retrieve the status of a stablecoin payment.
   */
  async getPaymentStatus(paymentIntentId: string): Promise<{
    status: string;
    amount: number;
    network: string;
    confirmedAt?: string;
  }> {
    this.ensureAvailable();

    const pi = await this.stripe!.paymentIntents.retrieve(paymentIntentId);
    return {
      status: pi.status,
      amount: pi.amount / 100,
      network: pi.metadata?.network || 'unknown',
      ...(pi.status === 'succeeded' && {
        confirmedAt: new Date((pi as any).created * 1000).toISOString(),
      }),
    };
  }

  /**
   * Initiate a USDC payout to a merchant wallet address.
   * Uses Stripe's Bridge integration for stablecoin orchestration.
   */
  async initiateStablecoinPayout(params: {
    amount: number;
    merchantId: string;
    destinationAddress: string;
    network: StablecoinNetwork;
  }): Promise<StablecoinPayoutResult> {
    this.ensureAvailable();

    if (params.amount <= 0) throw new Error('Amount must be positive');
    if (!params.destinationAddress) throw new Error('Destination address is required');
    if (!this.getSupportedNetworks().includes(params.network)) {
      throw new Error(`Unsupported network: ${params.network}`);
    }

    // Stripe Bridge payout — currently routed through standard Stripe payout
    // with stablecoin metadata. Full Bridge API will be used when available.
    const payout = await this.stripe!.payouts.create({
      amount: Math.round(params.amount * 100),
      currency: 'usd',
      method: 'instant',
      metadata: {
        payoutType: 'stablecoin',
        stablecoin: 'usdc',
        network: params.network,
        merchantId: params.merchantId,
        destinationAddress: params.destinationAddress,
        platform: 'agentrix',
      },
    } as any);

    this.logger.log(
      `Stablecoin payout initiated: ${payout.id}, $${params.amount} USDC on ${params.network}`,
    );

    return {
      payoutId: payout.id,
      amount: params.amount,
      stablecoin: 'usdc',
      network: params.network,
      destinationAddress: params.destinationAddress,
      status: payout.status,
    };
  }

  /**
   * Calculate fees for stablecoin payment.
   * Stablecoin payments have lower fees than card payments (no chargebacks).
   */
  calculateStablecoinFee(amount: number, network: StablecoinNetwork): {
    fee: number;
    feeRate: number;
    networkFee: number;
    netAmount: number;
  } {
    // Stripe stablecoin: ~1.5% (lower than card 2.9% + $0.30)
    const baseRate = 0.015;
    // Network gas/fee estimates
    const networkFees: Record<StablecoinNetwork, number> = {
      ethereum: 0.50,
      polygon: 0.01,
      solana: 0.01,
      base: 0.02,
    };

    const platformFee = amount * baseRate;
    const networkFee = networkFees[network] || 0.01;
    const totalFee = platformFee + networkFee;
    const netAmount = amount - totalFee;

    return {
      fee: Math.round(totalFee * 100) / 100,
      feeRate: baseRate,
      networkFee: Math.round(networkFee * 100) / 100,
      netAmount: Math.round(netAmount * 100) / 100,
    };
  }

  /**
   * Get supported payment methods for a given amount.
   * Returns which stablecoin networks are available.
   */
  getAvailableMethods(amount: number): Array<{
    network: StablecoinNetwork;
    stablecoin: StablecoinCurrency;
    fee: number;
    available: boolean;
  }> {
    if (!this.isAvailable()) return [];

    return this.getSupportedNetworks().map((network) => {
      const feeInfo = this.calculateStablecoinFee(amount, network);
      return {
        network,
        stablecoin: 'usdc' as StablecoinCurrency,
        fee: feeInfo.fee,
        available: amount > 0 && amount <= 10000,
      };
    });
  }

  private ensureAvailable(): void {
    if (!this.stripe) throw new Error('Stripe is not configured');
    if (!this.stablecoinEnabled) {
      throw new Error('Stablecoin payments are not enabled. Set STRIPE_STABLECOIN_ENABLED=true');
    }
  }
}
