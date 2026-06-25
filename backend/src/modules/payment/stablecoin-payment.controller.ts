import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { StablecoinPaymentService, type StablecoinNetwork } from './stablecoin-payment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('stablecoin-payments')
export class StablecoinPaymentController {
  constructor(private readonly stablecoinService: StablecoinPaymentService) {}

  /**
   * GET /stablecoin-payments/status
   * Check if stablecoin payments are available.
   */
  @Get('status')
  getStatus() {
    return {
      available: this.stablecoinService.isAvailable(),
      supportedNetworks: this.stablecoinService.getSupportedNetworks(),
      supportedCurrencies: this.stablecoinService.getSupportedCurrencies(),
      maxAmount: 10000,
      currency: 'USD',
    };
  }

  /**
   * GET /stablecoin-payments/fees?amount=100&network=polygon
   * Calculate fees for a given amount and network.
   */
  @Get('fees')
  calculateFees(
    @Query('amount') amountStr: string,
    @Query('network') network: StablecoinNetwork,
  ) {
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return { error: 'Invalid amount' };
    }
    return this.stablecoinService.calculateStablecoinFee(amount, network);
  }

  /**
   * GET /stablecoin-payments/methods?amount=100
   * Get available stablecoin payment methods for a given amount.
   */
  @Get('methods')
  getAvailableMethods(@Query('amount') amountStr: string) {
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return { methods: [] };
    }
    return { methods: this.stablecoinService.getAvailableMethods(amount) };
  }

  /**
   * POST /stablecoin-payments/create-intent
   * Create a stablecoin payment intent.
   */
  @Post('create-intent')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createPaymentIntent(
    @Request() req: any,
    @Body() body: {
      amount: number;
      network: StablecoinNetwork;
      orderId?: string;
      merchantId?: string;
      agentId?: string;
      description?: string;
    },
  ) {
    return this.stablecoinService.createStablecoinPaymentIntent({
      ...body,
      userId: req.user?.userId || req.user?.sub,
    });
  }

  /**
   * POST /stablecoin-payments/create-payment
   * Create a full stablecoin payment with database record.
   */
  @Post('create-payment')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createPayment(
    @Request() req: any,
    @Body() body: {
      amount: number;
      network: StablecoinNetwork;
      orderId?: string;
      merchantId?: string;
      agentId?: string;
      description?: string;
    },
  ) {
    const result = await this.stablecoinService.createStablecoinPaymentWithOrder({
      ...body,
      userId: req.user?.userId || req.user?.sub,
    });
    return {
      paymentId: result.payment.id,
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
    };
  }

  /**
   * GET /stablecoin-payments/:paymentIntentId/status
   * Check the status of a stablecoin payment.
   */
  @Get(':paymentIntentId/status')
  async getPaymentStatus(@Param('paymentIntentId') paymentIntentId: string) {
    return this.stablecoinService.getPaymentStatus(paymentIntentId);
  }

  /**
   * POST /stablecoin-payments/payout
   * Initiate a USDC payout to a merchant wallet.
   */
  @Post('payout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async initiatePayout(
    @Body() body: {
      amount: number;
      merchantId: string;
      destinationAddress: string;
      network: StablecoinNetwork;
    },
  ) {
    return this.stablecoinService.initiateStablecoinPayout(body);
  }
}
