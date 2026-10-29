/**
 * L8-9 item 3 (coord 10-27): outside content alone pauses outward actions only (web look-ups keep running), so the
 * mobile risk label must not say the web is held; lockdown and restricted data keep today's wording.
 */
import { describe, expect, it } from '@jest/globals';
import { OWNER_LOCKDOWN_SCHEMA_VERSION_V1, type OwnerLockdownRiskLabelMetaV1 } from '../../../shared/types/owner-lockdown';
import { describeRiskLabel } from '../chatRiskLabels';

const label = (level: OwnerLockdownRiskLabelMetaV1['level'], reasons: OwnerLockdownRiskLabelMetaV1['reasons']): OwnerLockdownRiskLabelMetaV1 => ({
  schemaVersion: OWNER_LOCKDOWN_SCHEMA_VERSION_V1,
  type: 'meta',
  kind: 'risk_label',
  level,
  reasons,
});

describe('describeRiskLabel (mobile)', () => {
  it('outside content alone: outward actions pause, the web is not named', () => {
    const text = describeRiskLabel(label('tightened', ['external_content']));
    expect(text).toBe('已收紧：对外动作（发消息、付款、操作电脑、跑命令）本轮先停（本轮读到了外部内容）');
    expect(text).toContain('跑命令');
    expect(text).not.toContain('联网');
  });

  it('lockdown or restricted data: today\'s wording, the web included', () => {
    expect(describeRiskLabel(label('locked', ['owner_lockdown']))).toBe('已锁定：对外动作（联网、发消息、付款、操作电脑）本轮不会执行（你开了锁定模式）');
    expect(describeRiskLabel(label('locked', ['owner_lockdown', 'external_content']))).toContain('联网');
    expect(describeRiskLabel(label('tightened', ['restricted_data', 'external_content']))).toContain('联网');
  });
});
