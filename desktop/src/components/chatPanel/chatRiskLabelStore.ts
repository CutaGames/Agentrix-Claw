/**
 * chatRiskLabelStore — 每个助手回复上的两个小标签（A3「已隐去 N 条」、A4「已锁定 / 已收紧」）。
 * 来自服务端对话流里的 `meta{kind:'context_withheld'}` 和 `meta{kind:'risk_label'}`，按合同的解码器读，认不出的不显示。
 * 只在内存里，不落盘（和 spendCardStore 一样）；store.ts 里的消息类型不动。
 */
import { useSyncExternalStore } from "react";
import {
  decodeContextWithheldMetaV1,
  type ContextWithheldMetaV1,
} from "../../../../shared/types/context-data-class";
import {
  decodeOwnerLockdownRiskLabelMetaV1,
  ownerLockdownHeldScopeV1,
  type OwnerLockdownRiskLabelMetaV1,
  type OwnerLockdownTriggerV1,
} from "../../../../shared/types/owner-lockdown";

export interface ChatRiskLabels {
  riskLabel?: OwnerLockdownRiskLabelMetaV1;
  contextWithheld?: ContextWithheldMetaV1;
}

const MAX_MESSAGES = 200;
const labels = new Map<string, ChatRiskLabels>();
const listeners = new Set<() => void>();
const EMPTY: ChatRiskLabels = {};

function emit() {
  for (const listener of listeners) listener();
}

/** True when `meta` was one of the two label metas (so the caller does not treat it as the turn's model meta). */
export function recordChatRiskMeta(messageId: string, meta: unknown): boolean {
  const risk = decodeOwnerLockdownRiskLabelMetaV1(meta);
  const withheld = risk.ok ? null : decodeContextWithheldMetaV1(meta);
  const kind = (meta as { kind?: unknown } | null)?.kind;
  if (!risk.ok && !(withheld && withheld.ok) && kind !== "risk_label" && kind !== "context_withheld") return false;
  if (risk.ok || (withheld && withheld.ok)) {
    const current = labels.get(messageId) ?? {};
    labels.set(messageId, {
      ...current,
      ...(risk.ok ? { riskLabel: risk.value } : {}),
      ...(withheld && withheld.ok ? { contextWithheld: withheld.value } : {}),
    });
    while (labels.size > MAX_MESSAGES) labels.delete(labels.keys().next().value as string);
    emit();
  }
  // A label meta the decoder refuses shows nothing, but it is still not a model meta.
  return true;
}

export function chatRiskLabelsFor(messageId: string): ChatRiskLabels {
  return labels.get(messageId) ?? EMPTY;
}

export function resetChatRiskLabelsForTests() {
  labels.clear();
  emit();
}

export function useChatRiskLabels(messageId: string): ChatRiskLabels {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => chatRiskLabelsFor(messageId),
  );
}

const REASON_TEXT: Readonly<Record<OwnerLockdownTriggerV1, string>> = {
  owner_lockdown: "你开了锁定模式",
  restricted_data: "本轮带有受限数据",
  external_content: "本轮读到了外部内容",
};

export function describeRiskLabel(label: OwnerLockdownRiskLabelMetaV1): string {
  const reasons = label.reasons.map((reason) => REASON_TEXT[reason]).join("、");
  const head = label.level === "locked" ? "已锁定" : "已收紧";
  // Outside content alone: web look-ups keep running (coord 10-27), only outward actions pause.
  if (ownerLockdownHeldScopeV1(label.reasons) === "outward_actions") {
    return `${head}：对外动作（发消息、付款、操作电脑、跑命令）本轮先停（${reasons}）`;
  }
  return `${head}：对外动作（联网、发消息、付款、操作电脑）本轮不会执行（${reasons}）`;
}

export function describeContextWithheld(meta: ContextWithheldMetaV1): string {
  return `已隐去 ${meta.count} 条：它们的数据级别不允许交给这次用的模型`;
}
