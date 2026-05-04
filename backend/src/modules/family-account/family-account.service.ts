import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

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
  private families = new Map<string, FamilyAccount>();
  private members = new Map<string, FamilyMember[]>(); // familyId → members
  private invitations = new Map<string, FamilyInvitation>();
  private pets = new Map<string, FamilyPet>(); // familyId → pet
  private agents = new Map<string, HouseholdAgent[]>(); // familyId → agents

  private genId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private requireMembership(familyId: string, userId: string): FamilyMember {
    const m = (this.members.get(familyId) || []).find((x) => x.userId === userId);
    if (!m) throw new BadRequestException('not a family member');
    return m;
  }

  createFamily(userId: string, body: { name: string; plan?: FamilyAccount['plan'] }): FamilyAccount {
    if (!body?.name) throw new BadRequestException('name required');
    const f: FamilyAccount = {
      id: this.genId('fam'),
      ownerUserId: userId,
      name: body.name,
      plan: body.plan || 'family_pro',
      createdAt: Date.now(),
    };
    this.families.set(f.id, f);
    const owner: FamilyMember = {
      id: this.genId('mem'),
      familyId: f.id,
      userId,
      role: 'owner',
      joinedAt: Date.now(),
    };
    this.members.set(f.id, [owner]);
    this.agents.set(f.id, []);
    return f;
  }

  listMyFamilies(userId: string): FamilyAccount[] {
    const out: FamilyAccount[] = [];
    for (const f of this.families.values()) {
      const ms = this.members.get(f.id) || [];
      if (ms.some((m) => m.userId === userId)) out.push(f);
    }
    return out;
  }

  getFamily(familyId: string, userId: string): FamilyAccount {
    const f = this.families.get(familyId);
    if (!f) throw new NotFoundException('family not found');
    this.requireMembership(familyId, userId);
    return f;
  }

  invite(userId: string, familyId: string, body: { email?: string; user_id?: string; role?: FamilyRole }): FamilyInvitation {
    const me = this.requireMembership(familyId, userId);
    if (me.role !== 'owner' && me.role !== 'admin') throw new BadRequestException('only owner/admin can invite');
    const inv: FamilyInvitation = {
      id: this.genId('inv'),
      familyId,
      invitedByUserId: userId,
      invitee_email: body.email,
      invitee_user_id: body.user_id,
      proposed_role: body.role || 'member',
      status: 'pending',
      code: Math.random().toString(36).slice(2, 8).toUpperCase(),
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    this.invitations.set(inv.id, inv);
    return inv;
  }

  acceptInvitation(userId: string, code: string): FamilyMember {
    const inv = Array.from(this.invitations.values()).find((i) => i.code === code);
    if (!inv) throw new NotFoundException('invitation not found');
    if (inv.status !== 'pending') throw new BadRequestException(`invitation is ${inv.status}`);
    if (Date.now() > inv.expiresAt) {
      inv.status = 'expired';
      throw new BadRequestException('invitation expired');
    }
    const ms = this.members.get(inv.familyId) || [];
    if (ms.some((m) => m.userId === userId)) throw new BadRequestException('already a member');
    const m: FamilyMember = {
      id: this.genId('mem'),
      familyId: inv.familyId,
      userId,
      role: inv.proposed_role,
      joinedAt: Date.now(),
    };
    ms.push(m);
    this.members.set(inv.familyId, ms);
    inv.status = 'accepted';
    return m;
  }

  listMembers(familyId: string, userId: string): FamilyMember[] {
    this.requireMembership(familyId, userId);
    return this.members.get(familyId) || [];
  }

  // Family Pet
  setupFamilyPet(userId: string, familyId: string, body: { name: string }): FamilyPet {
    this.requireMembership(familyId, userId);
    const pet: FamilyPet = {
      id: this.genId('fpet'),
      familyId,
      name: body.name || 'FamilyPet',
      emotion: 'calm',
      intimacy_level: 1,
      shared_among_members: (this.members.get(familyId) || []).map((m) => m.userId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.pets.set(familyId, pet);
    return pet;
  }

  getFamilyPet(familyId: string, userId: string): FamilyPet {
    this.requireMembership(familyId, userId);
    const p = this.pets.get(familyId);
    if (!p) throw new NotFoundException('family pet not setup');
    return p;
  }

  setFamilyPetEmotion(userId: string, familyId: string, body: { emotion: FamilyPet['emotion'] }): FamilyPet {
    const p = this.getFamilyPet(familyId, userId);
    p.emotion = body.emotion;
    p.updatedAt = Date.now();
    return p;
  }

  // Household Agent
  createHouseholdAgent(userId: string, familyId: string, body: {
    role: HouseholdAgent['role'];
    name: string;
    visible_to_roles?: FamilyRole[];
  }): HouseholdAgent {
    const me = this.requireMembership(familyId, userId);
    if (me.role !== 'owner' && me.role !== 'admin') throw new BadRequestException('only owner/admin can create household agent');
    const a: HouseholdAgent = {
      id: this.genId('hag'),
      familyId,
      role: body.role,
      name: body.name,
      visible_to_roles: body.visible_to_roles || ['owner', 'admin', 'member', 'child'],
      active: true,
      createdAt: Date.now(),
    };
    const list = this.agents.get(familyId) || [];
    list.push(a);
    this.agents.set(familyId, list);
    return a;
  }

  listHouseholdAgents(familyId: string, userId: string): HouseholdAgent[] {
    const me = this.requireMembership(familyId, userId);
    return (this.agents.get(familyId) || []).filter((a) => a.visible_to_roles.includes(me.role));
  }
}
