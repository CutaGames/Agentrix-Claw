import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { OtaPackage } from '../../entities/ota-package.entity';
import { OtaService } from './ota.service';

/**
 * Phase 5 BE-10.3 / HW-T5.8 / HW-T5.15 — chunked OTA package service.
 */
describe('OtaService', () => {
  let svc: OtaService;
  const store: OtaPackage[] = [];
  let tmpDir: string;

  beforeEach(async () => {
    store.length = 0;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-'));
    let n = 0;
    const qbResult = { current: null as OtaPackage | null };
    const repo: any = {
      create: (p: any) => ({ ...p, id: `o${++n}`, createdAt: new Date() }),
      save: async (p: any) => {
        const i = store.findIndex((x) => x.id === p.id);
        if (i >= 0) store[i] = p;
        else store.push(p);
        return p;
      },
      findOne: async ({ where }: any) =>
        store.find(
          (p) =>
            (where.id && p.id === where.id) ||
            (where.deviceClass && p.deviceClass === where.deviceClass && p.version === where.version),
        ) ?? null,
      createQueryBuilder: () => {
        const ctx: any = { dc: '', ch: '' };
        const qb: any = {
          where: (_: string, p: any) => { ctx.dc = p.dc; return qb; },
          andWhere: (_: string, p: any) => { ctx.ch = p.ch; return qb; },
          orderBy: () => qb,
          getOne: async () => {
            const matches = store.filter((p) => p.deviceClass === ctx.dc && p.channel === ctx.ch);
            return matches.sort((a, b) => +b.createdAt - +a.createdAt)[0] || null;
          },
        };
        return qb;
      },
    };
    const mod = await Test.createTestingModule({
      providers: [OtaService, { provide: getRepositoryToken(OtaPackage), useValue: repo }],
    }).compile();
    svc = mod.get(OtaService);
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('publish → manifest → chunk round-trip', async () => {
    const bytes = crypto.randomBytes(10_000);
    const pkg = await svc.publish({
      deviceClass: 'claw_stick',
      version: '1.0.0',
      bytes,
      storageDir: tmpDir,
    });
    expect(pkg.sha256).toHaveLength(64);

    const m = await svc.manifestFor('claw_stick', 'stable', 4096);
    expect(m.size_bytes).toBe(10_000);
    expect(m.chunk_count).toBe(3);

    let acc = Buffer.alloc(0);
    for (let i = 0; i < m.chunk_count; i++) {
      const c = await svc.getChunk(m.package_id, i, 4096);
      acc = Buffer.concat([acc, Buffer.from(c.data, 'base64')]);
      // per-chunk integrity field present
      expect(c.chunk_sha256).toHaveLength(64);
    }
    expect(crypto.createHash('sha256').update(acc).digest('hex')).toBe(m.sha256);
  });

  it('rejects out-of-range chunk index', async () => {
    const bytes = Buffer.from('hi');
    const pkg = await svc.publish({ deviceClass: 'plush', version: '0.1.0', bytes, storageDir: tmpDir });
    const m = await svc.manifestFor('plush');
    await expect(svc.getChunk(pkg.id, m.chunk_count + 1)).rejects.toThrow(/range/i);
  });

  it('manifestFor throws when no firmware present', async () => {
    await expect(svc.manifestFor('unknown_class')).rejects.toThrow(/no firmware/i);
  });
});
