import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, In } from 'typeorm';
import { FundPath, FundPathType } from '../../../entities/fund-path.entity';
import { Payment } from '../../../entities/payment.entity';

export interface FundPathQueryDto {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  pathType?: FundPathType;
  isX402?: boolean;
  paymentId?: string;
  transactionHash?: string;
  search?: string;
}

export interface FundPathSummary {
  totalTransactions: number;
  totalVolume: string;
  x402Transactions: number;
  x402Volume: string;
  channelFeeTotal: string;
  platformFeeTotal: string;
  agentSharesTotal: string;
  merchantNetTotal: string;
}

@Injectable()
export class FundPathManagementService {
  private readonly logger = new Logger(FundPathManagementService.name);

  constructor(
    @InjectRepository(FundPath)
    private fundPathRepo: Repository<FundPath>,
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
  ) {}

  /**
   * Get paginated fund paths with filters
   */
  async getFundPaths(query: FundPathQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.fundPathRepo.createQueryBuilder('fp');

    if (query.startDate) {
      queryBuilder.andWhere('fp.createdAt >= :startDate', { 
        startDate: new Date(query.startDate) 
      });
    }
    if (query.endDate) {
      queryBuilder.andWhere('fp.createdAt <= :endDate', { 
        endDate: new Date(query.endDate) 
      });
    }
    if (query.pathType) {
      queryBuilder.andWhere('fp.pathType = :pathType', { pathType: query.pathType });
    }
    if (query.isX402 !== undefined) {
      queryBuilder.andWhere('fp.isX402 = :isX402', { isX402: query.isX402 });
    }
    if (query.paymentId) {
      queryBuilder.andWhere('fp.paymentId = :paymentId', { paymentId: query.paymentId });
    }
    if (query.transactionHash) {
      queryBuilder.andWhere('fp.transactionHash LIKE :txHash', { 
        txHash: `%${query.transactionHash}%` 
      });
    }
    if (query.search) {
      queryBuilder.andWhere(
        '(fp.toAddress LIKE :search OR fp.toLabel LIKE :search OR fp.description LIKE :search)',
        { search: `%${query.search}%` }
      );
    }

    const [items, total] = await queryBuilder
      .orderBy('fp.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get fund paths grouped by payment/transaction
   */
  async getFundPathsByTransaction(paymentId: string) {
    const fundPaths = await this.fundPathRepo.find({
      where: { paymentId },
      order: { createdAt: 'ASC' },
    });

    // Get related payment info
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
    });

    // Group by path type for summary
    const summary = {
      paymentId,
      transactionHash: fundPaths[0]?.transactionHash,
      isX402: fundPaths[0]?.isX402 || false,
      totalAmount: payment?.amount || '0',
      currency: payment?.currency || 'USDT',
      createdAt: payment?.createdAt,
      paths: fundPaths,
      breakdown: {
        merchantNet: this.sumByType(fundPaths, FundPathType.MERCHANT_NET),
        platformFee: this.sumByType(fundPaths, FundPathType.PLATFORM_FEE),
        channelFee: this.sumByType(fundPaths, FundPathType.CHANNEL_FEE),
        promoterShare: this.sumByType(fundPaths, FundPathType.PROMOTER_SHARE),
        executorShare: this.sumByType(fundPaths, FundPathType.EXECUTOR_SHARE),
        referrerShare: this.sumByType(fundPaths, FundPathType.REFERRER_SHARE),
        platformFund: this.sumByType(fundPaths, FundPathType.PLATFORM_FUND),
      },
    };

    return summary;
  }

  /**
   * Get fund paths by transaction hash
   */
  async getFundPathsByTxHash(transactionHash: string) {
    const fundPaths = await this.fundPathRepo.find({
      where: { transactionHash },
      order: { createdAt: 'ASC' },
    });

    if (fundPaths.length === 0) {
      return null;
    }

    return this.getFundPathsByTransaction(fundPaths[0].paymentId);
  }

  /**
   * Get aggregated fund path statistics
   */
  async getFundPathStatistics(query: { startDate?: string; endDate?: string } = {}): Promise<FundPathSummary> {
    const queryBuilder = this.fundPathRepo.createQueryBuilder('fp');

    if (query.startDate) {
      queryBuilder.andWhere('fp.createdAt >= :startDate', { 
        startDate: new Date(query.startDate) 
      });
    }
    if (query.endDate) {
      queryBuilder.andWhere('fp.createdAt <= :endDate', { 
        endDate: new Date(query.endDate) 
      });
    }

    // Get total unique payments
    const totalResult = await queryBuilder
      .clone()
      .select('COUNT(DISTINCT fp.paymentId)', 'count')
      .getRawOne();

    // Get X402 specific stats
    const x402Result = await queryBuilder
      .clone()
      .andWhere('fp.isX402 = true')
      .select('COUNT(DISTINCT fp.paymentId)', 'count')
      .getRawOne();

    // Get channel fee total
    const channelFeeResult = await queryBuilder
      .clone()
      .andWhere('fp.pathType = :type', { type: FundPathType.CHANNEL_FEE })
      .select('COALESCE(SUM(CAST(fp.amount AS DECIMAL)), 0)', 'total')
      .getRawOne();

    // Get platform fee total
    const platformFeeResult = await queryBuilder
      .clone()
      .andWhere('fp.pathType = :type', { type: FundPathType.PLATFORM_FEE })
      .select('COALESCE(SUM(CAST(fp.amount AS DECIMAL)), 0)', 'total')
      .getRawOne();

    // Get agent shares total
    const agentSharesResult = await queryBuilder
      .clone()
      .andWhere('fp.pathType IN (:...types)', { 
        types: [FundPathType.EXECUTOR_SHARE, FundPathType.REFERRER_SHARE, FundPathType.PROMOTER_SHARE] 
      })
      .select('COALESCE(SUM(CAST(fp.amount AS DECIMAL)), 0)', 'total')
      .getRawOne();

    // Get merchant net total
    const merchantNetResult = await queryBuilder
      .clone()
      .andWhere('fp.pathType = :type', { type: FundPathType.MERCHANT_NET })
      .select('COALESCE(SUM(CAST(fp.amount AS DECIMAL)), 0)', 'total')
      .getRawOne();

    // Calculate total volume from merchant net (represents total transaction value processed)
    const totalVolumeResult = await queryBuilder
      .clone()
      .andWhere('fp.pathType = :type', { type: FundPathType.MERCHANT_NET })
      .select('COALESCE(SUM(CAST(fp.amount AS DECIMAL)), 0)', 'total')
      .getRawOne();

    return {
      totalTransactions: parseInt(totalResult?.count || '0'),
      totalVolume: (parseFloat(totalVolumeResult?.total || '0') / 0.97).toFixed(6), // Estimate from merchant net
      x402Transactions: parseInt(x402Result?.count || '0'),
      x402Volume: '0', // Would need separate calculation
      channelFeeTotal: parseFloat(channelFeeResult?.total || '0').toFixed(6),
      platformFeeTotal: parseFloat(platformFeeResult?.total || '0').toFixed(6),
      agentSharesTotal: parseFloat(agentSharesResult?.total || '0').toFixed(6),
      merchantNetTotal: parseFloat(merchantNetResult?.total || '0').toFixed(6),
    };
  }

  /**
   * Get recent transactions with fund paths
   */
  async getRecentTransactions(limit: number = 10) {
    // Get unique payment IDs from recent fund paths
    const recentPaths = await this.fundPathRepo
      .createQueryBuilder('fp')
      .select('DISTINCT fp.paymentId', 'paymentId')
      .addSelect('MAX(fp.createdAt)', 'latestAt')
      .groupBy('fp.paymentId')
      .orderBy('MAX(fp.createdAt)', 'DESC')
      .limit(limit)
      .getRawMany();

    const transactions = await Promise.all(
      recentPaths.map(async (item) => {
        return this.getFundPathsByTransaction(item.paymentId);
      })
    );

    return transactions.filter(t => t !== null);
  }

  /**
   * Helper to sum amounts by path type
   */
  private sumByType(paths: FundPath[], type: FundPathType): string {
    const sum = paths
      .filter(p => p.pathType === type)
      .reduce((acc, p) => acc + parseFloat(p.amount || '0'), 0);
    return sum.toFixed(6);
  }
}
