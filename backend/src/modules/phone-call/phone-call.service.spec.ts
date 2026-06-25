import { PhoneCallService } from './phone-call.service';

describe('PhoneCallService', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('returns stub call when API key missing', async () => {
    delete process.env.VAPI_API_KEY;
    delete process.env.VAPI_PHONE_NUMBER_ID;
    const svc = new PhoneCallService();
    expect(svc.isLiveMode()).toBe(false);
    const r = await svc.place({ to: '+14155552671' });
    expect(r.stub).toBe(true);
    expect(r.status).toBe('stub');
    expect(r.callId).toMatch(/^stub_/);
  });

  it('rejects invalid phone numbers', async () => {
    const svc = new PhoneCallService();
    await expect(svc.place({ to: 'not-a-phone' })).rejects.toThrow(/E\.164/);
    await expect(svc.place({ to: '' })).rejects.toThrow(/E\.164/);
  });

  it('hits Vapi API in live mode and returns parsed call', async () => {
    process.env.VAPI_API_KEY = 'test-key';
    process.env.VAPI_PHONE_NUMBER_ID = 'pn-123';
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'call-abc', status: 'queued' }),
      } as any);
    const svc = new PhoneCallService();
    expect(svc.isLiveMode()).toBe(true);
    const r = await svc.place({
      to: '+14155552671',
      assistant: { firstMessage: 'Hi', systemPrompt: 'be brief' },
    });
    expect(r.callId).toBe('call-abc');
    expect(r.status).toBe('queued');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.vapi.ai/call',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on Vapi API error', async () => {
    process.env.VAPI_API_KEY = 'test-key';
    process.env.VAPI_PHONE_NUMBER_ID = 'pn-123';
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    } as any);
    const svc = new PhoneCallService();
    await expect(
      svc.place({ to: '+14155552671', assistantId: 'a-1' }),
    ).rejects.toThrow(/Vapi API 401/);
  });
});
