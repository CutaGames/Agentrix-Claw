/**
 * L9 G · the phone's order lists (我下的单, 收入与回执) have a label for every order kind of the contract, including the
 * three bookkeeping kinds (test mode only). `KIND_TEXT[order.kind]` was undefined for them (and for `device_rental`), which
 * throws inside `say(...)` when such an order is drawn. The screens are React Native, so this reads their source.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ORDER_KINDS } from '../../../shared/types/order-escrow';

const SCREENS = ['BuyerOrdersScreen.tsx', 'TwinIncomeScreen.tsx'];

describe('order kind labels on the phone', () => {
  for (const screen of SCREENS) {
    it(`${screen} labels every kind in Chinese and English`, () => {
      const source = readFileSync(join(__dirname, '../../screens/four-zone', screen), 'utf8');
      const block = /const KIND_TEXT: Record<OrderKindV1, Copy> = \{([\s\S]*?)\n\};/.exec(source)?.[1] ?? '';
      expect(block.length).toBeGreaterThan(0);
      for (const kind of ORDER_KINDS) {
        const line = new RegExp(`\\b${kind}: \\{ zh: '([^']+)', en: '([^']+)' \\}`).exec(block);
        expect(line).not.toBeNull();
        expect(line?.[1]).toMatch(/[\u3400-\u9fff]/);
        expect(line?.[1]).not.toMatch(/[A-Za-z]/);
        expect(line?.[2]).not.toMatch(/[\u3400-\u9fff]/);
      }
    });
  }
});
