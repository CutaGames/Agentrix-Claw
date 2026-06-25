import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NFTService, NFTCollectionRequest, NFTMintRequest } from './nft.service';

@Controller('nfts')
@UseGuards(JwtAuthGuard)
export class NFTController {
  constructor(private readonly nftService: NFTService) {}

  /**
   * 创建 NFT 集合
   */
  @Post('collections')
  async createCollection(@Request() req, @Body() dto: NFTCollectionRequest) {
    return this.nftService.createCollection(req.user.id, dto);
  }

  /**
   * 批量 Mint NFT
   */
  @Post('collections/:collectionId/mint')
  @UseInterceptors(FilesInterceptor('files'))
  async mint(
    @Request() req,
    @Param('collectionId') collectionId: string,
    @Body() dto: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    // 处理文件上传和表单数据
    const items = this.parseMintItems(dto, files);
    const request: NFTMintRequest = {
      items,
      uploadTo: dto.uploadTo || 'ipfs',
      autoList: dto.autoList === 'true' || dto.autoList === true,
    };
    return this.nftService.mint(collectionId, req.user.id, request);
  }

  /**
   * 查询 Mint 状态
   */
  @Get('collections/:collectionId/mint-status')
  async getMintStatus(@Param('collectionId') collectionId: string) {
    return this.nftService.getMintStatus(collectionId);
  }

  /**
   * 购买 NFT
   */
  @Post(':id/buy')
  async buy(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: { paymentMethod: 'usdc' | 'usdt' | 'wallet'; walletAddress?: string },
  ) {
    return this.nftService.buy(id, req.user.id, dto.paymentMethod, dto.walletAddress);
  }

  /**
   * 上架 NFT
   */
  @Post(':id/list')
  async list(@Param('id') id: string, @Body() dto: { price: number; currency?: string }) {
    return this.nftService.list(id, dto.price, dto.currency);
  }

  /**
   * 下架 NFT
   */
  @Post(':id/delist')
  async delist(@Param('id') id: string) {
    return this.nftService.delist(id);
  }

  /**
   * 查询 NFT 销售信息
   */
  @Get(':id/sale')
  async getSaleInfo(@Param('id') id: string) {
    return this.nftService.getSaleInfo(id);
  }

  /**
   * 更新 NFT 价格
   */
  @Patch(':id/price')
  async updatePrice(
    @Param('id') id: string,
    @Body() dto: { price: number; currency?: string },
  ) {
    return this.nftService.updatePrice(id, dto.price, dto.currency);
  }

  /**
   * 解析 Mint 项目（从表单数据和文件）
   */
  private parseMintItems(dto: any, files: Express.Multer.File[]): Array<{
    name: string;
    description?: string;
    image: File;
    attributes?: Array<{ trait_type: string; value: string | number }>;
    price?: number;
    currency?: string;
  }> {
    const items: any[] = [];
    const itemsData = Array.isArray(dto.items) ? dto.items : JSON.parse(dto.items || '[]');

    itemsData.forEach((itemData: any, index: number) => {
      const file = files[index];
      items.push({
        name: itemData.name || `NFT #${index + 1}`,
        description: itemData.description,
        image: file || itemData.image,
        attributes: itemData.attributes ? JSON.parse(itemData.attributes) : undefined,
        price: itemData.price ? parseFloat(itemData.price) : undefined,
        currency: itemData.currency || 'USDC',
      });
    });

    return items;
  }
}

