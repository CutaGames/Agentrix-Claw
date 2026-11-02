/**
 * T7 (REQ-backend-036): the `order_update` push lands on 事项 → 待我处理; until the phone has
 * an order page, it offers the web order pages for an `ord_` ref only.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { APP_URL } from '../../config/env';
import {
  getBuyerOrderWebUrl,
  getSellerOrderWebUrl,
  getTwinStatusWebPath,
  getTwinStatusWebUrl,
  isIntroductionRef,
  isOrderRef,
  joinWebUrl,
} from '../webHandoff';

describe('order links for the order_update push', () => {
  it('accepts ord_ refs only', () => {
    expect(isOrderRef('ord_01HZX9')).toBe(true);
    expect(isOrderRef('appr_1')).toBe(false);
    expect(isOrderRef('ord_../x')).toBe(false);
    expect(isOrderRef(undefined)).toBe(false);
  });

  it('builds the seller page under 分身 → 收入与回执 and the buyer page', () => {
    expect(getSellerOrderWebUrl('agent-1', 'ord_01HZX9', 'https://www.example.test')).toBe('https://www.example.test/agents/agent-1/twin/income/ord_01HZX9');
    expect(getBuyerOrderWebUrl('ord_01HZX9', 'https://www.example.test/')).toBe('https://www.example.test/orders/ord_01HZX9');
  });

  it('builds nothing from a bad ref or without an Agent', () => {
    expect(getSellerOrderWebUrl('', 'ord_01HZX9')).toBeNull();
    expect(getSellerOrderWebUrl('agent/1', 'ord_01HZX9')).toBeNull();
    expect(getBuyerOrderWebUrl('../orders')).toBeNull();
  });
});

/**
 * L9 package 3 C3: the three referral alerts ride the `introduction_update` push with an `int_` ref.
 * The landing offers the web twin status page, the path the web notification uses for all three kinds.
 */
describe('referral links for the introduction_update push', () => {
  it('accepts int_ refs only', () => {
    expect(isIntroductionRef('int_0123abcd-0123-4abc-8abc-0123456789ab')).toBe(true);
    expect(isIntroductionRef('int_0123456789abcdef0123456789abcdef')).toBe(true);
    expect(isIntroductionRef(`int_${'x'.repeat(120)}`)).toBe(true);
    for (const bad of [
      'ord_1',
      'spa_1',
      'int_',
      'int_../x',
      'int_a b',
      `int_${'x'.repeat(121)}`,
      '0123abcd-0123-4abc-8abc-0123456789ab',
      undefined,
      null,
      12345,
    ]) {
      expect([bad, isIntroductionRef(bad)]).toEqual([bad, false]);
    }
  });

  it('builds the twin status page of the given Agent', () => {
    expect(getTwinStatusWebUrl('agent-1', 'https://www.example.test')).toBe('https://www.example.test/agents/agent-1/twin/status');
    expect(getTwinStatusWebUrl('agent-1', 'https://www.example.test/')).toBe('https://www.example.test/agents/agent-1/twin/status');
    expect(getTwinStatusWebPath('agent-1')).toBe('/agents/agent-1/twin/status');
  });

  it('builds nothing without a usable Agent id, and never falls back to another one', () => {
    for (const bad of ['', null, undefined, 'agent/1', '../x', 'a?b', 'a b']) {
      expect([bad, getTwinStatusWebUrl(bad as string | null | undefined, 'https://www.example.test')]).toEqual([bad, null]);
      expect([bad, getTwinStatusWebPath(bad as string | null | undefined)]).toEqual([bad, null]);
    }
  });

  it('defaults to the app web address (the same site as agentrix.top)', () => {
    expect(getTwinStatusWebUrl('agent-1')).toBe(joinWebUrl(APP_URL, '/agents/agent-1/twin/status'));
    expect(new URL(getTwinStatusWebUrl('agent-1') as string).hostname.endsWith('agentrix.top')).toBe(true);
  });

  it('uses the same path as the web notification for the introduction alerts', () => {
    const display = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'frontend', 'lib', 'notification', 'owner-alert-display.ts'),
      'utf8',
    );
    expect(display).toContain('`/agents/${agent}/twin/status`');
    expect(display).toMatch(/introduction_\*\s*\|\s*\/agents\/:agentId\/twin\/status/);
    expect(getTwinStatusWebPath('X')).toBe('/agents/X/twin/status');
  });
});
