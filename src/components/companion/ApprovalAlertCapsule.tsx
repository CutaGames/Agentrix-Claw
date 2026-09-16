/**
 * ApprovalAlertCapsule — transient pill when a high-risk approval needs
 * the user's attention (wrist-trigger, push approval, agentic-commerce
 * over-limit).
 *
 * Stays visible for 4s then re-emits every 8s if not addressed (R6.4)
 * — Phase 1 doesn't yet implement re-emit; we rely on backend to
 * re-fire `presence:approval:wrist-trigger` if it remains pending.
 *
 * Tap routes to /inbox so user can review.
 *
 * Spec: requirements.md R6.4, design.md §Components/Core 5.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CapsuleOverlay } from './CapsuleOverlay';
import { colors } from '../../theme/colors';
import { navRefNavigate } from '../../navigation/navigationRef';
import {
  companionEvents,
  type CompanionEventOf,
} from '../../services/companionEvents.service';

interface VisibleEntry {
  approvalId: string;
  text: string;
  borderColor: string;
}

function formatApproval(evt: CompanionEventOf<'approval-incoming'>): VisibleEntry {
  const riskColor =
    evt.risk === 'L3'
      ? colors.danger
      : evt.risk === 'L2'
        ? colors.warning
        : colors.info;
  const text = evt.title || evt.summary || `待审批 (${evt.risk})`;
  return {
    approvalId: evt.approvalId,
    text,
    borderColor: riskColor,
  };
}

export function ApprovalAlertCapsule() {
  const [entry, setEntry] = useState<VisibleEntry | null>(null);
  // Navigate via shared navigationRef — NOT useNavigation() (throws at the
  // CompanionLayer sibling position).
  const navigation = useMemo(
    () => ({ navigate: (...args: any[]) => navRefNavigate(...args) }),
    [],
  );

  useEffect(() => {
    const off = companionEvents.subscribe('approval-incoming', (evt) => {
      setEntry(formatApproval(evt));
    });
    return () => off();
  }, []);

  return (
    <CapsuleOverlay
      visible={!!entry}
      durationMs={4000}
      emoji="🚨"
      text={entry?.text ?? ''}
      borderColor={entry?.borderColor}
      bgColor={colors.bgCard}
      bottomOffset={170}
      onPress={() => {
        if (entry) {
          try {
            navigation.navigate('Inbox', { focusApprovalId: entry.approvalId });
          } catch {
            navigation.navigate('Inbox');
          }
        }
        setEntry(null);
      }}
      onDismiss={() => setEntry(null)}
      testID="approval-alert-capsule"
    />
  );
}
