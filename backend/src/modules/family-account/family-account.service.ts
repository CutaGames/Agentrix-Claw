import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FamilyAccountEntity } from '../../entities/family-account.entity';
import { FamilyInvitationEntity } from '../../entities/family-invitation.entity';
import { FamilyMemberEntity } from '../../entities/family-member.entity';
import { FamilyPetEntity } from '../../entities/family-pet.entity';
import { HouseholdAgentEntity } from '../../entities/household-agent.entity';

/**
 * 顿领 §3.9 + §12 家庭账号 (P3-5 backend)
 * In-memory MVP — Family / Family Pet / Household Agent + member roles + invitations.
 */

export type FamilyRole = 'owner' | 'admin' | 'member' | 'child' | 'guest';

export interface FamilyAccount {
  id: string;
  ownerUserId: string;
  name: string;
  plan: 'free' | 'family_pro' | 'family_premium';
  createdAt: number;
}

export interface FamilyMember {
  id: string;
  familyId: string;
  userId: string;
  role: FamilyRole;
  display_name?: string;
  joinedAt: number;
}

export interface FamilyInvitation {
  id: string;
  familyId: string;
  invitedByUserId: string;
  invitee_email?: string;
  invitee_user_id?: string;
  proposed_role: FamilyRole;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  code: string;
  createdAt: number;
  expiresAt: number;
}

export interface FamilyPet {
  id: string;
  familyId: string;
  name: string;
  emotion: 'calm' | 'happy' | 'concerned' | 'sleepy';
  intimacy_level: number;
  shared_among_members: string[]; // userId list
  createdAt: number;
  updatedAt: number;
}

export interface HouseholdAgent {
  id: string;
  familyId: string;
  role: 'butler' | 'tutor' | 'concierge' | 'finance' | 'health';
  name: string;
  visible_to_roles: FamilyRole[];
  active: boolean;
  createdAt: number;
}

@Injectable()
export class FamilyAccountService {
  constructor(
    @InjectRepository(FamilyAccountEntity)
    private readonly familyRepo: Repository<FamilyAccountEntity>,
    @InjectRepository(FamilyMemberEntity)
    private readonly memberRepo: Repository<FamilyMemberEntity>,
    @InjectRepository(FamilyInvitationEntity)
    private readonly invitationRepo: Repository<FamilyInvitationEntity>,
    @InjectRepository(FamilyPetEntity)
    private readonly petRepo: Repository<FamilyPetEntity>,
    @InjectRepository(HouseholdAgentEntity)
    private readonly agentRepo: Repository<HouseholdAgentEntity>,
  ) {}

  private genId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private async requireMembership(familyId: string, userId: string): Promise<FamilyMemberEntity> {
    const m = await this.memberRepo.findOne({ where: { familyId, userId } });
    if (!m) throw new BadRequestException('not a family member');
    return m;
  }

  async createFamily(userId: string, body: { name: string; plan?: FamilyAccount['plan'] }): Promise<FamilyAccount> {
    if (!body?.name) throw new BadRequestException('name required');
    const now = Date.now();
    const f = this.familyRepo.create({
      id: this.genId('fam'),
      ownerUserId: userId,
      name: body.name,
      plan: body.plan || 'family_pro',
      createdAtMs: String(now),
    });
    const savedFamily = await this.familyRepo.save(f);
    const owner = this.memberRepo.create({
      id: this.genId('mem'),
      familyId: savedFamily.id,
      userId,
      role: 'owner',
      joinedAtMs: String(now),
    });
    await this.memberRepo.save(owner);
    return this.toFamily(savedFamily);
  }

  async listMyFamilies(userId: string): Promise<FamilyAccount[]> {
    const memberships = await this.memberRepo.find({ where: { userId } });
    const familyIds = new Set(memberships.map((membership) => membership.familyId));
    return (await this.familyRepo.find())
      .filter((family) => familyIds.has(family.id))
      .map((family) => this.toFamily(family));
  }

  async getFamily(familyId: string, userId: string): Promise<FamilyAccount> {
    const f = await this.familyRepo.findOne({ where: { id: familyId } });
    if (!f) throw new NotFoundException('family not found');
    await this.requireMembership(familyId, userId);
    return this.toFamily(f);
  }

  async invite(userId: string, familyId: string, body: { email?: string; user_id?: string; role?: FamilyRole }): Promise<FamilyInvitation> {
    const me = await this.requireMembership(familyId, userId);
    if (me.role !== 'owner' && me.role !== 'admin') throw new BadRequestException('only owner/admin can invite');
    const now = Date.now();
    const inv = this.invitationRepo.create({
      id: this.genId('inv'),
      familyId,
      invitedByUserId: userId,
      inviteeEmail: body.email ?? null,
      inviteeUserId: body.user_id ?? null,
      proposedRole: body.role || 'member',
      status: 'pending',
      code: Math.random().toString(36).slice(2, 8).toUpperCase(),
      createdAtMs: String(now),
      expiresAtMs: String(now + 7 * 24 * 60 * 60 * 1000),
    });
    return this.toInvitation(await this.invitationRepo.save(inv));
  }

  async acceptInvitation(userId: string, code: string): Promise<FamilyMember> {
    const inv = await this.invitationRepo.findOne({ where: { code } });
    if (!inv) throw new NotFoundException('invitation not found');
    if (inv.status !== 'pending') throw new BadRequestException(`invitation is ${inv.status}`);
    if (Date.now() > Number(inv.expiresAtMs)) {
      inv.status = 'expired';
      await this.invitationRepo.save(inv);
      throw new BadRequestException('invitation expired');
    }
    if (await this.memberRepo.findOne({ where: { familyId: inv.familyId, userId } })) {
      throw new BadRequestException('already a member');
    }
    const m = this.memberRepo.create({
      id: this.genId('mem'),
      familyId: inv.familyId,
      userId,
      role: inv.proposedRole,
      joinedAtMs: String(Date.now()),
    });
    const savedMember = await this.memberRepo.save(m);
    inv.status = 'accepted';
    await this.invitationRepo.save(inv);
    return this.toMember(savedMember);
  }

  async listMembers(familyId: string, userId: string): Promise<FamilyMember[]> {
    await this.requireMembership(familyId, userId);
    return (await this.memberRepo.find({ where: { familyId } })).map((member) => this.toMember(member));
  }

  // Family Pet
  async setupFamilyPet(userId: string, familyId: string, body: { name: string }): Promise<FamilyPet> {
    await this.requireMembership(familyId, userId);
    const existing = await this.petRepo.findOne({ where: { familyId } });
    const memberIds = (await this.memberRepo.find({ where: { familyId } })).map((member) => member.userId);
    const now = Date.now();
    const pet = this.petRepo.create({
      id: existing?.id ?? this.genId('fpet'),
      familyId,
      name: body.name || 'FamilyPet',
      emotion: existing?.emotion ?? 'calm',
      intimacyLevel: existing?.intimacyLevel ?? 1,
      sharedAmongMembers: memberIds,
      createdAtMs: existing?.createdAtMs ?? String(now),
      updatedAtMs: String(now),
    });
    return this.toPet(await this.petRepo.save(pet));
  }

  async getFamilyPet(familyId: string, userId: string): Promise<FamilyPet> {
    await this.requireMembership(familyId, userId);
    const p = await this.petRepo.findOne({ where: { familyId } });
    if (!p) throw new NotFoundException('family pet not setup');
    return this.toPet(p);
  }

  async setFamilyPetEmotion(userId: string, familyId: string, body: { emotion: FamilyPet['emotion'] }): Promise<FamilyPet> {
    await this.requireMembership(familyId, userId);
    const p = await this.petRepo.findOne({ where: { familyId } });
    if (!p) throw new NotFoundException('family pet not setup');
    p.emotion = body.emotion;
    p.updatedAtMs = String(Date.now());
    return this.toPet(await this.petRepo.save(p));
  }

  // Household Agent
  async createHouseholdAgent(userId: string, familyId: string, body: {
    role: HouseholdAgent['role'];
    name: string;
    visible_to_roles?: FamilyRole[];
  }): Promise<HouseholdAgent> {
    const me = await this.requireMembership(familyId, userId);
    if (me.role !== 'owner' && me.role !== 'admin') throw new BadRequestException('only owner/admin can create household agent');
    const a = this.agentRepo.create({
      id: this.genId('hag'),
      familyId,
      role: body.role,
      name: body.name,
      visibleToRoles: body.visible_to_roles || ['owner', 'admin', 'member', 'child'],
      active: true,
      createdAtMs: String(Date.now()),
    });
    return this.toAgent(await this.agentRepo.save(a));
  }

  async listHouseholdAgents(familyId: string, userId: string): Promise<HouseholdAgent[]> {
    const me = await this.requireMembership(familyId, userId);
    const viewerRole = me.role as FamilyRole;
    return (await this.agentRepo.find({ where: { familyId } }))
      .map((agent) => this.toAgent(agent))
      .filter((agent) => agent.active && agent.visible_to_roles.includes(viewerRole));
  }

  private toFamily(row: FamilyAccountEntity): FamilyAccount {
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      name: row.name,
      plan: row.plan as FamilyAccount['plan'],
      createdAt: Number(row.createdAtMs),
    };
  }

  private toMember(row: FamilyMemberEntity): FamilyMember {
    return {
      id: row.id,
      familyId: row.familyId,
      userId: row.userId,
      role: row.role as FamilyRole,
      display_name: row.displayName ?? undefined,
      joinedAt: Number(row.joinedAtMs),
    };
  }

  private toInvitation(row: FamilyInvitationEntity): FamilyInvitation {
    return {
      id: row.id,
      familyId: row.familyId,
      invitedByUserId: row.invitedByUserId,
      invitee_email: row.inviteeEmail ?? undefined,
      invitee_user_id: row.inviteeUserId ?? undefined,
      proposed_role: row.proposedRole as FamilyRole,
      status: row.status as FamilyInvitation['status'],
      code: row.code,
      createdAt: Number(row.createdAtMs),
      expiresAt: Number(row.expiresAtMs),
    };
  }

  private toPet(row: FamilyPetEntity): FamilyPet {
    return {
      id: row.id,
      familyId: row.familyId,
      name: row.name,
      emotion: row.emotion as FamilyPet['emotion'],
      intimacy_level: row.intimacyLevel,
      shared_among_members: row.sharedAmongMembers ?? [],
      createdAt: Number(row.createdAtMs),
      updatedAt: Number(row.updatedAtMs),
    };
  }

  private toAgent(row: HouseholdAgentEntity): HouseholdAgent {
    return {
      id: row.id,
      familyId: row.familyId,
      role: row.role as HouseholdAgent['role'],
      name: row.name,
      visible_to_roles: (row.visibleToRoles ?? []) as FamilyRole[],
      active: row.active,
      createdAt: Number(row.createdAtMs),
    };
  }
}
