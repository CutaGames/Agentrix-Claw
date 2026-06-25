import fc from 'fast-check';
import {
  screenLeadAuthenticity,
  dedupLeads,
  leadDedupKey,
  checkLeadCompleteness,
  buildQualifiedLeadList,
  leadExportRequiresApproval,
  DEFAULT_LEAD_COLLECTION_CONFIG,
  type LeadEntry,
  type LeadCollectionConfig,
} from './whitelist-leads';

/**
 * 白名单 / 候补名单收集纯函数单测(任务 19.5 / 需求 14.23–14.25)。
 *
 * 覆盖:
 *   - 基础真实性校验(14.23):邮箱/钱包格式、一次性邮箱域名、无标识;缺字段不编造信号。
 *   - 去重(14.23):按 walletAddress/email 归一化去重;无标识不去重原样保留。
 *   - 合格判定(14.23):字段完整 ∧ 过去重 ∧ 非疑似。
 *   - 量化口径(14.24):合格 leads 数 / 去重剔除数 / 可疑数及依据。
 *   - 导出审批边界(14.24):名单导出需审批(常量恒为 true)。
 */
describe('whitelist-leads 纯函数(任务 19.5 / 需求 14.23–14.25)', () => {
  const config: LeadCollectionConfig = {
    requiredFields: ['email', 'walletAddress'],
    disposableEmailDomains: ['mailinator.com', 'tempmail.io'],
  };

  // ───────────────────── 真实性校验(14.23) ─────────────────────

  describe('screenLeadAuthenticity', () => {
    it('合法邮箱 + 合法钱包 → 非疑似', () => {
      const res = screenLeadAuthenticity(
        { email: 'a@example.com', walletAddress: '0x' + 'a'.repeat(40) },
        config,
      );
      expect(res.suspicious).toBe(false);
      expect(res.signals).toHaveLength(0);
    });

    it('邮箱格式非法 → invalid_email_format', () => {
      const res = screenLeadAuthenticity({ email: 'not-an-email' }, config);
      expect(res.suspicious).toBe(true);
      expect(res.signals).toContain('invalid_email_format');
    });

    it('一次性邮箱域名 → disposable_email_domain', () => {
      const res = screenLeadAuthenticity({ email: 'a@mailinator.com' }, config);
      expect(res.signals).toContain('disposable_email_domain');
    });

    it('钱包格式非法 → invalid_wallet_format', () => {
      const res = screenLeadAuthenticity(
        { email: 'a@example.com', walletAddress: '0x123' },
        config,
      );
      expect(res.signals).toContain('invalid_wallet_format');
    });

    it('邮箱与钱包均缺 → no_identifier', () => {
      const res = screenLeadAuthenticity({ twitterHandle: '@x' }, config);
      expect(res.signals).toContain('no_identifier');
    });
  });

  // ───────────────────── 去重(14.23) ─────────────────────

  describe('dedupLeads', () => {
    it('按 email 归一化去重(大小写/空白不敏感)', () => {
      const { unique, duplicatesRemoved } = dedupLeads([
        { email: 'A@Example.com' },
        { email: ' a@example.com ' },
      ]);
      expect(unique).toHaveLength(1);
      expect(duplicatesRemoved).toBe(1);
    });

    it('按 walletAddress 跨条目去重', () => {
      const w = '0x' + 'b'.repeat(40);
      const { unique, duplicatesRemoved } = dedupLeads([
        { walletAddress: w, email: 'a@example.com' },
        { walletAddress: w.toUpperCase(), email: 'b@example.com' },
      ]);
      expect(unique).toHaveLength(1);
      expect(duplicatesRemoved).toBe(1);
    });

    it('无标识条目原样保留(不可去重)', () => {
      const { unique, duplicatesRemoved } = dedupLeads([
        { twitterHandle: '@x' },
        { twitterHandle: '@y' },
      ]);
      expect(unique).toHaveLength(2);
      expect(duplicatesRemoved).toBe(0);
    });

    it('leadDedupKey 无标识 → 空串', () => {
      expect(leadDedupKey({ twitterHandle: '@x' })).toBe('');
    });
  });

  // ───────────────────── 完整性(14.23) ─────────────────────

  describe('checkLeadCompleteness', () => {
    it('缺必备字段 → 不完整,列出缺失', () => {
      const { complete, missingFields } = checkLeadCompleteness(
        { email: 'a@example.com' },
        config,
      );
      expect(complete).toBe(false);
      expect(missingFields).toContain('walletAddress');
    });

    it('必备字段齐全 → 完整', () => {
      const { complete } = checkLeadCompleteness(
        { email: 'a@example.com', walletAddress: '0x' + 'c'.repeat(40) },
        config,
      );
      expect(complete).toBe(true);
    });
  });

  // ───────────────────── 合格名单 + 量化口径(14.23/14.24) ─────────────────────

  describe('buildQualifiedLeadList', () => {
    it('合格 = 字段完整 ∧ 过去重 ∧ 非疑似;分类与量化口径正确', () => {
      const goodWallet = '0x' + 'a'.repeat(40);
      const entries: LeadEntry[] = [
        // 合格
        { email: 'good@example.com', walletAddress: goodWallet },
        // 重复(同 email)→ 去重剔除
        { email: 'GOOD@example.com', walletAddress: '0x' + 'd'.repeat(40) },
        // 完整但疑似(一次性邮箱)→ 可疑,不计合格
        { email: 'sus@mailinator.com', walletAddress: '0x' + 'e'.repeat(40) },
        // 不完整(缺钱包)→ 不计合格
        { email: 'incomplete@example.com' },
      ];
      const res = buildQualifiedLeadList(entries, config);

      expect(res.qualifiedCount).toBe(1);
      expect(res.qualified[0].entry.email).toBe('good@example.com');
      expect(res.duplicatesRemoved).toBe(1);
      expect(res.suspiciousCount).toBe(1);
      expect(res.flaggedSuspicious[0].authenticity.signals).toContain(
        'disposable_email_domain',
      );
      expect(res.incomplete).toHaveLength(1);
      expect(res.incomplete[0].missingFields).toContain('walletAddress');
    });

    it('空输入 → 全 0', () => {
      const res = buildQualifiedLeadList([], config);
      expect(res.qualifiedCount).toBe(0);
      expect(res.duplicatesRemoved).toBe(0);
      expect(res.suspiciousCount).toBe(0);
    });

    it('默认配置仅要求 email', () => {
      const res = buildQualifiedLeadList(
        [{ email: 'a@example.com' }],
        DEFAULT_LEAD_COLLECTION_CONFIG,
      );
      expect(res.qualifiedCount).toBe(1);
    });
  });

  // ───────────────────── 导出审批边界(14.24) ─────────────────────

  it('名单导出需审批(防外泄,14.24)', () => {
    expect(leadExportRequiresApproval).toBe(true);
  });

  // ───────────────────── 属性测试(不变式) ─────────────────────

  describe('属性:不变式', () => {
    it('合格 leads ⊆ 完整 ∧ 非疑似;三类分区互斥且总和 = 去重后条数', () => {
      const entryArb = fc.record({
        email: fc.option(
          fc.constantFrom(
            'a@example.com',
            'b@example.com',
            'bad-email',
            'c@mailinator.com',
          ),
          { nil: undefined },
        ),
        walletAddress: fc.option(
          fc.constantFrom('0x' + 'a'.repeat(40), '0x' + 'b'.repeat(40), '0xbad'),
          { nil: undefined },
        ),
      });
      fc.assert(
        fc.property(fc.array(entryArb, { maxLength: 50 }), (entries) => {
          const res = buildQualifiedLeadList(entries as LeadEntry[], config);
          // 合格项必完整且非疑似。
          for (const q of res.qualified) {
            expect(q.complete).toBe(true);
            expect(q.authenticity.suspicious).toBe(false);
          }
          // 三类分区总和 = 去重后保留条数。
          const total =
            res.qualified.length + res.flaggedSuspicious.length + res.incomplete.length;
          const deduped = dedupLeads(entries as LeadEntry[]).unique.length;
          expect(total).toBe(deduped);
          // 计数口径与数组长度一致。
          expect(res.qualifiedCount).toBe(res.qualified.length);
          expect(res.suspiciousCount).toBe(res.flaggedSuspicious.length);
        }),
      );
    });

    it('去重幂等:对已去重名单再去重不再剔除', () => {
      const entryArb = fc.record({
        email: fc.option(fc.constantFrom('a@x.com', 'b@x.com', 'c@x.com'), {
          nil: undefined,
        }),
        walletAddress: fc.option(
          fc.constantFrom('0x' + '1'.repeat(40), '0x' + '2'.repeat(40)),
          { nil: undefined },
        ),
      });
      fc.assert(
        fc.property(fc.array(entryArb, { maxLength: 50 }), (entries) => {
          const once = dedupLeads(entries as LeadEntry[]).unique;
          const twice = dedupLeads(once);
          expect(twice.duplicatesRemoved).toBe(0);
          expect(twice.unique.length).toBe(once.length);
        }),
      );
    });
  });
});
