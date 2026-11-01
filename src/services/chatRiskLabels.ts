/**
 * Two small labels under an assistant reply (L8 1b): A3 "已隐去 N 条" (`meta{kind:'context_withheld'}`) and
 * A4 "已锁定 / 已收紧" (`meta{kind:'risk_label'}`). Both come from the server's chat stream, are read with the contract
 * decoders, and show nothing when the decoder refuses them. The server sends them only while its switches are on.
 */
import {
  decodeContextWithheldMetaV1,
  type ContextWithheldMetaV1,
} from '../../shared/types/context-data-class';
import {
  decodeOwnerLockdownRiskLabelMetaV1,
  ownerLockdownHeldScopeV1,
  type OwnerLockdownRiskLabelMetaV1,
  type OwnerLockdownTriggerV1,
} from '../../shared/types/owner-lockdown';

export interface ChatRiskLabels {
  riskLabel?: OwnerLockdownRiskLabelMetaV1;
  contextWithheld?: ContextWithheldMetaV1;
}

/** The labels in one stream meta, or null when it is neither label. */
export function readChatRiskLabels(meta: unknown): ChatRiskLabels | null {
  const risk = decodeOwnerLockdownRiskLabelMetaV1(meta);
  if (risk.ok) return { riskLabel: risk.value };
  const withheld = decodeContextWithheldMetaV1(meta);
  if (withheld.ok) return { contextWithheld: withheld.value };
  return null;
}

const REASON_TEXT: Readonly<Record<OwnerLockdownTriggerV1, string>> = {
  owner_lockdown: '你开了锁定模式',
  restricted_data: '本轮带有受限数据',
  external_content: '本轮读到了外部内容',
};

export function describeRiskLabel(label: OwnerLockdownRiskLabelMetaV1): string {
  const reasons = label.reasons.map((reason) => REASON_TEXT[reason]).join('、');
  const head = label.level === 'locked' ? '已锁定' : '已收紧';
  // Outside content alone: web look-ups keep running (coord 10-27), only outward actions pause.
  if (ownerLockdownHeldScopeV1(label.reasons) === 'outward_actions') {
    return `${head}：对外动作（发消息、付款、操作电脑、跑命令）本轮先停（${reasons}）`;
  }
  return `${head}：对外动作（联网、发消息、付款、操作电脑）本轮不会执行（${reasons}）`;
}

export function describeContextWithheld(meta: ContextWithheldMetaV1): string {
  // L8-13 item 3: one item is 「它的」, more are 「它们的」 (same as the web).
  return `已隐去 ${meta.count} 条：${meta.count === 1 ? '它的' : '它们的'}数据级别不允许交给这次用的模型`;
}
