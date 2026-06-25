import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { OnChainIndexerService } from './onchain-indexer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('onchain-indexer')
@Controller('onchain-indexer')
export class OnChainIndexerController {
  constructor(private readonly indexerService: OnChainIndexerService) {}

  @Post('index')
  @ApiOperation({ summary: '索引链上资产（V3.0：多链资产索引与统一SKU化）' })
  @ApiResponse({ status: 201, description: '返回索引的商品' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async indexAsset(
    @Request() req: any,
    @Body() body: {
      asset: {
        contract: string;
        tokenId?: string;
        chain: 'solana' | 'ethereum' | 'bsc' | 'polygon';
        name: string;
        description?: string;
        image?: string;
        attributes?: any[];
        owner: string;
      };
      price: number;
      currency?: string;
    },
  ) {
    return this.indexerService.indexOnChainAsset(
      req.user?.id,
      body.asset,
      body.price,
      body.currency,
    );
  }

  @Post('batch-index')
  @ApiOperation({ summary: '批量索引链上资产' })
  @ApiResponse({ status: 201, description: '返回索引的商品列表' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async batchIndex(
    @Request() req: any,
    @Body() body: {
      assets: Array<{
        asset: {
          contract: string;
          tokenId?: string;
          chain: 'solana' | 'ethereum' | 'bsc' | 'polygon';
          name: string;
          description?: string;
          image?: string;
          attributes?: any[];
          owner: string;
        };
        price: number;
        currency?: string;
      }>;
    },
  ) {
    return this.indexerService.batchIndexAssets(req.user?.id, body.assets);
  }

  @Post('validate')
  @ApiOperation({ summary: '验证链上资产（V3.0：盗版/黑名单过滤）' })
  @ApiResponse({ status: 200, description: '返回验证结果' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async validateAsset(
    @Body() body: {
      asset: {
        contract: string;
        tokenId?: string;
        chain: 'solana' | 'ethereum' | 'bsc' | 'polygon';
        name: string;
        owner: string;
      };
    },
  ) {
    return this.indexerService.validateAsset(body.asset);
  }

  @Post('sync')
  @ApiOperation({ summary: '同步链上资产（从链上读取并索引）' })
  @ApiResponse({ status: 200, description: '返回同步的商品列表' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async syncAssets(
    @Request() req: any,
    @Body() body: {
      chain: 'solana' | 'ethereum' | 'bsc' | 'polygon';
      contract: string;
    },
  ) {
    return this.indexerService.syncChainAssets(
      body.chain,
      body.contract,
      req.user?.id,
    );
  }
}

