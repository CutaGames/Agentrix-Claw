/**
 * SignRequestController — P-9 Companion Redesign Task 0.6.
 *
 * Endpoints under `/v1/wallet/sign-request` for the Trust3_Signing_Sheet
 * flow. The mobile companion ball and all originator surfaces share this
 * single endpoint family.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SignRequestService } from './sign-request.service';
import type { SignRequestReason } from './sign-request.entity';

interface CreateSignRequestBody {
  reason: SignRequestReason;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
  originDeviceId?: string | null;
  timeoutSeconds?: number;
}

interface CompleteSignRequestBody {
  signature: string;
}

interface CancelSignRequestBody {
  reason?: string;
}

@ApiTags('wallet/sign-request')
@Controller('v1/wallet/sign-request')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SignRequestController {
  constructor(private readonly svc: SignRequestService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a sign-request (Trust3_Signing_Sheet entry point)',
    description:
      'Originator creates a sign-request; mobile receives presence event and presents biometric sheet.',
  })
  async create(@Request() req: any, @Body() body: CreateSignRequestBody) {
    const userId = req.user?.id || req.user?.sub;
    const row = await this.svc.create({
      userId,
      reason: body.reason,
      metadata: body.metadata,
      idempotencyKey: body.idempotencyKey,
      originDeviceId: body.originDeviceId,
      timeoutSeconds: body.timeoutSeconds,
    });
    return {
      id: row.id,
      status: row.status,
      reason: row.reason,
      metadata: row.metadata,
      signature: row.signature,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      // Indicates idempotency hit (signature already cached) so originator
      // can skip waiting and proceed immediately.
      cachedHit: row.status === 'completed',
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Poll sign-request status' })
  async findOne(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id || req.user?.sub;
    const row = await this.svc.findById(id, userId);
    return {
      id: row.id,
      status: row.status,
      reason: row.reason,
      metadata: row.metadata,
      signature: row.signature,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    };
  }

  @Post(':id/complete')
  @ApiOperation({
    summary: 'Submit user-signed signature (mobile after biometric)',
  })
  async complete(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: CompleteSignRequestBody,
  ) {
    const userId = req.user?.id || req.user?.sub;
    const row = await this.svc.complete(id, userId, body.signature);
    return {
      id: row.id,
      status: row.status,
      signature: row.signature,
      completedAt: row.completedAt,
    };
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a pending sign-request (user pressed Cancel or 60s timeout)',
  })
  async cancel(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: CancelSignRequestBody,
  ) {
    const userId = req.user?.id || req.user?.sub;
    const row = await this.svc.cancel(id, userId, body.reason);
    return {
      id: row.id,
      status: row.status,
    };
  }
}
