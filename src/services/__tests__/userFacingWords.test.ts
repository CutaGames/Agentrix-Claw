/**
 * I-066: implementation notes and old internal names stay out of what the app says.
 * Scans every `zh:` / `en:` string line under src/screens and src/components (comments are not checked).
 * Product naming (Yowo, AXP, the share card) waits for the owner's word list (E105 ④) and is not checked here.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..');
const BANNED: Array<[string, RegExp]> = [
  ['服务端权威 (implementation note)', /服务端权威/],
  ['server-authoritative (implementation note)', /server[- ]authoritative/i],
  ['x402 as a label', /x402 (微支付|micropay)/i],
  ['OpenClaw 智能体 (old runtime name)', /OpenClaw (智能体|agent)/i],
];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : files(full);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [full] : [];
  });
}

describe('words the app shows', () => {
  const hits: string[] = [];
  for (const file of [...files(path.join(SRC, 'screens')), ...files(path.join(SRC, 'components'))]) {
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*') || code.startsWith('{/*')) return;
        if (!/\b(zh|en):\s*['"`]/.test(line)) return;
        for (const [name, rx] of BANNED) if (rx.test(line)) hits.push(`${path.relative(SRC, file)}:${index + 1} ${name}`);
      });
  }

  it('contain no implementation notes or old runtime names', () => {
    expect(hits).toEqual([]);
  });

  it('the permission toggle for x402 uses the approval cards’ words', () => {
    const src = fs.readFileSync(path.join(SRC, 'screens/me/SovereigntyControlPlaneScreen.tsx'), 'utf8');
    expect(src).toContain("x402PayEnabled: { en: 'Pay-per-use API', zh: '按次付费的接口' },");
  });
});
