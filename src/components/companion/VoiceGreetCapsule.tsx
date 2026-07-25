/**
 * VoiceGreetCapsule — transient pill matching the TTS audio when the
 * companion proactively greets the user (morning / evening / comeback /
 * milestone / manual).
 *
 * Phase 1 strategy:
 *   - Subscribe to `companionEvents.subscribe('voice-greet', ...)`.
 *   - Show the same text the engine is speaking, so silent / hard-of-
 *     hearing users still receive the greeting (R10.10).
 *   - Auto-dismiss after 4s. TTS playback itself is handled by the
 *     pet-companion-engine layer (Phase 1 there is no dedicated mobile
 *     TTS scheduler; the bubble visualizes only, audio remains owned
 *     by the existing voice pipeline).
 *
 * Spec: requirements.md R10.10, design.md §Components/Core 5.
 */
import React, { useEffect, useState } from 'react';
import { CapsuleOverlay } from './CapsuleOverlay';
import { colors } from '../../theme/colors';
import {
  companionEvents,
  type CompanionEventOf,
} from '../../services/companionEvents.service';
import { setCompanionMode } from '../../services/petMode';

interface VisibleEntry {
  text: string;
  scenario: CompanionEventOf<'voice-greet'>['scenario'];
}

export function VoiceGreetCapsule() {
  const [entry, setEntry] = useState<VisibleEntry | null>(null);

  useEffect(() => {
    const off = companionEvents.subscribe('voice-greet', (evt) => {
      setEntry({ text: evt.text, scenario: evt.scenario });
      // Pulse to whisper mode for ~4s so the ball border + sprite reflect
      // the greeting moment (R2.5 / petMode.transitions whisper TTL).
      setCompanionMode('whisper', `voice-greet:${evt.scenario}`, { ttlMs: 4000 });
    });
    return () => off();
  }, []);

  return (
    <CapsuleOverlay
      visible={!!entry}
      durationMs={4000}
      emoji="🐾"
      text={entry?.text ?? ''}
      bgColor={colors.bgCard}
      borderColor={colors.accent}
      bottomOffset={230}
      onDismiss={() => setEntry(null)}
      testID="voice-greet-capsule"
    />
  );
}
