import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ModerationService } from './moderation.service';
import { ModerationLog } from '../../entities/moderation-log.entity';

/**
 * BE-T2.6 — 关键词审核拦截，全部走 ModerationLog。
 */
describe('ModerationService (Phase 2 W1)', () => {
  let service: ModerationService;

  const logRepo = {
    create: jest.fn((p) => p),
    save: jest.fn((p) => Promise.resolve({ ...p, id: 'log-1', createdAt: new Date() })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ModerationService,
        { provide: getRepositoryToken(ModerationLog), useValue: logRepo },
      ],
    }).compile();
    service = mod.get(ModerationService);
  });

  describe('checkPromptSync (pure)', () => {
    it.each([
      ['nude photo'],
      ['NSFW request'],
      ['lolicon art'],
      ['sexual content'],
      ['gore beheading'],
      ['kill yourself now'],
    ])('denies "%s"', (prompt) => {
      const r = ModerationService.checkPromptSync(prompt);
      expect(r.decision).toBe('deny');
      expect(r.reason).toBe('nsfw_keyword');
      expect(r.score).toBeGreaterThanOrEqual(1.0);
    });

    it.each([
      ['cute orange cat playing with a ball'],
      ['minimalist office desk illustration'],
      ['dragon flying over mountain at sunset'],
    ])('allows "%s"', (prompt) => {
      const r = ModerationService.checkPromptSync(prompt);
      expect(r.decision).toBe('allow');
      expect(r.reason).toBeNull();
    });

    it('case-insensitive match', () => {
      expect(ModerationService.checkPromptSync('Naked Body').decision).toBe('deny');
      expect(ModerationService.checkPromptSync('naked body').decision).toBe('deny');
    });

    it('handles empty / nullish input', () => {
      expect(ModerationService.checkPromptSync('').decision).toBe('allow');
      expect(ModerationService.checkPromptSync(null as any).decision).toBe('allow');
    });
  });

  describe('checkPrompt (logged)', () => {
    it('persists log row with hash + decision (deny path)', async () => {
      const r = await service.checkPrompt({ userId: 'u1', prompt: 'nude photo' });
      expect(r.decision).toBe('deny');
      expect(logRepo.save).toHaveBeenCalledTimes(1);
      const saved = (logRepo.save.mock.calls[0][0] as any);
      expect(saved.kind).toBe('prompt');
      expect(saved.decision).toBe('deny');
      expect(saved.userId).toBe('u1');
      expect(saved.inputHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('persists log row for allow path too', async () => {
      const r = await service.checkPrompt({ userId: 'u1', prompt: 'cute robot pet' });
      expect(r.decision).toBe('allow');
      expect(logRepo.save).toHaveBeenCalledTimes(1);
      expect((logRepo.save.mock.calls[0][0] as any).decision).toBe('allow');
    });
  });

  describe('checkImage (placeholder)', () => {
    it('returns allow + reason="not_implemented" and logs hash', async () => {
      const r = await service.checkImage({ userId: 'u1', imageBuffer: Buffer.from('img-bytes') });
      expect(r.decision).toBe('allow');
      expect(r.reason).toBe('not_implemented');
      const saved = (logRepo.save.mock.calls[0][0] as any);
      expect(saved.kind).toBe('image');
      expect(saved.inputHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  it('sha256 helper produces stable 64-hex hash', () => {
    expect(ModerationService.sha256('agentrix')).toMatch(/^[a-f0-9]{64}$/);
    expect(ModerationService.sha256('agentrix')).toBe(ModerationService.sha256('agentrix'));
  });
});
