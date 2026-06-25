import { PetOverageBillingService } from './pet-overage-billing.service';
import { PetGenQuotaService } from './pet-gen-quota.service';

describe('PetOverageBillingService (BE-T2.5)', () => {
  function makeQuota() {
    return { confirm: jest.fn() } as unknown as PetGenQuotaService;
  }

  it('skips when metadata.purpose !== "pet_overage"', async () => {
    const quota = makeQuota();
    const svc = new PetOverageBillingService(quota);
    const out = await svc.handlePaymentIntentSucceeded({
      paymentIntentId: 'pi_1',
      amount: 0.5,
      metadata: { purpose: 'normal_payment' },
    });
    expect(out).toEqual({ handled: false, reason: 'not_pet_overage' });
    expect(quota.confirm).not.toHaveBeenCalled();
  });

  it('skips when metadata is null', async () => {
    const quota = makeQuota();
    const svc = new PetOverageBillingService(quota);
    const out = await svc.handlePaymentIntentSucceeded({
      paymentIntentId: 'pi_1', amount: 0.5, metadata: null,
    });
    expect(out.handled).toBe(false);
  });

  it('returns missing_quota_id when metadata.purpose=pet_overage but no quotaId', async () => {
    const quota = makeQuota();
    const svc = new PetOverageBillingService(quota);
    const out = await svc.handlePaymentIntentSucceeded({
      paymentIntentId: 'pi_1', amount: 0.5, metadata: { purpose: 'pet_overage' },
    });
    expect(out).toEqual({ handled: false, reason: 'missing_quota_id' });
  });

  it('happy path → calls quota.confirm(quotaId, "overage") and returns handled', async () => {
    const quota = makeQuota();
    (quota.confirm as jest.Mock).mockResolvedValue({ period: '2026-05', overageUsed: 1 });
    const svc = new PetOverageBillingService(quota);
    const out = await svc.handlePaymentIntentSucceeded({
      paymentIntentId: 'pi_42',
      amount: 0.5,
      metadata: { purpose: 'pet_overage', quotaId: 'q-1' },
    });
    expect(quota.confirm).toHaveBeenCalledWith('q-1', 'overage');
    expect(out).toEqual({ handled: true });
  });

  it('idempotent: swallows "no reserved capacity" error', async () => {
    const quota = makeQuota();
    (quota.confirm as jest.Mock).mockRejectedValue(new Error('no reserved capacity to confirm'));
    const svc = new PetOverageBillingService(quota);
    const out = await svc.handlePaymentIntentSucceeded({
      paymentIntentId: 'pi_42',
      amount: 0.5,
      metadata: { purpose: 'pet_overage', quotaId: 'q-1' },
    });
    expect(out).toEqual({ handled: false, reason: 'already_confirmed' });
  });

  it('rethrows unexpected errors', async () => {
    const quota = makeQuota();
    (quota.confirm as jest.Mock).mockRejectedValue(new Error('database down'));
    const svc = new PetOverageBillingService(quota);
    await expect(svc.handlePaymentIntentSucceeded({
      paymentIntentId: 'pi_42',
      amount: 0.5,
      metadata: { purpose: 'pet_overage', quotaId: 'q-1' },
    })).rejects.toThrow(/database down/);
  });
});
