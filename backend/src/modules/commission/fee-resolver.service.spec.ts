import { FeeResolverService } from './fee-resolver.service';
import { AssetType } from '../../entities/order.entity';

describe('FeeResolverService (Pet Earning Flywheel 需求 9 统一抽佣)', () => {
  const svc = new FeeResolverService();

  it('creation 命名档：平台抽 5%（base 2% + pool 3%）', () => {
    const r = svc.resolvePlatformFee({ category: 'creation', gmv: 1000 });
    expect(r.baseRate).toBeCloseTo(0.02);
    expect(r.poolRate).toBeCloseTo(0.03);
    expect(r.platformFee).toBeCloseTo(20);
    expect(r.poolAmount).toBeCloseTo(30);
    expect(r.platformFee + r.poolAmount).toBeCloseTo(50); // 合计 5%
    expect(r.sellerNet).toBeCloseTo(950);
  });

  it('agent_hire 命名档：平台抽 10%（从原 30% 下调）', () => {
    const r = svc.resolvePlatformFee({ category: 'agent_hire', gmv: 1000 });
    expect(r.platformFee + r.poolAmount).toBeCloseTo(100); // 合计 10%
    expect(r.sellerNet).toBeCloseTo(900);
  });

  it('池按 执行70%/推荐30% 拆分', () => {
    const r = svc.resolvePlatformFee({ category: 'agent_hire', gmv: 1000 });
    expect(r.executorShare).toBeCloseTo(r.poolAmount * 0.7);
    expect(r.referrerShare).toBeCloseTo(r.poolAmount * 0.3);
    expect(r.executorShare + r.referrerShare).toBeCloseTo(r.poolAmount);
  });

  it('AssetType 走既有 resolveRates（SERVICE 合计 5%）', () => {
    const r = svc.resolvePlatformFee({ assetType: AssetType.SERVICE, gmv: 1000 });
    expect(r.platformFee + r.poolAmount).toBeCloseTo(50); // 1% + 4%
  });

  it('拉新返佣 = GMV 的固定 2%', () => {
    expect(svc.resolveReferralGmv(1000)).toBeCloseTo(20);
    expect(svc.referralGmvRate()).toBeCloseTo(0.02);
  });

  it('拉新双边一次性奖励 200/200 AXP', () => {
    expect(svc.referralSignupInviter()).toBe(200);
    expect(svc.referralSignupInvitee()).toBe(200);
  });

  it('非法/零 GMV 归零，不产生负费', () => {
    const r = svc.resolvePlatformFee({ category: 'creation', gmv: -5 });
    expect(r.platformFee).toBe(0);
    expect(r.sellerNet).toBe(0);
    expect(svc.resolveReferralGmv(NaN)).toBe(0);
  });
});
