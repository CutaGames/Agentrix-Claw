import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AdminUser, AdminUserStatus } from '../../../entities/admin-user.entity';
import { AdminRole, AdminRoleType } from '../../../entities/admin-role.entity';
import { AdminConfig, ConfigCategory } from '../../../entities/admin-config.entity';
import { AdminLog, AdminLogAction } from '../../../entities/admin-log.entity';

@Injectable()
export class SystemManagementService {
  constructor(
    @InjectRepository(AdminUser)
    private adminUserRepository: Repository<AdminUser>,
    @InjectRepository(AdminRole)
    private adminRoleRepository: Repository<AdminRole>,
    @InjectRepository(AdminConfig)
    private configRepository: Repository<AdminConfig>,
    @InjectRepository(AdminLog)
    private logRepository: Repository<AdminLog>,
  ) {}

  // ========== 管理员管理 ==========

  async getAdminUsers(query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const queryBuilder = this.adminUserRepository
      .createQueryBuilder('admin')
      .leftJoinAndSelect('admin.role', 'role');

    if (query.search) {
      queryBuilder.andWhere(
        '(admin.username LIKE :search OR admin.email LIKE :search OR admin.fullName LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.status) {
      queryBuilder.andWhere('admin.status = :status', { status: query.status });
    }

    if (query.roleId) {
      queryBuilder.andWhere('admin.roleId = :roleId', { roleId: query.roleId });
    }

    queryBuilder.skip(skip).take(limit).orderBy('admin.createdAt', 'DESC');

    const [users, total] = await queryBuilder.getManyAndCount();

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAdminUserById(id: string) {
    const user = await this.adminUserRepository.findOne({
      where: { id },
      relations: ['role'],
    });

    if (!user) {
      throw new NotFoundException('管理员不存在');
    }

    return user;
  }

  async createAdminUser(dto: any) {
    // 检查用户名是否已存在
    const existingUser = await this.adminUserRepository.findOne({
      where: { username: dto.username },
    });

    if (existingUser) {
      throw new ConflictException('用户名已存在');
    }

    // 检查邮箱是否已存在
    const existingEmail = await this.adminUserRepository.findOne({
      where: { email: dto.email },
    });

    if (existingEmail) {
      throw new ConflictException('邮箱已存在');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = this.adminUserRepository.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      roleId: dto.roleId,
      status: AdminUserStatus.ACTIVE,
    });

    return await this.adminUserRepository.save(user);
  }

  async updateAdminUser(id: string, dto: any) {
    const user = await this.adminUserRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('管理员不存在');
    }

    if (dto.email && dto.email !== user.email) {
      const existingEmail = await this.adminUserRepository.findOne({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException('邮箱已存在');
      }
      user.email = dto.email;
    }

    if (dto.fullName !== undefined) {
      user.fullName = dto.fullName;
    }

    if (dto.status) {
      user.status = dto.status;
    }

    if (dto.roleId) {
      user.roleId = dto.roleId;
    }

    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    return await this.adminUserRepository.save(user);
  }

  async deleteAdminUser(id: string) {
    const user = await this.adminUserRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('管理员不存在');
    }

    await this.adminUserRepository.remove(user);
    return { success: true };
  }

  // ========== 角色权限管理 ==========

  async getRoles() {
    return await this.adminRoleRepository.find({
      relations: ['users'],
    });
  }

  async getRoleById(id: string) {
    const role = await this.adminRoleRepository.findOne({
      where: { id },
      relations: ['users'],
    });

    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    return role;
  }

  async createRole(dto: any) {
    const existingRole = await this.adminRoleRepository.findOne({
      where: { name: dto.name },
    });

    if (existingRole) {
      throw new ConflictException('角色名称已存在');
    }

    const role = this.adminRoleRepository.create({
      name: dto.name,
      description: dto.description,
      type: dto.type,
      permissions: dto.permissions || [],
    });

    return await this.adminRoleRepository.save(role);
  }

  async updateRole(id: string, dto: any) {
    const role = await this.adminRoleRepository.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    if (dto.name && dto.name !== role.name) {
      const existingRole = await this.adminRoleRepository.findOne({
        where: { name: dto.name },
      });
      if (existingRole) {
        throw new ConflictException('角色名称已存在');
      }
      role.name = dto.name;
    }

    if (dto.description !== undefined) {
      role.description = dto.description;
    }

    if (dto.permissions) {
      role.permissions = dto.permissions;
    }

    return await this.adminRoleRepository.save(role);
  }

  async deleteRole(id: string) {
    const role = await this.adminRoleRepository.findOne({
      where: { id },
      relations: ['users'],
    });

    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    if (role.users && role.users.length > 0) {
      throw new ConflictException('该角色下还有管理员，无法删除');
    }

    await this.adminRoleRepository.remove(role);
    return { success: true };
  }

  // ========== 系统配置管理 ==========

  async getConfigs(query: any) {
    const queryBuilder = this.configRepository.createQueryBuilder('config');

    if (query.category) {
      queryBuilder.andWhere('config.category = :category', { category: query.category });
    }

    if (query.search) {
      queryBuilder.andWhere(
        '(config.key LIKE :search OR config.description LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    return await queryBuilder.orderBy('config.category', 'ASC').getMany();
  }

  async getConfigByKey(key: string) {
    const config = await this.configRepository.findOne({
      where: { key },
    });

    if (!config) {
      throw new NotFoundException('配置不存在');
    }

    return config;
  }

  async createConfig(dto: any) {
    const existingConfig = await this.configRepository.findOne({
      where: { key: dto.key },
    });

    if (existingConfig) {
      throw new ConflictException('配置键已存在');
    }

    const config = this.configRepository.create({
      key: dto.key,
      category: dto.category,
      value: dto.value,
      description: dto.description,
      isPublic: dto.isPublic !== undefined ? dto.isPublic : true,
      metadata: dto.metadata,
    });

    return await this.configRepository.save(config);
  }

  async updateConfig(key: string, dto: any) {
    const config = await this.configRepository.findOne({ where: { key } });
    if (!config) {
      throw new NotFoundException('配置不存在');
    }

    if (dto.value !== undefined) {
      config.value = dto.value;
    }

    if (dto.description !== undefined) {
      config.description = dto.description;
    }

    if (dto.isPublic !== undefined) {
      config.isPublic = dto.isPublic;
    }

    if (dto.metadata) {
      config.metadata = dto.metadata;
    }

    return await this.configRepository.save(config);
  }

  async deleteConfig(key: string) {
    const config = await this.configRepository.findOne({ where: { key } });
    if (!config) {
      throw new NotFoundException('配置不存在');
    }

    await this.configRepository.remove(config);
    return { success: true };
  }

  // ========== 操作日志 ==========

  async getLogs(query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '50');
    const skip = (page - 1) * limit;

    const queryBuilder = this.logRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.adminUser', 'adminUser');

    if (query.adminUserId) {
      queryBuilder.andWhere('log.adminUserId = :adminUserId', { adminUserId: query.adminUserId });
    }

    if (query.action) {
      queryBuilder.andWhere('log.action = :action', { action: query.action });
    }

    if (query.resourceType) {
      queryBuilder.andWhere('log.resourceType = :resourceType', { resourceType: query.resourceType });
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere('log.createdAt BETWEEN :startDate AND :endDate', {
        startDate: query.startDate,
        endDate: query.endDate,
      });
    }

    queryBuilder.skip(skip).take(limit).orderBy('log.createdAt', 'DESC');

    const [logs, total] = await queryBuilder.getManyAndCount();

    return {
      data: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async logAction(
    adminUserId: string,
    action: AdminLogAction,
    resourceType: string,
    resourceId: string,
    description?: string,
    metadata?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const log = this.logRepository.create({
      adminUserId,
      action,
      resourceType,
      resourceId,
      description,
      metadata,
      ipAddress,
      userAgent,
    });

    return await this.logRepository.save(log);
  }
}

