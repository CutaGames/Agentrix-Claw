import { Body, Controller, Headers, HttpCode, Param, Post, UnauthorizedException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { ConfigService } from '@nestjs/config';

@Controller('payments/provider/webhook')
export class ProviderWebhookController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly configService: ConfigService,
  ) {}

  @Post(':providerId')
  @HttpCode(200)
  async handleProviderWebhook(
    @Param('providerId') providerId: string,
    @Body() body: { sessionId: string; status: string; txHash?: string; secret?: string },
    @Headers('x-provider-signature') signature?: string,
  ) {
    const sharedSecret = this.configService.get<string>('PROVIDER_WEBHOOK_SECRET');
    if (sharedSecret && body.secret !== sharedSecret && signature !== sharedSecret) {
      throw new UnauthorizedException('Invalid provider webhook signature');
    }

    await this.paymentService.handleProviderWebhook(providerId, {
      sessionId: body.sessionId,
      status: body.status,
      txHash: body.txHash,
    });

    return { ok: true };
  }
}

