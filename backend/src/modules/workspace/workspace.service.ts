import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { 
  Workspace, 
  WorkspaceMember, 
  WorkspaceStatus, 
  WorkspaceType, 
  WorkspacePlan,
  WorkspaceMemberRole 
} from '../../entities/workspace.entity';
import { User } from '../../entities/user.entity';

/**
 * 计划配额配置
 */
const PLAN_LIMITS = {
  [WorkspacePlan.FREE]: { maxMembers: 1, maxAgents: 3, maxStorageMB: 100 },
  [WorkspacePlan.PRO]: { maxMembers: 5, maxAgents: 10, maxStorageMB: 1000 },
  [WorkspacePlan.BUSINESS]: { maxMembers: 20, maxAgents: 50, maxStorageMB: 10000 },
  [WorkspacePlan.ENTERPRISE]: { maxMembers: 100, maxAgents: 200, maxStorageMB: 100000 },
};

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private memberRepository: Repository<WorkspaceMember>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * 创建工作空间
   */
  async create(ownerId: string, data: {
    name: string;
    slug?: string;
    description?: string;
    type?: WorkspaceType;
  }): Promise<Workspace> {
    // 生成 slug（如果未提供）
    const slug = data.slug || this.generateSlug(data.name);

    // 检查 slug 是否已存在
    const existing = await this.workspaceRepository.findOne({ where: { slug } });
    if (existing) {
      throw new BadRequestException('该工作空间标识已被使用');
    }

    const plan = WorkspacePlan.FREE;
    const limits = PLAN_LIMITS[plan];

    const workspace = this.workspaceRepository.create({
      name: data.name,
      slug,
      description: data.description,
      ownerId,
      type: data.type || WorkspaceType.PERSONAL,
      plan,
      status: WorkspaceStatus.ACTIVE,
      maxMembers: limits.maxMembers,
      maxAgents: limits.maxAgents,
      maxStorageMB: limits.maxStorageMB,
    });

    const savedWorkspace = await this.workspaceRepository.save(workspace);

    // 自动添加所有者为成员
    await this.addMember(savedWorkspace.id, ownerId, WorkspaceMemberRole.OWNER, ownerId);

    this.logger.log(`创建工作空间: ${savedWorkspace.id}, 所有者: ${ownerId}`);
    return savedWorkspace;
  }

  /**
   * 获取工作空间详情
   */
  async findById(id: string): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id },
      relations: ['members', 'members.user'],
    });
    if (!workspace) {
      throw new NotFoundException('工作空间不存在');
    }
    return workspace;
  }

  /**
   * 获取工作空间（通过 slug）
   */
  async findBySlug(slug: string): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findOne({
      where: { slug },
      relations: ['members', 'members.user'],
    });
    if (!workspace) {
      throw new NotFoundException('工作空间不存在');
    }
    return workspace;
  }

  /**
   * 获取用户的所有工作空间
   */
  async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    const memberships = await this.memberRepository.find({
      where: { userId, accepted: true },
      relations: ['workspace'],
    });
    return memberships.map(m => m.workspace);
  }

  /**
   * 获取用户拥有的工作空间
   */
  async getOwnedWorkspaces(userId: string): Promise<Workspace[]> {
    return this.workspaceRepository.find({
      where: { ownerId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 更新工作空间
   */
  async update(id: string, userId: string, data: Partial<{
    name: string;
    description: string;
    iconUrl: string;
    settings: Workspace['settings'];
  }>): Promise<Workspace> {
    await this.checkPermission(id, userId, ['owner', 'admin']);
    
    const workspace = await this.findById(id);
    Object.assign(workspace, data);
    
    return this.workspaceRepository.save(workspace);
  }

  /**
   * 添加成员
   */
  async addMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceMemberRole,
    invitedBy: string,
  ): Promise<WorkspaceMember> {
    const workspace = await this.findById(workspaceId);

    // 检查成员数量限制
    const memberCount = await this.memberRepository.count({
      where: { workspaceId, accepted: true },
    });
    if (memberCount >= workspace.maxMembers) {
      throw new BadRequestException(`已达到最大成员数量限制 (${workspace.maxMembers})`);
    }

    // 检查是否已是成员
    const existing = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });
    if (existing) {
      if (existing.accepted) {
        throw new BadRequestException('该用户已是工作空间成员');
      }
      // 重新发送邀请
      existing.role = role;
      existing.invitedAt = new Date();
      existing.invitedBy = invitedBy;
      return this.memberRepository.save(existing);
    }

    const member = this.memberRepository.create({
      workspaceId,
      userId,
      role,
      invitedBy,
      invitedAt: new Date(),
      accepted: role === WorkspaceMemberRole.OWNER, // 所有者自动接受
      acceptedAt: role === WorkspaceMemberRole.OWNER ? new Date() : null,
    });

    return this.memberRepository.save(member);
  }

  /**
   * 接受邀请
   */
  async acceptInvitation(workspaceId: string, userId: string): Promise<WorkspaceMember> {
    const member = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });
    if (!member) {
      throw new NotFoundException('未找到邀请');
    }
    if (member.accepted) {
      throw new BadRequestException('已接受邀请');
    }

    member.accepted = true;
    member.acceptedAt = new Date();
    
    return this.memberRepository.save(member);
  }

  /**
   * 移除成员
   */
  async removeMember(workspaceId: string, userId: string, operatorId: string): Promise<void> {
    await this.checkPermission(workspaceId, operatorId, ['owner', 'admin']);
    
    const member = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });
    if (!member) {
      throw new NotFoundException('成员不存在');
    }
    if (member.role === WorkspaceMemberRole.OWNER) {
      throw new BadRequestException('不能移除所有者');
    }

    await this.memberRepository.remove(member);
  }

  /**
   * 更新成员角色
   */
  async updateMemberRole(
    workspaceId: string,
    userId: string,
    newRole: WorkspaceMemberRole,
    operatorId: string,
  ): Promise<WorkspaceMember> {
    await this.checkPermission(workspaceId, operatorId, ['owner']);
    
    const member = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });
    if (!member) {
      throw new NotFoundException('成员不存在');
    }
    if (member.role === WorkspaceMemberRole.OWNER && newRole !== WorkspaceMemberRole.OWNER) {
      throw new BadRequestException('不能降级所有者角色');
    }

    member.role = newRole;
    return this.memberRepository.save(member);
  }

  /**
   * 获取工作空间成员列表
   */
  async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.memberRepository.find({
      where: { workspaceId },
      relations: ['user'],
      order: { role: 'ASC', joinedAt: 'ASC' },
    });
  }

  /**
   * 检查用户权限
   */
  async checkPermission(
    workspaceId: string,
    userId: string,
    allowedRoles: string[],
  ): Promise<WorkspaceMember> {
    const member = await this.memberRepository.findOne({
      where: { workspaceId, userId, accepted: true },
    });
    if (!member) {
      throw new ForbiddenException('您不是该工作空间成员');
    }
    if (!allowedRoles.includes(member.role)) {
      throw new ForbiddenException('您没有执行此操作的权限');
    }
    return member;
  }

  /**
   * 检查用户是否是工作空间成员
   */
  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    const member = await this.memberRepository.findOne({
      where: { workspaceId, userId, accepted: true },
    });
    return !!member;
  }

  /**
   * 升级计划
   */
  async upgradePlan(workspaceId: string, userId: string, newPlan: WorkspacePlan): Promise<Workspace> {
    await this.checkPermission(workspaceId, userId, ['owner']);
    
    const workspace = await this.findById(workspaceId);
    const limits = PLAN_LIMITS[newPlan];
    
    workspace.plan = newPlan;
    workspace.maxMembers = limits.maxMembers;
    workspace.maxAgents = limits.maxAgents;
    workspace.maxStorageMB = limits.maxStorageMB;
    
    return this.workspaceRepository.save(workspace);
  }

  /**
   * 归档工作空间
   */
  async archive(workspaceId: string, userId: string): Promise<Workspace> {
    await this.checkPermission(workspaceId, userId, ['owner']);
    
    const workspace = await this.findById(workspaceId);
    workspace.status = WorkspaceStatus.ARCHIVED;
    
    return this.workspaceRepository.save(workspace);
  }

  /**
   * 删除工作空间
   */
  async delete(workspaceId: string, userId: string): Promise<void> {
    await this.checkPermission(workspaceId, userId, ['owner']);
    
    // 软删除
    const workspace = await this.findById(workspaceId);
    workspace.status = WorkspaceStatus.DELETED;
    
    await this.workspaceRepository.save(workspace);
    this.logger.log(`删除工作空间: ${workspaceId}, 操作者: ${userId}`);
  }

  /**
   * 生成 URL 友好的 slug
   */
  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 40);
    const random = Math.random().toString(36).substring(2, 8);
    return `${base}-${random}`;
  }

  /**
   * 为用户创建默认个人工作空间
   */
  async createDefaultWorkspace(user: User): Promise<Workspace> {
    return this.create(user.id, {
      name: `${user.nickname || user.email?.split('@')[0] || 'My'}'s Workspace`,
      type: WorkspaceType.PERSONAL,
    });
  }
}
