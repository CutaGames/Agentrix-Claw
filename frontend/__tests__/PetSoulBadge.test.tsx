/**
 * WB-T1.2 — PetSoulBadge displays clan label + display name.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PetSoulBadge from '../components/pet/PetSoulBadge';

describe('PetSoulBadge (WB-T1.2)', () => {
  it('renders clan label, display name and tier', () => {
    render(<PetSoulBadge clan="A_office" displayName="爪爪" tier="free" />);
    expect(screen.getByText('效率派')).toBeInTheDocument();
    expect(screen.getByText('爪爪')).toBeInTheDocument();
    expect(screen.getByText('free')).toBeInTheDocument();
  });

  it('falls back to clan id when unknown', () => {
    render(<PetSoulBadge clan="Z_unknown" displayName="X" />);
    expect(screen.getByText('Z_unknown')).toBeInTheDocument();
    expect(screen.getByText('X')).toBeInTheDocument();
  });

  it('omits tier when not provided', () => {
    const { container } = render(<PetSoulBadge clan="B_life" displayName="A" />);
    expect(screen.getByText('生活家')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/free|pro/i);
  });
});
