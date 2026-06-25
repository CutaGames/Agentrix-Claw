import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Device } from '../../entities/device.entity';
import { DeviceRegistryService } from './device-registry.service';

/**
 * Phase 5 BE-10.2 / HW-T5.4-T5.7 — Device registry + DST attestation.
 */
describe('DeviceRegistryService', () => {
  let svc: DeviceRegistryService;
  const store: Device[] = [];

  beforeEach(async () => {
    store.length = 0;
    let n = 0;
    const repo: any = {
      create: (p: any) => ({ ...p, id: `d${++n}`, createdAt: new Date(), updatedAt: new Date() }),
      save: async (d: any) => {
        const i = store.findIndex((x) => x.id === d.id);
        if (i >= 0) store[i] = d;
        else store.push(d);
        return d;
      },
      findOne: async ({ where }: any) =>
        store.find((d) => (where.deviceId && d.deviceId === where.deviceId) || (where.id && d.id === where.id)) ?? null,
      find: async ({ where, order }: any) => {
        let r = store.filter((d) => d.userId === where.userId);
        if (order) r = [...r].sort((a, b) => +b.createdAt - +a.createdAt);
        return r;
      },
    };
    const mod = await Test.createTestingModule({
      providers: [DeviceRegistryService, { provide: getRepositoryToken(Device), useValue: repo }],
    }).compile();
    svc = mod.get(DeviceRegistryService);
  });

  it('issueTicket → pair round-trip mints unique DST', async () => {
    const t = svc.issueTicket('u1');
    const r = await svc.pair({ ticket: t.ticket, deviceId: 'mac:aabbcc', deviceClass: 'claw_stick' });
    expect(r.dst).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(r.device.userId).toBe('u1');
    expect(r.device.deviceClass).toBe('claw_stick');
    expect(r.device.dstHash).toHaveLength(64);
  });

  it('rejects ticket re-use', async () => {
    const t = svc.issueTicket('u1');
    await svc.pair({ ticket: t.ticket, deviceId: 'd1' });
    await expect(svc.pair({ ticket: t.ticket, deviceId: 'd1' })).rejects.toThrow(/ticket/i);
  });

  it('rejects pairing same device under another user', async () => {
    const t1 = svc.issueTicket('u1');
    await svc.pair({ ticket: t1.ticket, deviceId: 'd1' });
    const t2 = svc.issueTicket('u2');
    await expect(svc.pair({ ticket: t2.ticket, deviceId: 'd1' })).rejects.toThrow(/another user/i);
  });

  it('verifyAttestation accepts correct HMAC and rejects nonce replay (HW-T5.9)', async () => {
    const t = svc.issueTicket('u1');
    const r = await svc.pair({ ticket: t.ticket, deviceId: 'd1' });
    const payload = 'req_x|approve|1';
    const att = svc.computeAttestation(r.device.dstHash, payload);
    await expect(svc.verifyAttestation('d1', payload, att, 1)).resolves.toBeTruthy();
    // Replay
    await expect(svc.verifyAttestation('d1', payload, att, 1)).rejects.toThrow(/replay/i);
    // Forward nonce, fresh attestation
    const p2 = 'req_y|approve|2';
    const att2 = svc.computeAttestation(r.device.dstHash, p2);
    await expect(svc.verifyAttestation('d1', p2, att2, 2)).resolves.toBeTruthy();
  });

  it('verifyAttestation rejects forged HMAC (HW-T5.9)', async () => {
    const t = svc.issueTicket('u1');
    await svc.pair({ ticket: t.ticket, deviceId: 'd1' });
    await expect(
      svc.verifyAttestation('d1', 'p', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 1),
    ).rejects.toThrow();
  });

  it('revoke clears DST hash so attestation fails', async () => {
    const t = svc.issueTicket('u1');
    const r = await svc.pair({ ticket: t.ticket, deviceId: 'd1' });
    await svc.revoke('u1', 'd1');
    const att = svc.computeAttestation(r.device.dstHash, 'p');
    await expect(svc.verifyAttestation('d1', 'p', att, 1)).rejects.toThrow(/not paired/i);
  });

  it('markPresence updates online + lastSeenAt', async () => {
    const t = svc.issueTicket('u1');
    await svc.pair({ ticket: t.ticket, deviceId: 'd1' });
    await svc.markPresence('d1', true);
    const list = await svc.list('u1');
    expect(list[0].online).toBe(true);
    expect(list[0].lastSeenAt).toBeInstanceOf(Date);
  });
});
