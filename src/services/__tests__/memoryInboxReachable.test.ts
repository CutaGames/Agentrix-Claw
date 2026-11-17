/**
 * The memory review card (MemoryInboxCard) has to sit on a screen people can open. It was mounted only on the dreaming
 * screen, which no navigator registers, so on the phone nobody could reach it (and with it the "friends may hear this
 * too" tick of asking around, phase 2). It is now a tab of the memory page (My -> Identity & memory), in builds with
 * EXPO_PUBLIC_MEMORY_PROPOSALS=1.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'src');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === 'node_modules' ? [] : sources(full);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [full] : [];
  });
}

describe('the memory review card on the phone', () => {
  const screen = read('src/screens/agent/MemoryManagementScreen.tsx');

  it('is a tab of the memory page, only in builds with the switch on', () => {
    expect(screen).toContain("import { MemoryInboxCard } from '../../components/MemoryInboxCard';");
    expect(screen).toContain("import { MEMORY_PROPOSALS_ENABLED } from '../../services/memoryProposals';");
    expect(screen).toMatch(/\{MEMORY_PROPOSALS_ENABLED && \(\s*<TouchableOpacity[^>]*onPress=\{\(\) => setTab\('review'\)\} testID="memory-tab-review">/);
    expect(screen).toMatch(/\{tab === 'review' && MEMORY_PROPOSALS_ENABLED && \(\s*<ScrollView[^>]*testID="memory-review-tab">\s*<MemoryInboxCard \/>\s*<\/ScrollView>/);
    expect(screen.match(/<MemoryInboxCard \/>/g)).toHaveLength(1);
    expect(screen).toContain("zh: '待确认'");
  });

  it('scrolls, and keeps a tap on a button while the keyboard is up', () => {
    expect(screen).toMatch(/<ScrollView contentContainerStyle=\{styles\.reviewContent\} keyboardShouldPersistTaps="handled" testID="memory-review-tab">/);
  });

  it('has no "add" button on that tab: the add sheet only knows knowledge files and preferences', () => {
    expect(screen).toMatch(/\{tab !== 'review' && \(\s*<TouchableOpacity style=\{styles\.addBtn\} onPress=\{\(\) => setShowAdd\(true\)\}>/);
  });

  it('the memory page is a registered screen, and My -> Identity & memory opens it', () => {
    const stack = read('src/navigation/MeStackNavigator.tsx');
    expect(stack).toContain("import { MemoryManagementScreen } from '../screens/agent/MemoryManagementScreen';");
    expect(stack).toMatch(/<Stack\.Screen name="MemoryManagement" component=\{MemoryManagementScreen\}/);
    expect(read('src/navigation/four-zone/fourZoneRoutes.ts')).toContain("identity: { tab: 'My', screen: 'MemoryManagement' }");
    expect(read('src/navigation/four-zone/FourZoneTabNavigator.tsx')).toContain('<MeStackNavigator initialRouteName="MyHome" />');
  });

  it('at least one screen that mounts the card is registered in a navigator', () => {
    const mounting = sources(SRC).filter((file) => /<MemoryInboxCard \/>/.test(fs.readFileSync(file, 'utf8')));
    const navigators = sources(path.join(SRC, 'navigation')).map((file) => fs.readFileSync(file, 'utf8'));
    const registered = mounting.filter((file) => {
      const name = path.basename(file, '.tsx');
      return navigators.some((text) => text.includes(`component={${name}}`));
    });
    expect(mounting.map((file) => path.basename(file))).toContain('MemoryManagementScreen.tsx');
    expect(registered.map((file) => path.basename(file))).toEqual(['MemoryManagementScreen.tsx']);
  });
});
