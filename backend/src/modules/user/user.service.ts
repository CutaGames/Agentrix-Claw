import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../entities/user.entity';
import { MerchantProfile } from '../../entities/merchant-profile.entity';
import { ReferralService } from '../referral/referral.service';
import { DeveloperAccountService } from '../developer-account/developer-account.service';
import { DeveloperType } from '../../entities/developer-account.entity';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as crypto from 'crypto';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

/**
 * 将 roles 字段统一转换为数组
 * 兼容处理数据库中存储为字符串格式的历史数据，如 "{user,merchant}"
 */
function ensureRolesArray(roles: any): UserRole[] {
  if (typeof roles === 'string') {
    // 处理 PostgreSQL 数组字符串格式: "{user,merchant}"
    return roles
      .replace(/[{}]/g, '')
      .split(',')
      .map((r: string) => r.trim())
      .filter((r: string) => r) as UserRole[];
  }
  if (Array.isArray(roles)) {
    return roles;
  }
  return [UserRole.USER];
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'avatars');

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(MerchantProfile)
    private merchantProfileRepository: Repository<MerchantProfile>,
    @Inject(forwardRef(() => ReferralService))
    private referralService: ReferralService,
    @Inject(forwardRef(() => DeveloperAccountService))
    private developerAccountService: DeveloperAccountService,
  ) {
    // 确保上传目录存在
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'agentrixId', 'email', 'roles', 'kycLevel', 'kycStatus', 'avatarUrl', 'nickname', 'bio', 'createdAt'],
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 确保 roles 是数组格式
    const rolesArray = ensureRolesArray(user.roles);
    
    return {
      ...user,
      roles: rolesArray,
    };
  }

  async updateProfile(userId: string, dto: any) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 如果更新邮箱，检查邮箱是否已被其他用户使用
    if (dto.email && dto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: dto.email },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('该邮箱已被其他账号使用');
      }
    }

    if (dto.email) user.email = dto.email;
    if (dto.nickname) user.nickname = dto.nickname;
    if (dto.bio) user.bio = dto.bio;

    await this.userRepository.save(user);

    return this.getProfile(userId);
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请选择要上传的文件');
    }

    // 验证文件类型
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('不支持的文件类型，请上传图片文件（JPG、PNG、GIF、WebP）');
    }

    // 验证文件大小（5MB）
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('文件大小不能超过 5MB');
    }

    try {
      // 生成唯一文件名
      const fileExt = path.extname(file.originalname);
      const fileName = `${crypto.randomBytes(16).toString('hex')}${fileExt}`;
      const filePath = path.join(this.uploadDir, fileName);

      // 保存文件
      await writeFile(filePath, file.buffer);

      // 更新用户头像URL
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      // 删除旧头像（如果存在）
      if (user.avatarUrl) {
        const oldFilePath = path.join(process.cwd(), user.avatarUrl);
        if (fs.existsSync(oldFilePath)) {
          try {
            fs.unlinkSync(oldFilePath);
          } catch (error) {
            this.logger.warn(`删除旧头像失败: ${error.message}`);
          }
        }
      }

      // 保存新的头像URL（相对于uploads目录）
      const relativePath = path.relative(this.uploadDir, filePath);
      user.avatarUrl = `uploads/avatars/${relativePath}`;
      await this.userRepository.save(user);

      this.logger.log(`用户 ${userId} 上传头像成功: ${fileName}`);

      return {
        message: '头像上传成功',
        avatarUrl: `/api/uploads/avatars/${relativePath}`, // 返回可访问的URL
      };
    } catch (error) {
      this.logger.error(`头像上传失败: ${error.message}`, error.stack);
      throw new BadRequestException('头像上传失败，请重试');
    }
  }

  async getAvatar(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['avatarUrl'],
    });

    if (!user || !user.avatarUrl) {
      return { avatarUrl: null };
    }

    return {
      avatarUrl: user.avatarUrl.startsWith('/api/') 
        ? user.avatarUrl 
        : `/api/${user.avatarUrl}`,
    };
  }

  /**
   * 添加用户角色（注册商户/Agent）
   */
  async addRole(userId: string, role: UserRole): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 使用辅助函数确保 roles 是数组（兼容历史数据）
    const rolesArray = ensureRolesArray(user.roles);
    
    // 检查角色是否已存在
    if (rolesArray.includes(role)) {
      return user; // 角色已存在，直接返回
    }

    // 添加新角色
    rolesArray.push(role);
    user.roles = rolesArray;

    await this.userRepository.save(user);

    this.logger.log(`用户 ${userId} 添加角色成功: ${role}`);

    return user;
  }

  /**
   * 注册角色（商户/Agent/开发者）并处理相关逻辑
   */
  async registerRole(userId: string, role: string, data: any): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 1. 添加角色 - 使用辅助函数处理历史数据兼容
    const userRole = role as UserRole;
    const rolesArray = ensureRolesArray(user.roles);
    
    if (!rolesArray.includes(userRole)) {
      rolesArray.push(userRole);
      user.roles = rolesArray;
      await this.userRepository.save(user);
    }

    // 2. 如果是商户，创建商户资料
    if (role === 'merchant') {
      let profile = await this.merchantProfileRepository.findOne({ where: { userId } });
      if (!profile) {
        profile = this.merchantProfileRepository.create({
          userId,
          businessName: data.businessName || user.nickname || '未命名商户',
          contactInfo: data.contactInfo || {},
          businessInfo: data.businessInfo || {},
        });
        await this.merchantProfileRepository.save(profile);
      }

      // 3. 处理推广关系
      if (data.referralId) {
        try {
          await this.referralService.createReferral({
            agentId: data.referralId,
            merchantId: userId,
            merchantName: data.businessName,
            metadata: { source: 'registration' },
          });
          this.logger.log(`记录推广关系: agentId=${data.referralId}, merchantId=${userId}`);
        } catch (err) {
          this.logger.warn(`创建推广关系失败: ${err.message}`);
          // 推广关系创建失败不影响商户注册
        }
      }
    }

    // 3. 如果是开发者，创建开发者账户
    if (role === 'developer') {
      try {
        // 检查是否已有开发者账户
        const existingAccount = await this.developerAccountService.findByUserId(userId);
        if (!existingAccount) {
          // 创建新的开发者账户
          await this.developerAccountService.create(userId, {
            name: data.displayName || data.name || user.nickname || '开发者',
            type: data.developerType || DeveloperType.INDIVIDUAL,
            contactEmail: data.contactEmail || user.email,
            website: data.website,
            description: data.description,
          });
          this.logger.log(`为用户 ${userId} 创建开发者账户成功`);
        }
      } catch (err) {
        this.logger.warn(`创建开发者账户失败: ${err.message}`);
        // 开发者账户创建失败不影响角色注册
      }
    }

    return {
      success: true,
      message: '角色注册成功',
      user: {
        id: user.id,
        agentrixId: user.agentrixId,
        roles: ensureRolesArray(user.roles), // 确保返回数组格式
        email: user.email,
        nickname: user.nickname,
      },
    };
  }

  // ==================== 佣金结算设置 ====================

  /**
   * 获取用户佣金结算设置
   */
  async getPayoutSettings(userId: string) {
    const user = await this.userRepository.findOne({ 
      where: { id: userId },
      select: ['id', 'metadata'],
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const payoutSettings = user.metadata?.payoutSettings || {
      preferredMethod: 'none',
      minPayoutThreshold: 10,
      autoPayoutEnabled: true,
    };

    return {
      success: true,
      data: payoutSettings,
    };
  }

  /**
   * 更新用户佣金结算设置
   */
  async updatePayoutSettings(userId: string, dto: any) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 初始化 metadata
    if (!user.metadata) {
      user.metadata = {};
    }

    // 初始化 payoutSettings
    if (!user.metadata.payoutSettings) {
      user.metadata.payoutSettings = {
        preferredMethod: 'none',
        minPayoutThreshold: 10,
        autoPayoutEnabled: true,
      };
    }

    // 更新设置
    if (dto.preferredMethod !== undefined) {
      user.metadata.payoutSettings.preferredMethod = dto.preferredMethod;
    }
    if (dto.cryptoWalletAddress !== undefined) {
      user.metadata.payoutSettings.cryptoWalletAddress = dto.cryptoWalletAddress;
    }
    if (dto.cryptoWalletChain !== undefined) {
      user.metadata.payoutSettings.cryptoWalletChain = dto.cryptoWalletChain;
    }
    if (dto.minPayoutThreshold !== undefined) {
      user.metadata.payoutSettings.minPayoutThreshold = dto.minPayoutThreshold;
    }
    if (dto.autoPayoutEnabled !== undefined) {
      user.metadata.payoutSettings.autoPayoutEnabled = dto.autoPayoutEnabled;
    }

    // 保存
    await this.userRepository.save(user);

    this.logger.log(`用户 ${userId} 更新佣金结算设置: ${JSON.stringify(dto)}`);

    return {
      success: true,
      message: '设置已更新',
      data: user.metadata.payoutSettings,
    };
  }

  /**
   * 根据 ID 查找用户
   */
  async findById(userId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  /**
   * v2.1 — Get the user-facing preference block (subscriptionTier,
   * arenaAnonymous, etc.) stored under `users.metadata.preferences`.
   *
   * Returns sane defaults when the row or sub-key is missing.
   */
  async getPreferences(userId: string): Promise<{
    subscriptionTier: 'free' | 'pro' | 'business' | 'enterprise';
    arenaAnonymous: boolean;
    [k: string]: any;
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'metadata'],
    });
    const prefs = (user?.metadata as any)?.preferences || {};
    return {
      subscriptionTier: prefs.subscriptionTier || 'free',
      arenaAnonymous: prefs.arenaAnonymous === true,
      ...prefs,
    };
  }

  /**
   * v2.1 — Patch the user-facing preference block. Only known keys are
   * persisted; unknown keys are silently ignored to avoid drift.
   */
  async updatePreferences(
    userId: string,
    patch: { arenaAnonymous?: boolean; subscriptionTier?: string },
  ): Promise<{ subscriptionTier: string; arenaAnonymous: boolean }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new Error('user_not_found');

    if (!user.metadata) user.metadata = {} as any;
    if (!(user.metadata as any).preferences) {
      (user.metadata as any).preferences = {};
    }
    const prefs = (user.metadata as any).preferences;

    if (typeof patch.arenaAnonymous === 'boolean') {
      prefs.arenaAnonymous = patch.arenaAnonymous;
    }
    // subscriptionTier is admin-managed in production, but allow self-set
    // in dev/QA when env permits — mostly to make E2E tests easier.
    if (
      typeof patch.subscriptionTier === 'string' &&
      ['free', 'pro', 'business', 'enterprise'].includes(patch.subscriptionTier) &&
      process.env.MULTI_AGENT_ALLOW_SELF_TIER_SET === '1'
    ) {
      prefs.subscriptionTier = patch.subscriptionTier;
    }

    await this.userRepository.save(user);
    return {
      subscriptionTier: prefs.subscriptionTier || 'free',
      arenaAnonymous: prefs.arenaAnonymous === true,
    };
  }

  /**
   * 更新用户的 Stripe Connect 账户 ID
   */
  async updateStripeConnectAccountId(userId: string, stripeConnectAccountId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 初始化 metadata
    if (!user.metadata) {
      user.metadata = {};
    }
    
    user.metadata.stripeConnectAccountId = stripeConnectAccountId;
    await this.userRepository.save(user);
    
    this.logger.log(`用户 ${userId} 绑定 Stripe Connect 账户: ${stripeConnectAccountId}`);
  }
}

