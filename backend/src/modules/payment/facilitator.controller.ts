import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { FacilitatorService } from './facilitator.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('X402 Facilitator')
@Controller('x402')
export class FacilitatorController {
    constructor(private readonly facilitatorService: FacilitatorService) {}

    @Post('verify')
    @ApiOperation({ summary: 'Verify payment signature' })
    @ApiResponse({ status: 200, description: 'Signature is valid' })
    @HttpCode(HttpStatus.OK)
    async verify(@Body() body: { signature: string; payload: any }) {
        const isValid = await this.facilitatorService.verifyPayment(body.signature, body.payload);
        return { valid: isValid };
    }

    @Post('settle')
    @ApiOperation({ summary: 'Settle payment on-chain' })
    @ApiResponse({ status: 200, description: 'Payment settled' })
    @HttpCode(HttpStatus.OK)
    async settle(@Body() body: { paymentId: string }) {
        const txHash = await this.facilitatorService.settlePayment(body.paymentId);
        return { txHash };
    }
}
