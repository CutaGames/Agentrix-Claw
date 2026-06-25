import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DmcaAbuseLimiterService, DmcaAbuseRateLimitError } from './dmca-abuse-limiter.service';
import { DmcaReport } from '../../entities/dmca-report.entity';

describe('DmcaAbuseLimiterService (SC-T3.4)', () => {
  let svc: DmcaAbuseLimiterService;
  let qb: any;
  let rejectedCount = 0;
  let lastReport: any = null;

  beforeEach(async () => {
    rejectedCount = 0;
    lastReport = null;
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getCount: jest.fn(async () => rejectedCount),
      getOne: jest.fn(async () => lastReport),
    };
    const repo = {
      createQueryBuilder: jest.fn(() => qb),
    };
    const mod = await Test.createTestingModule({
      providers: [
        DmcaAbuseLimiterService,
        { provide: getRepositoryToken(DmcaReport), useValue: repo },
      ],
    }).compile();
    svc = mod.get(DmcaAbuseLimiterService);
  });

  it('< threshold rejected → not limited', async () => {
    rejectedCount = 2;
    const status = await svc.getStatus('u1');
    expect(status.limited).toBe(false);
    expect(status.rejectedCount).toBe(2);
    await expect(svc.assertCanSubmit('u1')).resolves.toBeUndefined();
  });

  it('≥ threshold rejected → limited; within 24h gap throws DmcaAbuseRateLimitError', async () => {
    rejectedCount = 3;
    lastReport = { createdAt: new Date(Date.now() - 60_000) }; // 1 minute ago
    const status = await svc.getStatus('u1');
    expect(status.limited).toBe(true);
    expect(status.nextAllowedAt).toBeInstanceOf(Date);
    await expect(svc.assertCanSubmit('u1')).rejects.toBeInstanceOf(DmcaAbuseRateLimitError);
  });

  it('limited but past 24h gap → assertCanSubmit allows', async () => {
    rejectedCount = 4;
    lastReport = { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) };
    await expect(svc.assertCanSubmit('u1')).resolves.toBeUndefined();
  });

  it('never submitted at all → not limited even if rejectedCount somehow ≥ threshold (defensive)', async () => {
    rejectedCount = 3;
    lastReport = null;
    await expect(svc.assertCanSubmit('u1')).resolves.toBeUndefined();
  });
});
