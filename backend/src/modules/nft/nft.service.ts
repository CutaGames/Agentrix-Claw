import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NFTCollection, NFTCollectionStatus, NFTChain, NFTStandard } from '../../entities/nft-collection.entity';
import { NFT, NFTStatus } from '../../entities/nft.entity';
import { ProductService } from '../product/product.service';
import { ContractDeploymentService } from '../contract/contract-deployment.service';
import { MetadataStorageService } from '../metadata/metadata-storage.service';

export interface NFTCollectionRequest {
  name: string;
  description?: string;
  chain: NFTChain;
  standard: NFTStandard;
  royalty: number;
  royaltyRecipients?: Array<{
    address: string;
    percentage: number;
  }>;
  image?: string;
}

export interface NFTMintItem {
  name: string;
  description?: string;
  image: string | File;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  price?: number;
  currency?: string;
}

export interface NFTMintRequest {
  items: NFTMintItem[];
  uploadTo: 'ipfs' | 'arweave';
  autoList?: boolean;
}

@Injectable()
export class NFTService {
  private readonly logger = new Logger(NFTService.name);

  constructor(
    @InjectRepository(NFTCollection)
    private collectionRepository: Repository<NFTCollection>,
    @InjectRepository(NFT)
    private nftRepository: Repository<NFT>,
    private productService: ProductService,
    private contractDeploymentService: ContractDeploymentService,
    private metadataStorageService: MetadataStorageService,
  ) {}

  /**
   * 创建 NFT 集合
   */
  async createCollection(userId: string, request: NFTCollectionRequest): Promise<{
    collectionId: string;
    contractAddress: string;
    transactionHash: string;
    status: NFTCollectionStatus;
  }> {
    // 验证输入
    this.validateCollectionRequest(request);

    // 创建集合记录
    const collection = this.collectionRepository.create({
      name: request.name,
      description: request.description,
      chain: request.chain,
      standard: request.standard,
      status: NFTCollectionStatus.DRAFT,
      royalty: request.royalty,
      royaltyRecipients: request.royaltyRecipients,
      image: request.image,
      userId,
      stats: {
        totalSupply: 0,
        minted: 0,
        sold: 0,
        totalVolume: '0',
        floorPrice: '0',
        owners: 0,
      },
    });

    const savedCollection = await this.collectionRepository.save(collection);

    // 异步部署智能合约
    this.deployCollectionContract(savedCollection.id, request).catch((error) => {
      this.logger.error(`NFT 集合 ${savedCollection.id} 合约部署失败:`, error);
      this.collectionRepository.update(savedCollection.id, {
        status: NFTCollectionStatus.FAILED,
        metadata: { error: error.message },
      });
    });

    return {
      collectionId: savedCollection.id,
      contractAddress: '', // 部署中
      transactionHash: '', // 部署中
      status: NFTCollectionStatus.DEPLOYING,
    };
  }

  /**
   * 部署 NFT 集合合约
   */
  private async deployCollectionContract(
    collectionId: string,
    request: NFTCollectionRequest,
  ): Promise<void> {
    const collection = await this.collectionRepository.findOne({ where: { id: collectionId } });
    if (!collection) {
      throw new NotFoundException('NFT 集合不存在');
    }

    try {
      // 更新状态为部署中
      await this.collectionRepository.update(collectionId, {
        status: NFTCollectionStatus.DEPLOYING,
      });

      // 调用合约部署服务
      const deploymentResult = await this.contractDeploymentService.deployNFTCollectionContract({
        name: request.name,
        symbol: this.generateCollectionSymbol(request.name),
        chain: request.chain,
        standard: request.standard,
        royalty: request.royalty,
        royaltyRecipients: request.royaltyRecipients,
      });

      // 更新集合记录
      await this.collectionRepository.update(collectionId, {
        status: NFTCollectionStatus.DEPLOYED,
        contractAddress: deploymentResult.contractAddress,
        transactionHash: deploymentResult.transactionHash,
      });

      this.logger.log(`NFT 集合 ${collectionId} 合约部署成功: ${deploymentResult.contractAddress}`);
    } catch (error) {
      this.logger.error(`NFT 集合 ${collectionId} 合约部署失败:`, error);
      await this.collectionRepository.update(collectionId, {
        status: NFTCollectionStatus.FAILED,
        metadata: { error: error.message },
      });
      throw error;
    }
  }

  /**
   * 批量 Mint NFT
   */
  async mint(
    collectionId: string,
    userId: string,
    request: NFTMintRequest,
  ): Promise<{
    minted: number;
    failed: number;
    nfts: Array<{
      tokenId: string;
      productId: string;
      metadataURI: string;
      status: 'minting' | 'minted' | 'failed';
      transactionHash?: string;
      error?: string;
    }>;
  }> {
    const collection = await this.collectionRepository.findOne({ where: { id: collectionId } });
    if (!collection) {
      throw new NotFoundException('NFT 集合不存在');
    }

    if (collection.status !== NFTCollectionStatus.DEPLOYED) {
      throw new BadRequestException('NFT 集合尚未部署完成');
    }

    if (!collection.contractAddress) {
      throw new BadRequestException('NFT 集合合约地址不存在');
    }

    const results: Array<{
      tokenId: string;
      productId: string;
      metadataURI: string;
      status: 'minting' | 'minted' | 'failed';
      transactionHash?: string;
      error?: string;
    }> = [];

    let minted = 0;
    let failed = 0;

    // 批量处理每个 NFT
    for (const item of request.items) {
      try {
        // 上传图片到 IPFS/Arweave
        let imageURI: string;
        if (typeof item.image === 'string') {
          imageURI = item.image;
        } else {
          imageURI = await this.metadataStorageService.uploadFile(item.image, request.uploadTo);
        }

        // 创建元数据
        const metadata = {
          name: item.name,
          description: item.description,
          image: imageURI,
          attributes: item.attributes || [],
        };

        // 上传元数据到 IPFS/Arweave
        const metadataURI = await this.metadataStorageService.uploadMetadata(metadata, request.uploadTo);

        // 创建 NFT 记录
        const nft = this.nftRepository.create({
          collectionId,
          name: item.name,
          description: item.description,
          image: imageURI,
          attributes: item.attributes,
          status: NFTStatus.MINTING,
          metadataURI,
          price: item.price ? item.price.toString() : undefined,
          currency: item.currency || 'USDC',
          owner: userId, // 暂时使用 userId，实际应该是钱包地址
          creator: userId,
          userId,
        });

        const savedNFT = await this.nftRepository.save(nft);

        // 如果设置了价格，创建对应的 Product 记录
        let productId: string | undefined;
        if (item.price && request.autoList) {
          try {
            const currency = item.currency || 'USDC';
            const product = await this.productService.createProduct(userId, {
              name: item.name,
              description: item.description || '',
              price: {
                amount: item.price,
                currency: currency,
              },
              inventory: {
                type: 'digital',
                quantity: 1,
              },
              category: 'nft',
              productType: 'nft' as any,
              commissionRate: 0, // NFT 默认不分润
              metadata: {
                core: {
                  media: {
                    images: imageURI ? [{
                      url: imageURI,
                      type: 'thumbnail' as const,
                    }] : [],
                  },
                },
                extensions: {
                  nftId: savedNFT.id,
                  collectionId,
                  image: imageURI,
                  metadataURI,
                  type: 'nft',
                  currency: currency,
                },
              },
            });
            
            productId = product.id;
            savedNFT.productId = productId;
            await this.nftRepository.save(savedNFT);
          } catch (error) {
            this.logger.error('创建 Product 失败:', error);
          }
        }

        // 异步调用合约进行 Mint
        this.mintNFTOnChain(savedNFT.id, collection, metadataURI).catch((error) => {
          this.logger.error(`NFT ${savedNFT.id} Mint 失败:`, error);
          this.nftRepository.update(savedNFT.id, {
            status: NFTStatus.FAILED,
            metadata: { error: error.message },
          });
        });

        results.push({
          tokenId: savedNFT.id,
          productId: productId || '',
          metadataURI,
          status: 'minting',
        });

        minted++;
      } catch (error: any) {
        this.logger.error(`处理 NFT 项目失败:`, error);
        results.push({
          tokenId: '',
          productId: '',
          metadataURI: '',
          status: 'failed',
          error: error.message,
        });
        failed++;
      }
    }

    // 更新集合统计数据
    await this.collectionRepository.update(collectionId, {
      stats: {
        ...collection.stats,
        totalSupply: (collection.stats?.totalSupply || 0) + request.items.length,
        minted: (collection.stats?.minted || 0) + minted,
      },
    });

    return {
      minted,
      failed,
      nfts: results,
    };
  }

  /**
   * 在链上 Mint NFT
   */
  private async mintNFTOnChain(
    nftId: string,
    collection: NFTCollection,
    metadataURI: string,
  ): Promise<void> {
    const nft = await this.nftRepository.findOne({ where: { id: nftId } });
    if (!nft) {
      throw new NotFoundException('NFT 不存在');
    }

    try {
      // 调用合约部署服务进行 Mint
      const mintResult = await this.contractDeploymentService.mintNFT({
        collectionAddress: collection.contractAddress!,
        to: nft.owner,
        tokenURI: metadataURI,
        chain: collection.chain,
        standard: collection.standard,
      });

      // 更新 NFT 记录
      await this.nftRepository.update(nftId, {
        status: NFTStatus.MINTED,
        tokenId: mintResult.tokenId,
        transactionHash: mintResult.transactionHash,
      });

      this.logger.log(`NFT ${nftId} Mint 成功: ${mintResult.tokenId}`);
    } catch (error) {
      this.logger.error(`NFT ${nftId} Mint 失败:`, error);
      await this.nftRepository.update(nftId, {
        status: NFTStatus.FAILED,
        metadata: { error: error.message },
      });
      throw error;
    }
  }

  /**
   * 查询 Mint 状态
   */
  async getMintStatus(collectionId: string): Promise<{
    total: number;
    minted: number;
    failed: number;
    nfts: Array<{
      tokenId: string;
      status: 'minting' | 'minted' | 'failed';
      transactionHash?: string;
      metadataURI?: string;
      error?: string;
    }>;
  }> {
    const nfts = await this.nftRepository.find({
      where: { collectionId },
      order: { createdAt: 'DESC' },
    });

    const minted = nfts.filter((n) => n.status === NFTStatus.MINTED).length;
    const failed = nfts.filter((n) => n.status === NFTStatus.FAILED).length;

    return {
      total: nfts.length,
      minted,
      failed,
      nfts: nfts.map((nft) => ({
        tokenId: nft.id,
        status:
          nft.status === NFTStatus.MINTED
            ? 'minted'
            : nft.status === NFTStatus.FAILED
              ? 'failed'
              : 'minting',
        transactionHash: nft.transactionHash,
        metadataURI: nft.metadataURI,
        error: nft.metadata?.error,
      })),
    };
  }

  /**
   * 购买 NFT
   */
  async buy(
    nftId: string,
    userId: string,
    paymentMethod: 'usdc' | 'usdt' | 'wallet',
    walletAddress?: string,
  ): Promise<{
    transactionHash: string;
    nftId: string;
    payment: number;
    royalty: number;
    sellerAmount: number;
  }> {
    const nft = await this.nftRepository.findOne({ where: { id: nftId } });
    if (!nft) {
      throw new NotFoundException('NFT 不存在');
    }

    if (nft.status !== NFTStatus.LISTED && nft.status !== NFTStatus.MINTED) {
      throw new BadRequestException('NFT 未上架或不可购买');
    }

    if (!nft.price) {
      throw new BadRequestException('NFT 未设置价格');
    }

    const price = parseFloat(nft.price);
    const royalty = price * (nft.collection?.royalty || 0);
    const sellerAmount = price - royalty;

    // 这里应该调用支付服务处理支付
    // 然后调用合约服务执行 NFT 转账
    // 暂时返回模拟结果
    const transactionHash = `0x${Math.random().toString(16).substring(2, 66)}`;

    // 更新 NFT 状态
    await this.nftRepository.update(nftId, {
      status: NFTStatus.SOLD,
      owner: walletAddress || userId,
      salesHistory: [
        ...(nft.salesHistory || []),
        {
          buyer: walletAddress || userId,
          price: nft.price,
          currency: nft.currency || 'USDC',
          timestamp: new Date(),
          transactionHash,
        },
      ],
    });

    // 更新集合统计数据
    if (nft.collectionId) {
      const collection = await this.collectionRepository.findOne({
        where: { id: nft.collectionId },
      });
      if (collection) {
        const currentVolume = parseFloat(collection.stats?.totalVolume || '0');
        await this.collectionRepository.update(nft.collectionId, {
          stats: {
            ...collection.stats,
            sold: (collection.stats?.sold || 0) + 1,
            totalVolume: (currentVolume + price).toString(),
          },
        });
      }
    }

    return {
      transactionHash,
      nftId,
      payment: price,
      royalty,
      sellerAmount,
    };
  }

  /**
   * 上架 NFT
   */
  async list(nftId: string, price: number, currency?: string): Promise<{ success: boolean; listedPrice: number }> {
    const nft = await this.nftRepository.findOne({ where: { id: nftId } });
    if (!nft) {
      throw new NotFoundException('NFT 不存在');
    }

    if (nft.status !== NFTStatus.MINTED) {
      throw new BadRequestException('NFT 尚未 Mint 完成');
    }

    await this.nftRepository.update(nftId, {
      status: NFTStatus.LISTED,
      price: price.toString(),
      currency: currency || 'USDC',
    });

    return {
      success: true,
      listedPrice: price,
    };
  }

  /**
   * 下架 NFT
   */
  async delist(nftId: string): Promise<{ success: boolean }> {
    const nft = await this.nftRepository.findOne({ where: { id: nftId } });
    if (!nft) {
      throw new NotFoundException('NFT 不存在');
    }

    await this.nftRepository.update(nftId, {
      status: NFTStatus.MINTED,
    });

    return {
      success: true,
    };
  }

  /**
   * 查询 NFT 销售信息
   */
  async getSaleInfo(nftId: string): Promise<{
    price: number;
    isListed: boolean;
    owner: string;
    creator: string;
    royalty: number;
    salesHistory?: Array<{
      buyer: string;
      price: number;
      timestamp: Date;
    }>;
  }> {
    const nft = await this.nftRepository.findOne({
      where: { id: nftId },
      relations: ['collection'],
    });
    if (!nft) {
      throw new NotFoundException('NFT 不存在');
    }

    return {
      price: nft.price ? parseFloat(nft.price) : 0,
      isListed: nft.status === NFTStatus.LISTED,
      owner: nft.owner,
      creator: nft.creator,
      royalty: nft.collection?.royalty || 0,
      salesHistory: nft.salesHistory?.map((sale) => ({
        buyer: sale.buyer,
        price: parseFloat(sale.price),
        timestamp: sale.timestamp,
      })),
    };
  }

  /**
   * 更新 NFT 价格
   */
  async updatePrice(nftId: string, price: number, currency?: string): Promise<{ success: boolean; newPrice: number }> {
    const nft = await this.nftRepository.findOne({ where: { id: nftId } });
    if (!nft) {
      throw new NotFoundException('NFT 不存在');
    }

    await this.nftRepository.update(nftId, {
      price: price.toString(),
      currency: currency || nft.currency || 'USDC',
    });

    // 更新对应的 Product 价格
    if (nft.productId && nft.userId) {
      try {
        await this.productService.updateProduct(nft.userId, nft.productId, {
          price,
        });
      } catch (error) {
        this.logger.error('更新 Product 价格失败:', error);
      }
    }

    return {
      success: true,
      newPrice: price,
    };
  }

  /**
   * 验证集合创建请求
   */
  private validateCollectionRequest(request: NFTCollectionRequest): void {
    if (!request.name || request.name.trim().length === 0) {
      throw new BadRequestException('集合名称不能为空');
    }

    if (request.royalty < 0 || request.royalty > 1) {
      throw new BadRequestException('版税比例必须在0-1之间');
    }
  }

  /**
   * 生成集合符号（从名称中提取）
   */
  private generateCollectionSymbol(name: string): string {
    // 简单实现：取名称的前3-5个大写字母
    const words = name.split(' ');
    if (words.length === 1) {
      return name.substring(0, 5).toUpperCase();
    }
    return words
      .map((w) => w[0])
      .join('')
      .substring(0, 5)
      .toUpperCase();
  }
}

