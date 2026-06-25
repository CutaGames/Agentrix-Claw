import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../entities/user.entity';
import { MerchantProfile } from '../../entities/merchant-profile.entity';

/**
 * 将 roles 字段统一转换为数组
 * 兼容处理数据库中存储为字符串格式的历史数据，如 "{user,merchant}"
 */
function ensureRolesArray(roles: any): UserRole[] {
  if (typeof roles === 'string') {
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

export interface UpdateMerchantProfileDto {
  businessName?: string;
  businessLicense?: string;
  businessDescription?: string;
  contactInfo?: {
    email?: string;
    phone?: string;
    address?: string;
    website?: string;
  };
  businessInfo?: {
    registrationDate?: Date;
    registrationCountry?: string;
    taxId?: string;
    industry?: string;
  };
}

@Injectable()
export class MerchantProfileService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(MerchantProfile)
    private merchantProfileRepository: Repository<MerchantProfile>,
  ) {}

  async getProfile(userId: string) {
    // 检查用户是否有MERCHANT角色
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    
    const rolesArray = user ? ensureRolesArray(user.roles) : [];
    if (!user || !rolesArray.includes(UserRole.MERCHANT)) {
      throw new NotFoundException('用户不是商户');
    }
    
    // 查找或创建profile
    let profile = await this.merchantProfileRepository.findOne({
      where: { userId },
      relations: ['user'],
    });
    
    if (!profile) {
      // 创建默认profile
      profile = this.merchantProfileRepository.create({
        userId,
        businessName: user.nickname || user.email || '未命名商户',
        contactInfo: {
          email: user.email,
        },
      });
      profile = await this.merchantProfileRepository.save(profile);
    }
    
    return profile;
  }

  async updateProfile(userId: string, dto: UpdateMerchantProfileDto) {
    const profile = await this.getProfile(userId);
    
    Object.assign(profile, dto);
    
    return this.merchantProfileRepository.save(profile);
  }
}

