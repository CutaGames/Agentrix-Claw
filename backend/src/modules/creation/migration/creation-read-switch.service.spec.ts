import { CreationReadSwitchService } from './creation-read-switch.service';

/**
 * Unit tests for read-switch (task 12.4).
 * 校验:legacy 全旧路径;unified 全统一;canary 按 userId 稳定散列命中;rollback 回 legacy。
 */
describe('CreationReadSwitchService (task 12.4)', () => {
  let svc: CreationReadSwitchService;
  beforeEach(() => { svc = new CreationReadSwitchService(); });

  it('默认 legacy:全部走旧路径', () => {
    expect(svc.getStage()).toBe('legacy');
    expect(svc.shouldReadUnified('u1')).toBe(false);
  });

  it('unified:全部走统一', () => {
    svc.setStage('unified');
    expect(svc.shouldReadUnified('u1')).toBe(true);
    expect(svc.shouldReadUnified(undefined)).toBe(true);
  });

  it('canary:0% 无人命中,100% 全部命中', () => {
    svc.setStage('canary');
    svc.setCohortPercent(0);
    expect(svc.shouldReadUnified('u1')).toBe(false);
    svc.setCohortPercent(100);
    expect(svc.shouldReadUnified('u1')).toBe(true);
  });

  it('canary:同一 userId 判定稳定(不抖动)', () => {
    svc.setStage('canary');
    svc.setCohortPercent(50);
    const first = svc.shouldReadUnified('stable-user');
    for (let i = 0; i < 5; i++) {
      expect(svc.shouldReadUnified('stable-user')).toBe(first);
    }
  });

  it('rollback:一键回到 legacy', () => {
    svc.setStage('unified');
    svc.rollback();
    expect(svc.getStage()).toBe('legacy');
    expect(svc.shouldReadUnified('u1')).toBe(false);
  });
});
