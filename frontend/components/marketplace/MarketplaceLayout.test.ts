/**
 * Unit tests for MarketplaceLayout helper functions.
 * Tests the getActiveSection route-to-section mapping logic.
 */

import { describe, it, expect } from 'vitest';
import { getActiveSection } from './MarketplaceLayout';

describe('getActiveSection', () => {
  it('maps /market to skins', () => {
    expect(getActiveSection('/market')).toBe('skins');
  });

  it('maps /market/skills to skills', () => {
    expect(getActiveSection('/market/skills')).toBe('skills');
  });

  it('maps /market/tasks to tasks', () => {
    expect(getActiveSection('/market/tasks')).toBe('tasks');
  });

  it('maps /showcase to showcase', () => {
    expect(getActiveSection('/showcase')).toBe('showcase');
  });

  it('maps /market/skin/[id] detail pages to skins', () => {
    expect(getActiveSection('/market/skin/abc-123')).toBe('skins');
  });

  it('maps /market/skills/some-sub-path to skills', () => {
    expect(getActiveSection('/market/skills/category')).toBe('skills');
  });

  it('maps /market/tasks/some-sub-path to tasks', () => {
    expect(getActiveSection('/market/tasks/detail')).toBe('tasks');
  });

  it('defaults to skins for unknown /market sub-routes', () => {
    expect(getActiveSection('/market/unknown')).toBe('skins');
  });
});
