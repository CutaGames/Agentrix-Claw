/**
 * T7 (REQ-backend-036): the `order_update` push lands on 事项 → 待我处理; until the phone has
 * an order page, it offers the web order pages for an `ord_` ref only.
 */
import { describe, it, expect } from '@jest/globals';
import { getBuyerOrderWebUrl, getSellerOrderWebUrl, isOrderRef } from '../webHandoff';

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
