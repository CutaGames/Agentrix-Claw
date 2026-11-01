/**
 * L8-13 item 6 (coord 10-30 decision B): the twin QR screen is shown to people in person, so it must not carry the
 * undecided brand name "Yowo" (gtm/brand-yowo-v1.md); its footer says Agentrix. Read as source (React Native screen).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
const ROOT = path.resolve(__dirname, '..', '..', '..');
const code = fs
  .readFileSync(path.join(ROOT, 'src/screens/four-zone/TwinQrScreen.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|\s)\/\/[^\r\n]*/g, '$1');
describe('TwinQrScreen words', () => {
  it('no Yowo anywhere on the screen; the footer reads Agentrix', () => {
    expect(code).not.toMatch(/yowo/i);
    expect(code).toContain('<Text style={styles.foot}>Agentrix</Text>');
  });
});
