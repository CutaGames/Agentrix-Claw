import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialAccount, SocialAccountType } from '../../entities/social-account.entity';
import { User } from '../../entities/user.entity';

@Injectable()
export class SocialAccountService {
  constructor(
    @InjectRepository(SocialAccount)
    private socialAccountRepository: Repository<SocialAccount>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * 绑定社交账号
   * 一个AX ID，每种类型只能绑定一个账号
   */
  async bindSocialAccount(
    userId: string,
    type: SocialAccountType,
    socialId: string,
    data: {
      email?: string;
      username?: string;
      displayName?: string;
      avatarUrl?: string;
      metadata?: Record<string, any>;
    },
  ) {
    // 检查用户是否存在
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 检查该用户是否已经绑定了该类型的社交账号
    const existingAccount = await this.socialAccountRepository.findOne({
      where: { userId, type },
    });

    if (existingAccount) {
      throw new ConflictException(`您已经绑定了${this.getTypeName(type)}账号，请先解绑`);
    }

    // 检查该社交账号是否已被其他用户绑定
    const existingSocialId = await this.socialAccountRepository.findOne({
      where: { type, socialId },
    });

    if (existingSocialId && existingSocialId.userId !== userId) {
      throw new ConflictException('该社交账号已被其他用户绑定');
    }

    // 创建社交账号绑定
    const socialAccount = this.socialAccountRepository.create({
      userId,
      type,
      socialId,
      email: data.email,
      username: data.username,
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
      metadata: data.metadata,
    });

    return this.socialAccountRepository.save(socialAccount);
  }

  /**
   * 解绑社交账号
   */
  async unbindSocialAccount(userId: string, type: SocialAccountType) {
    const socialAccount = await this.socialAccountRepository.findOne({
      where: { userId, type },
    });

    if (!socialAccount) {
      throw new NotFoundException('未找到该社交账号绑定');
    }

    await this.socialAccountRepository.remove(socialAccount);
    return { message: `已解绑${this.getTypeName(type)}账号` };
  }

  /**
   * 获取用户的所有社交账号绑定
   */
  async getUserSocialAccounts(userId: string) {
    return this.socialAccountRepository.find({
      where: { userId },
      order: { connectedAt: 'DESC' },
    });
  }

  /**
   * 通过社交账号ID查找用户
   */
  async findUserBySocialId(type: SocialAccountType, socialId: string): Promise<User | null> {
    const socialAccount = await this.socialAccountRepository.findOne({
      where: { type, socialId },
      relations: ['user'],
    });

    return socialAccount?.user || null;
  }

  /**
   * 检查用户是否已绑定某类型的社交账号
   */
  async isBound(userId: string, type: SocialAccountType): Promise<boolean> {
    const count = await this.socialAccountRepository.count({
      where: { userId, type },
    });
    return count > 0;
  }

  /**
   * 获取类型名称（中文）
   */
  private getTypeName(type: SocialAccountType): string {
    const names: Record<SocialAccountType, string> = {
      [SocialAccountType.GOOGLE]: 'Google',
      [SocialAccountType.APPLE]: 'Apple',
      [SocialAccountType.X]: 'X (Twitter)',
      [SocialAccountType.TELEGRAM]: 'Telegram',
      [SocialAccountType.DISCORD]: 'Discord',
    };
    return names[type] || type;
  }
}

