/**
 * I-066: the 伙伴 chat error page used a hard-coded white title (invisible on the light theme), English only,
 * and printed the raw error message. Static checks on SummonStackNavigator.tsx.
 */
import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(path.join(__dirname, '..', 'SummonStackNavigator.tsx'), 'utf8');

describe('伙伴 chat error page', () => {
  it('uses theme colours, no hard-coded light or grey text', () => {
    expect(src).toMatch(/const styles = useThemedStyles\(makeChatFailedStyles\)/);
    expect(src).toMatch(/title: \{[^}]*color: c\.textPrimary/);
    expect(src).not.toMatch(/color: '#(fff|ffffff|999)'/i);
  });

  it('says it in both languages', () => {
    expect(src).toMatch(/t\(\{ en: 'The chat did not load', zh: '对话没有加载出来' \}\)/);
    expect(src).toMatch(/t\(\{ en: 'Try again', zh: '再试一次' \}\)/);
    expect(src).not.toMatch(/>Chat failed to load<|>Retry</);
  });

  it('never puts the raw error on screen; it goes to the log', () => {
    expect(src).not.toMatch(/\{this\.state\.error\?\.message/);
    expect(src).toMatch(/console\.error\('\[SummonChatErrorBoundary\]', error\.message/);
  });

  it('retry clears the error and the button is a real button', () => {
    expect(src).toMatch(/<ChatFailedView onRetry=\{\(\) => this\.setState\(\{ hasError: false, error: undefined \}\)\} \/>/);
    expect(src).toMatch(/accessibilityRole="button" testID="summon-chat-retry"/);
  });
});
