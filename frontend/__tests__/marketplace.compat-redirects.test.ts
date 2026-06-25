/**
 * P1-10 — Marketplace compat redirect contract
 *
 * /marketplace/skins{,/[id]} 在 PRD 里仍被引用，但实际市场页已迁移到
 * /marketplace/pets。如果重定向被误删，PRD 链接会 404，且历史 SEO/分享
 * 链接会全断。本测试锁住兼容契约。
 */
import { describe, it, expect } from 'vitest';
import { getServerSideProps as skinsListGSSP } from '../pages/marketplace/skins/index';
import { getServerSideProps as skinDetailGSSP } from '../pages/marketplace/skins/[id]';

describe('marketplace compat redirects (P1-10)', () => {
  it('/marketplace/skins → /marketplace/pets (308)', async () => {
    const result = await (skinsListGSSP as any)({ params: {}, query: {}, req: {}, res: {} });
    expect(result).toEqual({
      redirect: { destination: '/marketplace/pets', permanent: true },
    });
  });

  it('/marketplace/skins/[id] → /marketplace/pets/[id] (308) preserves id', async () => {
    const ctx: any = { params: { id: 'sk_demo' }, query: {}, req: {}, res: {} };
    const result = await (skinDetailGSSP as any)(ctx);
    expect(result.redirect).toBeDefined();
    expect(result.redirect.permanent).toBe(true);
    expect(result.redirect.destination).toContain('sk_demo');
    expect(result.redirect.destination).toMatch(/^\/marketplace\/pets\//);
  });
});
