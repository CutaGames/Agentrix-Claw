import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { Coupon, CouponType, CouponStatus } from '../../entities/coupon.entity';
import { MarketingCampaign, CampaignType, CampaignStatus } from '../../entities/marketing-campaign.entity';

export interface AutoMarketingConfig {
  merchantId: string;
  enabled: boolean;
  strategies: {
    abandonedCart?: {
      enabled: boolean;
      delayHours: number;
      discountPercent?: number;
    };
    newCustomer?: {
      enabled: boolean;
      welcomeDiscount?: number;
    };
    repeatCustomer?: {
      enabled: boolean;
      loyaltyReward?: number;
    };
    lowStock?: {
      enabled: boolean;
      threshold: number;
    };
    priceDrop?: {
      enabled: boolean;
      dropPercent: number;
    };
  };
}

@Injectable()
export class MerchantAutoMarketingService {
  private readonly logger = new Logger(MerchantAutoMarketingService.name);
  private configs: Map<string, AutoMarketingConfig> = new Map(); // 配置仍使用内存，可后续迁移

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
    @InjectRepository(MarketingCampaign)
    private campaignRepository: Repository<MarketingCampaign>,
  ) {}

  /**
   * 配置自动营销
   */
  async configureAutoMarketing(config: AutoMarketingConfig): Promise<AutoMarketingConfig> {
    this.configs.set(config.merchantId, config);
    this.logger.log(`配置自动营销: merchantId=${config.merchantId}, enabled=${config.enabled}`);
    return config;
  }

  /**
   * 获取自动营销配置
   */
  async getAutoMarketingConfig(merchantId: string): Promise<AutoMarketingConfig | null> {
    return this.configs.get(merchantId) || null;
  }

  /**
   * 检测并触发营销活动
   */
  async triggerMarketingCampaigns(merchantId: string): Promise<MarketingCampaign[]> {
    const config = await this.getAutoMarketingConfig(merchantId);

    if (!config || !config.enabled) {
      return [];
    }

    const campaigns: MarketingCampaign[] = [];

    // 1. 废弃购物车提醒
    if (config.strategies.abandonedCart?.enabled) {
      const abandonedCartCampaigns = await this.handleAbandonedCart(merchantId, config);
      campaigns.push(...abandonedCartCampaigns);
    }

    // 2. 新客户欢迎
    if (config.strategies.newCustomer?.enabled) {
      const newCustomerCampaigns = await this.handleNewCustomer(merchantId, config);
      campaigns.push(...newCustomerCampaigns);
    }

    // 3. 重复客户奖励
    if (config.strategies.repeatCustomer?.enabled) {
      const repeatCustomerCampaigns = await this.handleRepeatCustomer(merchantId, config);
      campaigns.push(...repeatCustomerCampaigns);
    }

    // 4. 低库存提醒
    if (config.strategies.lowStock?.enabled) {
      const lowStockCampaigns = await this.handleLowStock(merchantId, config);
      campaigns.push(...lowStockCampaigns);
    }

    // 5. 降价通知
    if (config.strategies.priceDrop?.enabled) {
      const priceDropCampaigns = await this.handlePriceDrop(merchantId, config);
      campaigns.push(...priceDropCampaigns);
    }

    // 保存所有活动到数据库
    const savedCampaigns = await this.campaignRepository.save(campaigns);

    return savedCampaigns;
  }

  /**
   * 处理废弃购物车
   */
  private async handleAbandonedCart(
    merchantId: string,
    config: AutoMarketingConfig,
  ): Promise<MarketingCampaign[]> {
    // TODO: 查询废弃购物车（超过X小时未完成支付）
    // MOCK: 模拟废弃购物车
    const abandonedCarts = [
      { userId: 'user_1', cartItems: ['product_1', 'product_2'], abandonedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    ];

    const campaigns: MarketingCampaign[] = [];

    for (const cart of abandonedCarts) {
      const delayHours = config.strategies.abandonedCart?.delayHours || 24;
      const hoursSinceAbandoned = (Date.now() - cart.abandonedAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceAbandoned >= delayHours) {
        let couponId: string | undefined;

        // 如果配置了折扣，创建优惠券
        if (config.strategies.abandonedCart?.discountPercent) {
          const coupon = this.couponRepository.create({
            merchantId,
            code: `ABANDONED_${Date.now()}`,
            name: '购物车提醒优惠券',
            type: CouponType.PERCENTAGE,
            value: config.strategies.abandonedCart.discountPercent,
            minPurchaseAmount: 0,
            validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天有效
            status: CouponStatus.ACTIVE,
          });
          const savedCoupon = await this.couponRepository.save(coupon);
          couponId = (savedCoupon as Coupon).id;
        }

        const campaign = this.campaignRepository.create({
          merchantId,
          type: CampaignType.ABANDONED_CART,
          targetUsers: [cart.userId],
          message: `您有商品还在购物车中，${config.strategies.abandonedCart?.discountPercent ? `使用优惠券可享受${config.strategies.abandonedCart.discountPercent}%折扣！` : '快来完成购买吧！'}`,
          couponId,
          status: CampaignStatus.PENDING,
        });
        campaigns.push(campaign);
      }
    }

    return campaigns;
  }

  /**
   * 处理新客户
   */
  private async handleNewCustomer(
    merchantId: string,
    config: AutoMarketingConfig,
  ): Promise<MarketingCampaign[]> {
    // TODO: 查询新注册客户（首次购买后）
    // MOCK: 模拟新客户
    const newCustomers = ['user_new_1', 'user_new_2'];

    const campaigns: MarketingCampaign[] = [];

    for (const userId of newCustomers) {
      let couponId: string | undefined;

      if (config.strategies.newCustomer?.welcomeDiscount) {
        const coupon = this.couponRepository.create({
          merchantId,
          code: `WELCOME_${Date.now()}`,
          name: '新客户欢迎优惠券',
          type: CouponType.PERCENTAGE,
          value: config.strategies.newCustomer.welcomeDiscount,
          minPurchaseAmount: 0,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天有效
          status: CouponStatus.ACTIVE,
        });
        const savedCoupon = await this.couponRepository.save(coupon);
        couponId = savedCoupon.id;
      }

      const campaign = this.campaignRepository.create({
        merchantId,
        type: CampaignType.NEW_CUSTOMER,
        targetUsers: [userId],
        message: `欢迎新客户！${config.strategies.newCustomer?.welcomeDiscount ? `使用优惠券可享受${config.strategies.newCustomer.welcomeDiscount}%折扣！` : '感谢您的支持！'}`,
        couponId,
        status: CampaignStatus.PENDING,
      });
      campaigns.push(campaign);
    }

    return campaigns;
  }

  /**
   * 处理重复客户
   */
  private async handleRepeatCustomer(
    merchantId: string,
    config: AutoMarketingConfig,
  ): Promise<MarketingCampaign[]> {
    // TODO: 查询重复购买客户
    // MOCK: 模拟重复客户
    const repeatCustomers = ['user_repeat_1'];

    const campaigns: MarketingCampaign[] = [];

    for (const userId of repeatCustomers) {
      const campaign = this.campaignRepository.create({
        merchantId,
        type: CampaignType.REPEAT_CUSTOMER,
        targetUsers: [userId],
        message: '感谢您的再次购买！作为忠实客户，您将获得额外奖励。',
        status: CampaignStatus.PENDING,
      });
      campaigns.push(campaign);
    }

    return campaigns;
  }

  /**
   * 处理低库存
   */
  private async handleLowStock(
    merchantId: string,
    config: AutoMarketingConfig,
  ): Promise<MarketingCampaign[]> {
    const threshold = config.strategies.lowStock?.threshold || 10;

    // TODO: 查询低库存产品
    // MOCK: 模拟低库存产品
    const lowStockProducts = [
      { id: 'product_1', name: 'Product 1', stock: 5 },
    ];

    const campaigns: MarketingCampaign[] = [];

    for (const product of lowStockProducts) {
      if (product.stock <= threshold) {
        // TODO: 查询关注该产品的用户
        const interestedUsers = ['user_1', 'user_2'];

        const campaign = this.campaignRepository.create({
          merchantId,
          type: CampaignType.LOW_STOCK,
          targetUsers: interestedUsers,
          message: `您关注的产品"${product.name}"库存不足，仅剩${product.stock}件，快来购买吧！`,
          status: CampaignStatus.PENDING,
        });
        campaigns.push(campaign);
      }
    }

    return campaigns;
  }

  /**
   * 处理降价通知
   */
  private async handlePriceDrop(
    merchantId: string,
    config: AutoMarketingConfig,
  ): Promise<MarketingCampaign[]> {
    const dropPercent = config.strategies.priceDrop?.dropPercent || 10;

    // TODO: 查询降价产品
    // MOCK: 模拟降价产品
    const priceDropProducts = [
      { id: 'product_1', name: 'Product 1', oldPrice: 100, newPrice: 85 },
    ];

    const campaigns: MarketingCampaign[] = [];

    for (const product of priceDropProducts) {
      const actualDropPercent = ((product.oldPrice - product.newPrice) / product.oldPrice) * 100;

      if (actualDropPercent >= dropPercent) {
        // TODO: 查询关注该产品的用户
        const interestedUsers = ['user_1', 'user_2'];

        const campaign = this.campaignRepository.create({
          merchantId,
          type: CampaignType.PRICE_DROP,
          targetUsers: interestedUsers,
          message: `您关注的产品"${product.name}"降价了${actualDropPercent.toFixed(0)}%！原价${product.oldPrice}，现价${product.newPrice}。`,
          status: CampaignStatus.PENDING,
        });
        campaigns.push(campaign);
      }
    }

    return campaigns;
  }

  /**
   * 发送营销活动
   */
  async sendCampaign(campaignId: string): Promise<{ success: boolean }> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new Error('活动不存在');
    }

    // TODO: 发送邮件/短信/推送通知
    this.logger.log(`发送营销活动: ${campaignId}, 目标用户: ${campaign.targetUsers.length}`);

    campaign.status = CampaignStatus.SENT;
    campaign.sentAt = new Date();
    await this.campaignRepository.save(campaign);

    return { success: true };
  }
}

