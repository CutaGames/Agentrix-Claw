import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminAuthService } from './services/admin-auth.service';
import { UserManagementService } from './services/user-management.service';
import { MerchantManagementService } from './services/merchant-management.service';
import { DeveloperManagementService } from './services/developer-management.service';
import { PromoterManagementService } from './services/promoter-management.service';
import { SupportTicketService } from './services/support-ticket.service';
import { MarketingManagementService } from './services/marketing-management.service';
import { SystemManagementService } from './services/system-management.service';
import { RiskManagementService } from './services/risk-management.service';
import { AdminBootstrapService } from './services/admin-bootstrap.service';
import { AdminUser } from '../../entities/admin-user.entity';
import { AdminRole } from '../../entities/admin-role.entity';
import { AdminLog } from '../../entities/admin-log.entity';
import { AdminConfig } from '../../entities/admin-config.entity';
import { SupportTicket, SupportTicketReply } from '../../entities/support-ticket.entity';
import { User } from '../../entities/user.entity';
import { Product } from '../../entities/product.entity';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { WalletConnection } from '../../entities/wallet-connection.entity';
import { CommissionSettlement } from '../../entities/commission-settlement.entity';
import { MPCWallet } from '../../entities/mpc-wallet.entity';
import { UserAgent } from '../../entities/user-agent.entity';
import { Commission } from '../../entities/commission.entity';
import { MerchantReferral } from '../../entities/merchant-referral.entity';
import { ReferralCommission } from '../../entities/referral-commission.entity';
import { MarketingCampaign } from '../../entities/marketing-campaign.entity';
import { Coupon } from '../../entities/coupon.entity';
import { CouponUsage } from '../../entities/coupon-usage.entity';
import { RiskAssessment } from '../../entities/risk-assessment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdminUser,
      AdminRole,
      AdminLog,
      AdminConfig,
      SupportTicket,
      SupportTicketReply,
      User,
      Product,
      Order,
      Payment,
      WalletConnection,
      CommissionSettlement,
      MPCWallet,
      UserAgent,
      Commission,
      MerchantReferral,
      ReferralCommission,
      MarketingCampaign,
      Coupon,
      CouponUsage,
      RiskAssessment,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AdminController],
  providers: [
    AdminAuthService,
    UserManagementService,
    MerchantManagementService,
    DeveloperManagementService,
    PromoterManagementService,
    SupportTicketService,
    MarketingManagementService,
    SystemManagementService,
    RiskManagementService,
    AdminBootstrapService,
  ],
  exports: [
    AdminAuthService,
    UserManagementService,
    MerchantManagementService,
    DeveloperManagementService,
    PromoterManagementService,
    SupportTicketService,
    MarketingManagementService,
    SystemManagementService,
    RiskManagementService,
  ],
})
export class AdminModule {}

