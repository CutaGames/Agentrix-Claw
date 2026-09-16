/**
 * WalletCapsule — transient pill above the ball when wallet balance
 * deltas arrive (transfer-in, transfer-out, agentic-commerce, etc).
 *
 * Subscribes to `companionEvents.subscribe('wallet-delta', ...)` and to
 * `capsule-show` (so callers can force-display without bus pollution).
 * Auto-dismisses after 3.2s per design §Components/Core 5.
 *
 * Spec: requirements.md R6.7, design.md §Components/Core 5.
 */
import React, { useEffect, useState } from 'react';
import { CapsuleOverlay } from './CapsuleOverlay';
import { colors } from '../../theme/colors';
import { companionEvents, type CompanionEventOf } from '../../services/companionEvents.service';

interface VisibleEntry {
  emoji: string;
  text: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  ts: number;
}

function formatDelta(evt: CompanionEventOf<'wallet-delta'>): VisibleEntry {
  const sign = evt.delta >= 0 ? '+' : '';
  const arrow = evt.delta >= 0 ? '↗' : '↘';
  const text = `${arrow} ${sign}${evt.delta.toFixed(evt.currency === 'USDC' ? 2 : 0)} ${evt.currency}`;
  const isCredit = evt.delta >= 0;
  return {
    emoji: isCredit ? '💰' : '💸',
    text,
    textColor: isCredit ? colors.success : colors.danger,
    bgColor: colors.bgCard,
    borderColor: isCredit ? colors.success : colors.danger,
    ts: Date.now(),
  };
}

export function WalletCapsule() {
  const [entry, setEntry] = useState<VisibleEntry | null>(null);

  useEffect(() => {
    const off = companionEvents.subscribe('wallet-delta', (evt) => {
      setEntry(formatDelta(evt));
    });
    const off2 = companionEvents.subscribe('capsule-show', (evt) => {
      if (evt.capsuleType !== 'wallet') return;
      const payload = evt.payload as { delta: number; currency: string };
      setEntry(
        formatDelta({
          type: 'wallet-delta',
          delta: payload.delta,
          currency: payload.currency as any,
          source: 'other',
        }),
      );
    });
    return () => {
      off();
      off2();
    };
  }, []);

  return (
    <CapsuleOverlay
      visible={!!entry}
      durationMs={3200}
      emoji={entry?.emoji ?? '💰'}
      text={entry?.text ?? ''}
      textColor={entry?.textColor}
      bgColor={entry?.bgColor}
      borderColor={entry?.borderColor}
      bottomOffset={110}
      onDismiss={() => setEntry(null)}
      testID="wallet-capsule"
    />
  );
}
