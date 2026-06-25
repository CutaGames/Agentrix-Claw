import * as fc from 'fast-check';
import {
  identityFromControl,
  type AeonControlState,
} from '../../../../../shared/types/aeon-sync';
import { ComplianceGateService } from '../economy/compliance-gate.service';

/**
 * P.3 — 人机不可混淆 + 控制态单一 + 高风险闸门(Property 4, 5, 6)。
 *
 * - 任一角色恒有唯一身份标识(badge),且 isAgentDriven 与 controlState 派生一致,无隐藏开关(R3.1/3.6);
 * - controlState 恰为三态之一(R2.1);
 * - 合规闸门:AXP 永远放行;数字货币在未成年/地区关/AML/无 KYC 等条件下被拦截或回退,
 *   绝不在未授权下放行真钱(R11.3/11.4/R12)。
 */
describe('Aeon Property 4+5: identity non-confusion + single control state (P.3)', () => {
  const controlArb = fc.constantFrom<AeonControlState>('manual', 'agent', 'copilot');

  it('badge + isAgentDriven are a pure deterministic function of control state (no hidden switch)', () => {
    fc.assert(
      fc.property(controlArb, fc.boolean(), (control, isNpc) => {
        const a = identityFromControl(control, isNpc);
        const b = identityFromControl(control, isNpc);
        // 确定性:同输入同输出
        expect(a).toEqual(b);
        // 身份铁律映射
        if (isNpc) {
          expect(a.badge).toBe('npc');
          expect(a.isAgentDriven).toBe(true);
        } else if (control === 'manual') {
          expect(a.badge).toBe('human');
          expect(a.isAgentDriven).toBe(false);
        } else {
          // agent / copilot 均为 agent 驱动
          expect(a.isAgentDriven).toBe(true);
          expect(['agent', 'copilot']).toContain(a.badge);
        }
      }),
    );
  });

  it('every control state maps to exactly one badge (single, non-empty identity)', () => {
    const states: AeonControlState[] = ['manual', 'agent', 'copilot'];
    for (const s of states) {
      const { badge } = identityFromControl(s, false);
      expect(badge).toBeDefined();
      expect(typeof badge).toBe('string');
    }
  });
});

describe('Aeon Property 6: compliance high-risk gate (P.3)', () => {
  let gate: ComplianceGateService;
  beforeEach(() => {
    gate = new ComplianceGateService();
  });

  it('AXP is always allowed and never falls back', () => {
    fc.assert(
      fc.property(
        fc.record({
          userId: fc.uuid(),
          isMinor: fc.boolean(),
          kycPassed: fc.boolean(),
          amlFlagged: fc.boolean(),
        }),
        fc.constantFrom('pay' as const, 'exchange' as const, 'withdraw' as const),
        (ctx, capability) => {
          const r = gate.authorize(ctx, { currency: 'AXP', capability });
          expect(r.currency).toBe('AXP');
          expect(r.fellBackToAxp).toBe(false);
        },
      ),
    );
  });

  it('digital currency is never returned for minors (forced AXP fallback)', () => {
    fc.assert(
      fc.property(
        fc.record({ userId: fc.uuid(), kycPassed: fc.boolean(), amlFlagged: fc.constant(false) }),
        (base) => {
          const r = gate.authorize(
            { ...base, isMinor: true },
            { currency: 'USDC', capability: 'pay' },
          );
          // 未成年禁真钱:必须回退 AXP,绝不放行数字货币
          expect(r.currency).toBe('AXP');
          expect(r.fellBackToAxp).toBe(true);
        },
      ),
    );
  });

  it('exchange/withdraw without KYC is rejected (hard gate, no silent pass)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('exchange' as const, 'withdraw' as const),
        (capability) => {
          expect(() =>
            gate.authorize(
              { userId: 'u', isMinor: false, kycPassed: false, amlFlagged: false },
              { currency: 'USDC', capability },
            ),
          ).toThrow();
        },
      ),
    );
  });

  it('AML-flagged digital currency pay is blocked (never passes)', () => {
    expect(() =>
      gate.authorize(
        { userId: 'u', isMinor: false, kycPassed: true, amlFlagged: true },
        { currency: 'USDC', capability: 'pay' },
      ),
    ).toThrow();
  });
});
