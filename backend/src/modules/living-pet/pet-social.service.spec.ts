import { PetSocialService } from './pet-social.service';

describe('PetSocialService (P2-6)', () => {
  let svc: PetSocialService;
  let petService: any;
  let skinService: any;
  let energyService: any;

  beforeEach(() => {
    petService = {
      findPublicCard: jest.fn().mockResolvedValue({
        pet_id: 'pet-1',
        user_id: 'owner-1',
        name: 'Test',
        soul_template_id: 'claw',
        intimacy_level: 0,
        intimacy_xp: 0,
        primary_agent_id: null,
        created_at: Date.now(),
        emotion: 'calm',
        emotion_intensity: 0,
        updated_at: Date.now(),
      }),
    };
    skinService = {
      getActive: jest.fn().mockResolvedValue({ activeSkinId: 'skin-1' }),
    };
    energyService = {
      credit: jest.fn().mockResolvedValue({ energy: 50 }),
    };
    svc = new PetSocialService(petService, skinService, energyService);
  });

  it('rejects self action', async () => {
    await expect(
      svc.perform({ petId: 'pet-1', visitorUserId: 'owner-1', action: 'visit' }),
    ).rejects.toMatchObject({ response: { code: 'self_action_forbidden' } });
  });

  it('records a visit and returns entry', async () => {
    const r = await svc.perform({ petId: 'pet-1', visitorUserId: 'visitor-1', action: 'visit' });
    expect(r.action).toBe('visit');
    expect(r.energy_delta).toBe(0);
    expect(r.owner_user_id).toBe('owner-1');
    expect(svc.listForPet('pet-1')).toHaveLength(1);
  });

  it('feed credits 5 energy on active skin', async () => {
    const r = await svc.perform({ petId: 'pet-1', visitorUserId: 'visitor-1', action: 'feed' });
    expect(energyService.credit).toHaveBeenCalledWith('owner-1', 'skin-1', 5, expect.any(Object));
    expect(r.energy_delta).toBe(5);
  });

  it('co_play credits 3 energy', async () => {
    await svc.perform({ petId: 'pet-1', visitorUserId: 'visitor-1', action: 'co_play' });
    expect(energyService.credit).toHaveBeenCalledWith('owner-1', 'skin-1', 3, expect.any(Object));
  });

  it('rate-limits same (visitor, owner, action) within 60s', async () => {
    await svc.perform({ petId: 'pet-1', visitorUserId: 'visitor-1', action: 'touch' });
    await expect(
      svc.perform({ petId: 'pet-1', visitorUserId: 'visitor-1', action: 'touch' }),
    ).rejects.toMatchObject({ response: { code: 'rate_limited' } });
  });

  it('different actions are not rate-limited together', async () => {
    await svc.perform({ petId: 'pet-1', visitorUserId: 'visitor-1', action: 'touch' });
    const r = await svc.perform({ petId: 'pet-1', visitorUserId: 'visitor-1', action: 'visit' });
    expect(r.action).toBe('visit');
  });

  it('truncates message to 80 chars', async () => {
    const long = 'a'.repeat(200);
    const r = await svc.perform({
      petId: 'pet-1',
      visitorUserId: 'visitor-1',
      action: 'visit',
      message: long,
    });
    expect(r.message?.length).toBe(80);
  });

  it('returns 404 when pet not found', async () => {
    petService.findPublicCard.mockResolvedValueOnce(null);
    await expect(
      svc.perform({ petId: 'nope', visitorUserId: 'visitor-1', action: 'visit' }),
    ).rejects.toMatchObject({ response: { code: 'pet_not_found' } });
  });

  it('listForPet honors limit', async () => {
    for (let i = 0; i < 3; i++) {
      svc._resetForTest();
      await svc.perform({ petId: 'pet-1', visitorUserId: `v-${i}`, action: 'visit' });
    }
    expect(svc.listForPet('pet-1', 1)).toHaveLength(1);
  });
});
