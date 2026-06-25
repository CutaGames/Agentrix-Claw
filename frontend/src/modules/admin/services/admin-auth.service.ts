import { Injectable, UnauthorizedException, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AdminUser, AdminUserStatus } from '../../../entities/admin-user.entity';
import { AdminRole } from '../../../entities/admin-role.entity';
import { AdminLoginDto } from '../dto/admin-user.dto';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @InjectRepository(AdminUser)
    private adminUserRepository: Repository<AdminUser>,
    @InjectRepository(AdminRole)
    private adminRoleRepository: Repository<AdminRole>,
    private jwtService: JwtService,
  ) {}

  /**
   * 确保至少存在一个默认超级管理员账号（仅开发环境使用）
   * 在每次登录请求前触发一次，避免因为启动顺序问题导致账号未创建。
   */
  private async ensureDefaultAdminExists() {
    const count = await this.adminUserRepository.count();
    if (count > 0) {
      return;
    }

    const username = process.env.ADMIN_DEFAULT_USERNAME || 'admin';
    const email = process.env.ADMIN_DEFAULT_EMAIL || 'admin@agentrix.local';
    const password = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123456';

    // 创建超级管理员角色（如果不存在）
    let role = await this.adminRoleRepository.findOne({
      where: { name: 'super_admin' },
    });

    if (!role) {
      role = this.adminRoleRepository.create({
        name: 'super_admin',
        description: '系统超级管理员，拥有全部权限',
        permissions: ['*'],
      });
      role = await this.adminRoleRepository.save(role);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const admin = this.adminUserRepository.create({
      username,
      email,
      passwordHash,
      status: AdminUserStatus.ACTIVE,
      fullName: '超级管理员',
      roleId: role.id,
    });

    await this.adminUserRepository.save(admin);

    this.logger.warn(
      `已创建默认超级管理员账号: username="${username}", password="${password}"（请在生产环境修改）`,
    );
  }

  async validateAdmin(username: string, password: string): Promise<AdminUser | null> {
    // 确保默认管理员存在（仅当表为空时）
    await this.ensureDefaultAdminExists();

    const admin = await this.adminUserRepository.findOne({
      where: { username },
      relations: ['role'],
    });

    if (!admin) {
      return null;
    }

    if (admin.status !== 'active') {
      throw new UnauthorizedException('账户已被禁用');
    }

    const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isPasswordValid) {
      return null;
    }

    // 更新最后登录时间
    admin.lastLoginAt = new Date();
    await this.adminUserRepository.save(admin);

    return admin;
  }

  async login(dto: AdminLoginDto, ipAddress?: string) {
    const admin = await this.validateAdmin(dto.username, dto.password);
    if (!admin) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 更新登录IP
    if (ipAddress) {
      admin.lastLoginIp = ipAddress;
      await this.adminUserRepository.save(admin);
    }

    const payload = {
      sub: admin.id,
      username: admin.username,
      email: admin.email,
      roleId: admin.roleId,
      type: 'admin',
    };

    return {
      access_token: this.jwtService.sign(payload),
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        fullName: admin.fullName,
        roleId: admin.roleId,
        role: admin.role,
      },
    };
  }

  async findById(id: string): Promise<AdminUser> {
    const admin = await this.adminUserRepository.findOne({
      where: { id },
      relations: ['role'],
    });

    if (!admin) {
      throw new NotFoundException('管理员不存在');
    }

    return admin;
  }
}

