import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AdminUser, AdminUserStatus } from '../../../entities/admin-user.entity';
import { AdminRole, AdminRoleType } from '../../../entities/admin-role.entity';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUserRepository: Repository<AdminUser>,
    @InjectRepository(AdminRole)
    private readonly adminRoleRepository: Repository<AdminRole>,
  ) {}

  /**
   * 应用启动时自动检查是否存在管理员，如果不存在则创建一个默认超级管理员
   *
   * 默认账号（可通过环境变量覆盖，仅用于开发环境）：
   * - 用户名: ADMIN_DEFAULT_USERNAME 或 admin
   * - 邮箱:   ADMIN_DEFAULT_EMAIL 或 admin@agentrix.local
   * - 密码:   ADMIN_DEFAULT_PASSWORD 或 admin123456
   */
  async onModuleInit() {
    const count = await this.adminUserRepository.count();
    if (count > 0) {
      return;
    }

    const username = process.env.ADMIN_DEFAULT_USERNAME || 'admin';
    const email = process.env.ADMIN_DEFAULT_EMAIL || 'admin@agentrix.local';
    const password = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123456';

    // 1. 创建超级管理员角色（如果不存在）
    let role = await this.adminRoleRepository.findOne({
      where: { name: 'super_admin' },
    });

    if (!role) {
      role = this.adminRoleRepository.create({
        name: 'super_admin',
        description: '系统超级管理员，拥有全部权限',
        type: AdminRoleType.SUPER_ADMIN,
        permissions: ['*'],
      });
      role = await this.adminRoleRepository.save(role);
    }

    // 2. 创建默认管理员账号
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
      `已自动创建默认超级管理员账号（仅用于开发环境）: username="${username}", password="${password}"`,
    );
  }
}


