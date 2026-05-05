import { BadRequestException } from '@nestjs/common';
import { FamilyAccountService } from './family-account.service';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function matchWhere<T extends Record<string, any>>(row: T, where: Record<string, any>) {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function createMockRepo<T extends Record<string, any>>() {
  const store = new Map<string, T>();

  return {
    create: jest.fn((input: Partial<T>) => ({ ...input } as T)),
    save: jest.fn(async (input: T) => {
      const saved = deepClone(input);
      store.set(String(saved.id), saved);
      return deepClone(saved);
    }),
    find: jest.fn(async (options?: { where?: Record<string, any> }) => {
      let rows = Array.from(store.values()).map((row) => deepClone(row));
      if (options?.where) {
        rows = rows.filter((row) => matchWhere(row, options.where!));
      }
      return rows;
    }),
    findOne: jest.fn(async (options: { where: Record<string, any> }) => {
      const row = Array.from(store.values()).find((item) => matchWhere(item, options.where));
      return row ? deepClone(row) : null;
    }),
  };
}

describe('FamilyAccountService', () => {
  it('persists family, invitation, pet, and household agent across service instances', async () => {
    const familyRepo = createMockRepo<any>();
    const memberRepo = createMockRepo<any>();
    const invitationRepo = createMockRepo<any>();
    const petRepo = createMockRepo<any>();
    const agentRepo = createMockRepo<any>();
    const service = new FamilyAccountService(
      familyRepo as any,
      memberRepo as any,
      invitationRepo as any,
      petRepo as any,
      agentRepo as any,
    );

    const family = await service.createFamily('owner-1', { name: 'Home Base' });
    const invitation = await service.invite('owner-1', family.id, { user_id: 'member-1', role: 'member' });
    const member = await service.acceptInvitation('member-1', invitation.code);
    const pet = await service.setupFamilyPet('owner-1', family.id, { name: 'Mochi' });
    const agent = await service.createHouseholdAgent('owner-1', family.id, {
      role: 'butler',
      name: 'Aira Butler',
      visible_to_roles: ['owner', 'member'],
    });

    const fresh = new FamilyAccountService(
      familyRepo as any,
      memberRepo as any,
      invitationRepo as any,
      petRepo as any,
      agentRepo as any,
    );
    const families = await fresh.listMyFamilies('member-1');
    const members = await fresh.listMembers(family.id, 'owner-1');
    const storedPet = await fresh.getFamilyPet(family.id, 'member-1');
    const agents = await fresh.listHouseholdAgents(family.id, 'member-1');

    expect(member.familyId).toBe(family.id);
    expect(families).toHaveLength(1);
    expect(members).toHaveLength(2);
    expect(storedPet.name).toBe('Mochi');
    expect(agent.id).toBeDefined();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('Aira Butler');
    expect(pet.familyId).toBe(family.id);
  });

  it('blocks member from inviting others', async () => {
    const familyRepo = createMockRepo<any>();
    const memberRepo = createMockRepo<any>();
    const invitationRepo = createMockRepo<any>();
    const petRepo = createMockRepo<any>();
    const agentRepo = createMockRepo<any>();
    const service = new FamilyAccountService(
      familyRepo as any,
      memberRepo as any,
      invitationRepo as any,
      petRepo as any,
      agentRepo as any,
    );

    const family = await service.createFamily('owner-1', { name: 'Family' });
    const invitation = await service.invite('owner-1', family.id, { user_id: 'member-1' });
    await service.acceptInvitation('member-1', invitation.code);

    const fresh = new FamilyAccountService(
      familyRepo as any,
      memberRepo as any,
      invitationRepo as any,
      petRepo as any,
      agentRepo as any,
    );

    await expect(fresh.invite('member-1', family.id, { user_id: 'member-2' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
