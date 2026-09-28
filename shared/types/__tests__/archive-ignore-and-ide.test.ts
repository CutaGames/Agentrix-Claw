import {
  ArchiveIgnoreMatcher,
  looksLikeIdeManifestPath,
  looksLikeIgnoreRulesPath,
  parseIgnoreRuleText,
  summarizeIdeManifest,
  summarizeIgnoreRules,
} from '../archive-ignore-and-ide';

describe('archive ignore rules and IDE manifests (G-12)', () => {
  it('recognizes ignore files and IDE manifests without treating them as persona files', () => {
    expect(looksLikeIgnoreRulesPath('repo/.gitignore')).toBe(true);
    expect(looksLikeIgnoreRulesPath('repo/.cursorignore')).toBe(true);
    expect(looksLikeIgnoreRulesPath('repo/.eslintignore')).toBe(true);
    expect(looksLikeIgnoreRulesPath('AGENTS.md')).toBe(false);
    expect(looksLikeIdeManifestPath('repo/.vscode/extensions.json')).toBe(true);
    expect(looksLikeIdeManifestPath('repo/.vscode/settings.json')).toBe(true);
    expect(looksLikeIdeManifestPath('workspace.code-workspace')).toBe(true);
    expect(looksLikeIdeManifestPath('repo/package.json')).toBe(false);
  });

  it('skips node_modules, .env and key material by default', () => {
    const matcher = ArchiveIgnoreMatcher.withDefaults();
    expect(matcher.ignores('repo/node_modules/left-pad/index.js')).toBe(true);
    expect(matcher.ignores('repo/.env')).toBe(true);
    expect(matcher.ignores('repo/.env.local')).toBe(true);
    expect(matcher.ignores('repo/secrets/prod.pem')).toBe(true);
    expect(matcher.ignores('repo/id_rsa')).toBe(true);
    expect(matcher.ignores('repo/AGENTS.md')).toBe(false);
    expect(matcher.ignores('repo/.gitignore')).toBe(false);
    expect(matcher.ignores('repo/.vscode/extensions.json')).toBe(false);
  });

  it('applies repository ignore rules relative to the file that declared them', () => {
    const matcher = ArchiveIgnoreMatcher.withDefaults();
    matcher.addFromText('tmp/\n!tmp/keep.md\n*.log\n', 'repo');
    expect(matcher.ignores('repo/tmp/cache.json')).toBe(true);
    expect(matcher.ignores('repo/tmp/keep.md')).toBe(false);
    expect(matcher.ignores('repo/debug.log')).toBe(true);
    expect(matcher.ignores('other/tmp/cache.json')).toBe(false);
    expect(parseIgnoreRuleText('# comment\n\nbuild/\n').map((rule) => rule.pattern)).toEqual(['build/']);
  });

  it('summarizes ignore rules and IDE manifests without leaking secret-shaped values', () => {
    expect(summarizeIgnoreRules('node_modules/\n.env\n', '.gitignore')).toContain('2 pattern');
    expect(summarizeIgnoreRules('# only comments\n', '.gitignore')).toBeNull();
    const summary = summarizeIdeManifest(
      {
        recommendations: ['dbaeumer.vscode-eslint', 'esbenp.prettier-vscode'],
        'editor.tabSize': 2,
        'openai.apiKey': 'sk-should-not-appear',
      },
      'extensions.json',
    );
    expect(summary).toContain('dbaeumer.vscode-eslint');
    expect(summary).toContain('openai.apiKey=[redacted]');
    expect(summary).not.toContain('sk-should-not-appear');
  });
});
