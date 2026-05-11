/**
 * MobileDeepLink — Unit Tests
 *
 * Tests for the generateDeepLink helper function.
 * Requirements: 7.1, 7.2, 7.4
 */

import { describe, it, expect } from 'vitest';
import { generateDeepLink } from './MobileDeepLink';

describe('generateDeepLink', () => {
  it('generates a valid agentrix:// URI with action and resourceId', () => {
    const uri = generateDeepLink('buy', 'skin-123');
    expect(uri).toBe('agentrix://buy?resourceId=skin-123');
  });

  it('includes userId and token when userContext is provided', () => {
    const uri = generateDeepLink('bid', 'skin-456', {
      userId: 'user_001',
      token: 'jwt-token-abc',
    });
    expect(uri).toBe(
      'agentrix://bid?resourceId=skin-456&userId=user_001&token=jwt-token-abc',
    );
  });

  it('does not include userId/token when userContext is undefined', () => {
    const uri = generateDeepLink('install_skill', 'skill-789');
    expect(uri).not.toContain('userId');
    expect(uri).not.toContain('token');
    expect(uri).toBe('agentrix://install_skill?resourceId=skill-789');
  });

  it('handles accept_task action correctly', () => {
    const uri = generateDeepLink('accept_task', 'task-abc', {
      userId: 'u42',
      token: 'tok',
    });
    expect(uri).toMatch(/^agentrix:\/\/accept_task\?/);
    expect(uri).toContain('resourceId=task-abc');
    expect(uri).toContain('userId=u42');
    expect(uri).toContain('token=tok');
  });

  it('properly encodes special characters in resourceId', () => {
    const uri = generateDeepLink('buy', 'id with spaces&special=chars');
    expect(uri).toContain('resourceId=id+with+spaces%26special%3Dchars');
  });

  it('properly encodes special characters in token', () => {
    const uri = generateDeepLink('buy', 'res-1', {
      userId: 'user/1',
      token: 'a+b=c&d',
    });
    expect(uri).toContain('userId=user%2F1');
    expect(uri).toContain('token=a%2Bb%3Dc%26d');
  });
});
