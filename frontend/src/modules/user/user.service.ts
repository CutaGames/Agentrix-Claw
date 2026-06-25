import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../entities/user.entity';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as crypto from 'crypto';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'avatars');

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    // 确保上传目录存在
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'agentrixId', 'email', 'roles', 'kycLevel', 'kycStatus', 'avatarUrl', 'createdAt'],
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
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

    return {
      message: '用户信息更新成功',
      user: await this.getProfile(userId),
    };
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

    // 检查角色是否已存在
    if (user.roles && user.roles.includes(role)) {
      return user; // 角色已存在，直接返回
    }

    // 添加新角色
    const updatedRoles = user.roles ? [...user.roles, role] : [role];
    user.roles = updatedRoles as UserRole[];

    await this.userRepository.save(user);

    this.logger.log(`用户 ${userId} 添加角色成功: ${role}`);

    return user;
  }
}

