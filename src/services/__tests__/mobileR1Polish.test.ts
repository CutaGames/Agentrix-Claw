/**
 * T7 r1 (10-16): the first simulated-user round on the phone found the 需要你 home saying "nothing" twice (once in an
 * inverted near-black banner), the 分身 tab showing seven pages before any twin exists, the floating mic covering the
 * last row of every zone, a language picker with country flags, and retired names (AXP, Marketplace) in the export and
 * delete-account prompts. These guards keep the fixes in place.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { globalPttScrollInset } from '../pushToTalk';
import { chatExecutionModeVisible, llmBudgetBarVisible } from '../chatChrome';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('the floating mic leaves room under the last row', () => {
  it('88 pt of padding only when the mic is built in', () => {
    expect(globalPttScrollInset(true)).toBe(88);
    expect(globalPttScrollInset(false)).toBe(0);
  });

  it.each([
    'src/screens/four-zone/MattersHomeScreen.tsx',
    'src/screens/four-zone/TwinHomeScreen.tsx',
    'src/screens/four-zone/MyHomeScreen.tsx',
    'src/screens/me/ClawSettingsScreen.tsx',
  ])('%s adds the inset to its scroll content', (file) => {
    expect(read(file)).toMatch(/paddingBottom: \d+ \+ GLOBAL_PTT_SCROLL_INSET/);
  });
});

describe('需要你 says "nothing" once, without a dark banner', () => {
  const section = read('src/components/NeedsYouSection.tsx');
  const matters = read('src/screens/four-zone/MattersHomeScreen.tsx');

  it('the summary shows only when there is something to decide, as a calm card', () => {
    expect(section).toContain('const summary = query.isLoading ? null : cards.length > 0 ? needsYouSummary(cards, lang) : null;');
    expect(section).toMatch(/\{summary \? \(\s*<View style=\{styles\.summary\}/);
    expect(section).not.toMatch(/summary: \{ backgroundColor: p\.text/);
  });

  it('the 待我处理 list keeps the one empty line, and 其他待批准 shows a count only above zero', () => {
    expect(matters).toContain("{t({ en: 'Nothing is waiting for you.', zh: '没有要你处理的事。' })}");
    expect(matters).toContain('value={approvalNotifications > 0 ? String(approvalNotifications) : undefined}');
  });
});

describe('分身 before a twin exists is one card with one button', () => {
  const twin = read('src/screens/four-zone/TwinHomeScreen.tsx');
  const noTwin = twin.slice(twin.indexOf('// No twin yet (T7 r1'));

  it('while it is still reading, there is no create button that could flash for an owner with a twin', () => {
    const loading = twin.slice(twin.indexOf('if (canRead && overview.isLoading) {'), twin.indexOf('// No twin yet (T7 r1'));
    expect(loading).toContain('<ActivityIndicator testID="twin-home-loading" />');
    expect(loading).not.toContain('twin-start-button');
  });

  it('the start card holds the one primary button; the rules are one line; the other pages are folded', () => {
    expect(noTwin).toContain('testID="twin-start-card"');
    expect(noTwin.match(/style=\{styles\.primary\}/g)).toHaveLength(1);
    expect(noTwin).toContain('testID="twin-start-rules"');
    expect(noTwin).toContain('testID="twin-home-more"');
    expect(noTwin).toContain('{showMore ? entryRows : null}');
    expect(noTwin).not.toMatch(/\n\s*\{entryRows\}\n/);
  });

  it('a twin that exists still lists every page directly', () => {
    const hasTwin = twin.slice(twin.indexOf('if (hasTwin) {'), twin.indexOf('if (canRead && overview.isLoading) {'));
    expect(hasTwin).toMatch(/\n\s*\{entryRows\}\n/);
  });

  it('the CI smoke run opens 其他功能 before it looks for the twin pages', () => {
    const flow = read('.maestro/four-zone/90-four-zone-smoke.yaml');
    const more = flow.indexOf('id: "twin-home-more"');
    const status = flow.indexOf('id: "twin-open-status"');
    expect(more).toBeGreaterThan(0);
    expect(more).toBeLessThan(status);
  });
});

describe('我的 and 设置', () => {
  it('the featured rows and the rest read as two groups', () => {
    const my = read('src/screens/four-zone/MyHomeScreen.tsx');
    expect(my).toContain("{t({ en: 'More', zh: '更多' })}");
    expect(my).toMatch(/myHomeTabOrder\(\)/);
  });

  it('the language picker names languages, not countries', () => {
    const settings = read('src/screens/me/ClawSettingsScreen.tsx');
    expect(settings).not.toMatch(/🇺🇸|🇨🇳/);
    expect(settings).toContain("{ code: 'en' as Language, label: 'English' }");
    expect(settings).toContain("{ code: 'zh' as Language, label: '中文' }");
  });

  it('the export and delete-account prompts do not use the retired names', () => {
    const settings = read('src/screens/me/ClawSettingsScreen.tsx');
    const exportPrompt = settings.slice(settings.indexOf("if (item.id === 'export-data')"), settings.indexOf("if (item.id === 'delete-account')"));
    const deletePrompt = settings.slice(settings.indexOf("if (item.id === 'delete-account')"), settings.indexOf("if (item.id === 'delete-account')") + 1600);
    for (const prompt of [exportPrompt, deletePrompt]) {
      expect(prompt.length).toBeGreaterThan(200);
      expect(prompt).not.toMatch(/AXP|Marketplace|元神|Soul Core/);
    }
    expect(deletePrompt).toContain('积分余额');
    expect(exportPrompt).toContain('积分记录');
  });
});

describe('伙伴 chat chrome', () => {
  it('the "where does it run" switch stays out of 入门 with the default tier, and shows a chosen tier', () => {
    expect(chatExecutionModeVisible('beginner', 'auto')).toBe(false);
    expect(chatExecutionModeVisible('beginner', 'local-only')).toBe(true);
    expect(chatExecutionModeVisible('beginner', 'cloud-only')).toBe(true);
    expect(chatExecutionModeVisible('advanced', 'auto')).toBe(true);
    expect(chatExecutionModeVisible('professional', 'auto')).toBe(true);
  });

  it('the monthly usage strip shows from 80 %, when used up, and always in 专业', () => {
    expect(llmBudgetBarVisible({ usagePercent: 0, quotaExhausted: false, uiComplexity: 'beginner' })).toBe(false);
    expect(llmBudgetBarVisible({ usagePercent: 79.9, quotaExhausted: false, uiComplexity: 'advanced' })).toBe(false);
    expect(llmBudgetBarVisible({ usagePercent: 80, quotaExhausted: false, uiComplexity: 'beginner' })).toBe(true);
    expect(llmBudgetBarVisible({ usagePercent: 10, quotaExhausted: true, uiComplexity: 'beginner' })).toBe(true);
    expect(llmBudgetBarVisible({ usagePercent: 0, quotaExhausted: false, uiComplexity: 'professional' })).toBe(true);
    expect(llmBudgetBarVisible({ usagePercent: Number.NaN, quotaExhausted: false, uiComplexity: 'beginner' })).toBe(false);
  });

  it('the chat and the strip use those rules, in plain words without emoji', () => {
    const chat = read('src/screens/agent/AgentChatScreen.tsx');
    expect(chat).toContain('{chatExecutionModeVisible(uiComplexity, executionMode) ? (');
    expect(chat).toContain("t({ en: 'Runs on', zh: '在哪里运行' })");
    expect(chat).not.toMatch(/🔒 端侧|🤖 智能|☁️ 云端|「智能 \/ 云端」|Smart \/ Cloud|Smart\/Cloud/);
    const bar = read('src/components/summon/LlmBudgetBar.tsx');
    expect(bar).toContain('if (!llmBudgetBarVisible({ usagePercent: usage.usagePercent, quotaExhausted: !!usage.quotaExhausted, uiComplexity })) {');
    expect(bar).not.toContain("zh: 'LLM 预算'");
    // The visibility check comes after every hook (Rules of Hooks; the strip once crashed the Summon tab).
    expect(bar.indexOf('useSettingsStore((s) => s.uiComplexity)')).toBeLessThan(bar.indexOf('if (!llmBudgetBarVisible('));
    expect(bar.indexOf('useCallback(')).toBeLessThan(bar.indexOf('if (!llmBudgetBarVisible('));
  });
});
