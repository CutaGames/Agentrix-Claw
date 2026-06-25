import { ReferralFlywheelService } from './referral-flywheel.service';
import { FeeResolverService } from '../commission/fee-resolver.service';

const INVITER = '11111111-1111-1111-1111-111111111111';
const INVITEE = '22222222-2222-2222-2222-222222222222';

function makeDeps() {
  const rows: any[] = [];
  let idc = 0;
  const repo = {
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => r.inviteeUserId === where.inviteeUserId) || null),
    create: jest.fn((o: any) => ({ ...o })),
    save: jest.fn(async (r: any) => { if (!r.id) { r.id = `rel-${++idc}`; rows.push(r); } return r; }),
    find: jest.fn(async ({ where }: any) => rows.filter((r) => r.inviterUserId === where.inviterUserId)),
  } as any;
  const axp = { earn: jest.fn(async () => ({ ledger_id: 'l', balance: 0 })) } as any;
  const fees = new FeeResolverService();
  const linkService = { getLinkByShortCode: jest.fn(), recordConversion: jest.fn(async () => {}) } as any;
  return { repo, axp, fees, linkService, rows };
}

describe('ReferralFlywheelService (需求 4 裂变)', () => {
  it('onSignup 归因 + 双边各 200 AXP（refId 精确一次）', async () => {
    const { repo, axp, fees, linkService } = makeDeps();
    const svc = new ReferralFlywheelService(repo, axp, fees, linkService);
    const r = await svc.onSignup(INVITEE, INVITER);
    expect(r.attributed).toBe(true);
    expect(r.inviterUserId).toBe(INVITER);
    expect(axp.earn).toHaveBeenCalledTimes(2);
    const calls = axp.earn.mock.calls.map((c: any[]) => c[0]);
    const inviter = calls.find((c: any) => c.userId === INVITER);
    const invitee = calls.find((c: any) => c.userId === INVITEE);
    expect(inviter).toMatchObject({ source: 'referral_signup', amount: 200, refId: r.relationId });
    expect(invitee).toMatchObject({ source: 'referral_signup', amount: 200, refId: `${r.relationId}:invitee` });
  });

  it('onSignup 自我推荐不归因', async () => {
    const { repo, axp, fees, linkService } = makeDeps();
    const svc = new ReferralFlywheelService(repo, axp, fees, linkService);
    const r = await svc.onSignup(INVITEE, INVITEE);
    expect(r.attributed).toBe(false);
    expect(axp.earn).not.toHaveBeenCalled();
  });

  it('onSignup 已归因不重复发奖', async () => {
    const { repo, axp, fees, linkService } = makeDeps();
    const svc = new ReferralFlywheelService(repo, axp, fees, linkService);
    await svc.onSignup(INVITEE, INVITER);
    axp.earn.mockClear();
    const r2 = await svc.onSignup(INVITEE, INVITER);
    expect(r2.alreadyExisted).toBe(true);
    expect(axp.earn).not.toHaveBeenCalled();
  });

  it('onSignup 经 shortCode 解析邀请人并回写转化', async () => {
    const { repo, axp, fees, linkService } = makeDeps();
    linkService.getLinkByShortCode.mockResolvedValue({ ownerId: INVITER });
    const svc = new ReferralFlywheelService(repo, axp, fees, linkService);
    const r = await svc.onSignup(INVITEE, 'abcd1234');
    expect(r.attributed).toBe(true);
    expect(r.inviterUserId).toBe(INVITER);
    expect(linkService.recordConversion).toHaveBeenCalledWith('abcd1234');
  });

  it('onInviteeGmv 按 GMV 2% 发 referral_gmv_pct（refId=订单，幂等键）', async () => {
    const { repo, axp, fees, linkService } = makeDeps();
    const svc = new ReferralFlywheelService(repo, axp, fees, linkService);
    await svc.onSignup(INVITEE, INVITER);
    axp.earn.mockClear();
    const r = await svc.onInviteeGmv(INVITEE, 'order-1', 1000); // 2% → 20 AXP
    expect(r.rewarded).toBe(true);
    expect(r.axpReward).toBe(20);
    expect(axp.earn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: INVITER, source: 'referral_gmv_pct', amount: 20, refId: 'order-1' }),
    );
  });

  it('onInviteeGmv 无归因关系则跳过', async () => {
    const { repo, axp, fees, linkService } = makeDeps();
    const svc = new ReferralFlywheelService(repo, axp, fees, linkService);
    const r = await svc.onInviteeGmv(INVITEE, 'order-x', 1000);
    expect(r.rewarded).toBe(false);
    expect(axp.earn).not.toHaveBeenCalled();
  });
});
