/**
 * T7 r1, second pass (10-16): a new owner's first run on the phone went 诞生你的 AI → 连接你的电脑 → 安家永曜城 → 需要你,
 * with "Computer Use / vibe coding" on a Chinese screen, a 28×17 「跳过」, 39 px chips, a primary button whose spoken name
 * ("确认并唤醒") was not its visible text, chat-header icons announced as test ids, and tab labels cut in half.
 * These guards keep the fixes in place.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { firstRunCompleted } from '../../components/onboarding/m0FirstRun';
import { currentStep, type OnboardingStep } from '../../stores/soulBirthStore';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const none: Record<OnboardingStep, boolean> = { birth: false, first_words: false, connect_desktop: false, settle_aeon: false };

describe('M0 first run ends after 连接你的电脑', () => {
  it('with M0 on, 永曜城 is never the next step', () => {
    expect(currentStep(firstRunCompleted(none, true))).toBe('birth');
    const throughDesktop = { ...none, birth: true, first_words: true, connect_desktop: true };
    expect(currentStep(firstRunCompleted(throughDesktop, true))).toBeNull();
  });

  it('with M0 off, the four-step order is unchanged', () => {
    const throughDesktop = { ...none, birth: true, first_words: true, connect_desktop: true };
    expect(firstRunCompleted(throughDesktop, false)).toBe(throughDesktop);
    expect(currentStep(firstRunCompleted(throughDesktop, false))).toBe('settle_aeon');
  });

  it('never writes back into the store record it was given', () => {
    const record = { ...none };
    const seen = firstRunCompleted(record, true);
    expect(record.settle_aeon).toBe(false);
    expect(seen).not.toBe(record);
  });

  it('the host resolves its step through it', () => {
    expect(read('src/components/onboarding/SoulBirthHost.tsx')).toContain('resolveCurrentStep(firstRunCompleted(completed))');
  });
});

describe('first-run words and touch targets', () => {
  it('no "Computer Use" or "vibe coding" on the connect-your-computer step', () => {
    const step = read('src/components/onboarding/steps/ConnectDesktopStep.tsx');
    const banner = read('src/components/desktop/DesktopBanner.tsx');
    expect(step).not.toMatch(/subtitle="[^"]*(Computer Use|vibe coding)/);
    expect(banner).not.toMatch(/const DESKTOP_FEATURES = '[^']*(Computer Use|vibe coding)/);
  });

  it('the birth step says what it shows and its chips are 44 px', () => {
    const birth = read('src/components/onboarding/steps/BirthStep.tsx');
    expect(birth).not.toContain('accessibilityLabel="确认并唤醒"');
    expect(birth).toMatch(/accessibilityLabel="赋予它灵魂"[\s\S]{0,120}<Text style=\{styles\.primaryBtnText\}>赋予它灵魂<\/Text>/);
    expect(birth).toMatch(/chip: \{[^}]*minHeight: 44/);
  });

  it('「跳过」 is a 44 px box, not just a hit slop around 17 px of text', () => {
    expect(read('src/components/onboarding/StepScaffold.tsx')).toMatch(/skipButton: \{[^}]*minHeight: 44[^}]*minWidth: 44/);
  });
});

describe('chat header and tab bar', () => {
  it('the two header icons have 44 px targets and spoken names, not test ids', () => {
    const chat = read('src/screens/agent/AgentChatScreen.tsx');
    expect(chat).toContain('const CHAT_BAR_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 } as const;');
    expect(chat).not.toContain('accessibilityLabel="agent-chat-drawer-button"');
    expect(chat).not.toContain('accessibilityLabel="agent-chat-settings-button"');
    expect(chat).toMatch(/testID="agent-chat-drawer-button"[\s\S]{0,200}hitSlop=\{CHAT_BAR_HIT_SLOP\}/);
  });

  it('four-zone tab labels get a full line', () => {
    const tabs = read('src/navigation/four-zone/FourZoneTabNavigator.tsx');
    expect(tabs).toContain('const contentHeight = compact ? 54 : 58;');
    expect(tabs).toMatch(/tabBarLabelStyle: \{ fontSize: compact \? 10 : 11, lineHeight: compact \? 13 : 14/);
  });
});
