import {
  Controller,
  Post,
  Body,
  Headers,
  RawBodyRequest,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StripeWebhookService } from './stripe-webhook.service';
import { Request } from 'express';

@ApiTags('payments')
@Controller('payments/webhook')
export class StripeWebhookController {
  constructor(private readonly webhookService: StripeWebhookService) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe Webhook回调' })
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    return this.webhookService.handleWebhook(rawBody, signature);
  }
}

