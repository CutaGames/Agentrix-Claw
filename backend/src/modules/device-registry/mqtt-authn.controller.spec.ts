import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Device } from '../../entities/device.entity';
import { MqttAuthnController } from './mqtt-authn.controller';

describe('MqttAuthnController (BE-10.1)', () => {
  let ctrl: MqttAuthnController;
  const store: Device[] = [];

  beforeEach(async () => {
    store.length = 0;
    const repo: any = {
      findOne: async ({ where }: any) =>
        store.find((d) => d.deviceId === where.deviceId) ?? null,
      save: async (d: any) => {
        const i = store.findIndex((x) => x.id === d.id);
        if (i >= 0) store[i] = d;
        else store.push(d);
        return d;
      },
    };
    const mod = await Test.createTestingModule({
      controllers: [MqttAuthnController],
      providers: [{ provide: getRepositoryToken(Device), useValue: repo }],
    }).compile();
    ctrl = mod.get(MqttAuthnController);
  });

  function seed(deviceId: string, dst: string) {
    const dstHash = crypto.createHash('sha256').update(dst).digest('hex');
    store.push({
      id: 'x', userId: 'u', deviceId, dstHash, lastNonce: '0',
      online: false, lastSeenAt: null, label: null, deviceClass: 'other',
      vendor: null, firmwareVersion: null, createdAt: new Date(), updatedAt: new Date(),
    } as any);
  }

  it('allow on matching DST', async () => {
    seed('d1', 'good-dst');
    const r = await ctrl.authn({ client_id: 'd1', username: 'd1', password: 'good-dst' });
    expect(r).toEqual({ result: 'allow', is_superuser: false });
    expect(store[0].online).toBe(true);
  });

  it('deny on wrong DST', async () => {
    seed('d1', 'good-dst');
    const r = await ctrl.authn({ client_id: 'd1', username: 'd1', password: 'wrong' });
    expect(r).toEqual({ result: 'deny' });
  });

  it('deny on unknown device', async () => {
    const r = await ctrl.authn({ client_id: 'd1', username: 'd1', password: 'x' });
    expect(r).toEqual({ result: 'deny' });
  });

  it('deny on missing fields', async () => {
    const r = await ctrl.authn({});
    expect(r).toEqual({ result: 'deny' });
  });

  it('deny on revoked device (empty dst_hash)', async () => {
    seed('d1', 'x');
    store[0].dstHash = '';
    const r = await ctrl.authn({ client_id: 'd1', username: 'd1', password: 'x' });
    expect(r).toEqual({ result: 'deny' });
  });
});
