import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AxpRedeemService } from './redeem.service';

describe('AxpRedeemService', () => {
  let svc: AxpRedeemService;
  const axp = {
    spend: jest.fn().mockResolvedValue({ ledger_id: 'led_1', balance: 100 }),
  } as any;

  beforeEach(() => {
    axp.spend.mockClear();
    svc = new AxpRedeemService(axp);
  });

  it('returns the catalog with all 8 items', async () => {
    const cat = await svc.getCatalog();
    expect(cat.items.length).toBe(8);
    expect(cat.items.find((i) => i.id === 'lottery_pull')).toBeTruthy();
    expect(cat.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('rejects unknown item id', async () => {
    await expect(svc.redeem('user-1', 'bogus')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects empty item id', async () => {
    await expect(svc.redeem('user-1', '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('spends correct amount and maps category to AXP source (unique refId per call)', async () => {
    const r = await svc.redeem('user-1', 'sub_discount_5');
    expect(axp.spend).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amount: 500,
        source: 'sub_discount',
        refId: expect.stringMatching(/^sub_discount_5:/),
      }),
    );
    expect(r.success).toBe(true);
    expect(r.remaining_balance).toBe(100);
  });

  it('uses caller idempotencyKey as refId when provided (exactly-once redeem)', async () => {
    await svc.redeem('user-1', 'sub_discount_5', 'order-abc');
    expect(axp.spend).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'sub_discount', refId: 'order-abc' }),
    );
  });

  it('repeat redeem of same item produces distinct refIds (repeatable)', async () => {
    await svc.redeem('user-1', 'sub_discount_5');
    await svc.redeem('user-1', 'sub_discount_5');
    const refs = (axp.spend as jest.Mock).mock.calls.map((c: any[]) => c[0].refId);
    expect(refs[0]).not.toBe(refs[1]);
  });

  it('decrements stock for limited items', async () => {
    const c1 = await svc.getCatalog();
    const initialStock = c1.items.find((i) => i.id === 'limited_skin_cyber_cat')!.stock!;
    await svc.redeem('user-1', 'limited_skin_cyber_cat');
    const c2 = await svc.getCatalog();
    const newStock = c2.items.find((i) => i.id === 'limited_skin_cyber_cat')!.stock!;
    expect(newStock).toBe(initialStock - 1);
  });

  it('refuses sold-out item', async () => {
    // Drain nft_preorder (stock 20) for this test instance.
    const c = await svc.getCatalog();
    const initialStock = c.items.find((i) => i.id === 'nft_preorder')!.stock!;
    for (let i = 0; i < initialStock; i++) {
      await svc.redeem('user-1', 'nft_preorder');
    }
    await expect(svc.redeem('user-1', 'nft_preorder')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
