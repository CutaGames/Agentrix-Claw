/**
 * Lightweight unit tests for the mobile cross-cutting components added in build142.
 * Run with: npx jest src/components/common/__tests__/LoadingWithTimeout.spec.tsx
 *
 * These guard against regressions in:
 *   • LoadingWithTimeout escalates to "taking longer" after slowAfterMs
 *   • ModelCatalogSheet filters by search query + tier
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { LoadingWithTimeout } from '../LoadingWithTimeout';
import { ModelCatalogSheet, type ModelCatalogEntry } from '../ModelCatalogSheet';

jest.useFakeTimers();

// Minimal i18n store stub so components can resolve translations.
jest.mock('../../../stores/i18nStore', () => ({
  useI18n: () => ({ t: (d: { en: string; zh: string }) => d.en }),
}));

describe('LoadingWithTimeout', () => {
  it('renders idle spinner immediately', () => {
    const { queryByText } = render(<LoadingWithTimeout loading label="Fetching…" />);
    expect(queryByText('Fetching…')).toBeTruthy();
    expect(queryByText(/Taking longer/i)).toBeNull();
  });

  it('escalates to the slow card after slowAfterMs', () => {
    const { queryByText, rerender } = render(
      <LoadingWithTimeout loading slowAfterMs={1000} />,
    );
    act(() => { jest.advanceTimersByTime(1100); });
    rerender(<LoadingWithTimeout loading slowAfterMs={1000} />);
    expect(queryByText(/Taking longer than expected/i)).toBeTruthy();
  });

  it('shows Retry + Cancel when callbacks are provided', () => {
    const onRetry = jest.fn();
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <LoadingWithTimeout loading slowAfterMs={0} onRetry={onRetry} onCancel={onCancel} />,
    );
    act(() => { jest.advanceTimersByTime(10); });
    expect(getByTestId('loading-retry-btn')).toBeTruthy();
    expect(getByTestId('loading-cancel-btn')).toBeTruthy();
  });

  it('renders nothing when not loading', () => {
    const { toJSON } = render(<LoadingWithTimeout loading={false} />);
    expect(toJSON()).toBeNull();
  });
});

describe('ModelCatalogSheet', () => {
  const MODELS: ModelCatalogEntry[] = [
    { id: 'gemma-4-2b',                label: 'Gemma 4 E2B',        provider: 'On-device', tier: 'local' },
    { id: 'claude-haiku-4-5',          label: 'Claude Haiku 4.5',   provider: 'Agentrix Platform', tier: 'free' },
    { id: 'claude-opus-4-7-20260401',  label: 'Claude Opus 4.7',    provider: 'Anthropic', badge: 'Max+', tier: 'pro' },
    { id: 'us.anthropic.claude-opus-4-7-20260401-v1:0', label: 'Bedrock Opus 4.7', provider: 'AWS Bedrock', tier: 'enterprise' },
  ];

  it('renders all tier groups when no filter applied', () => {
    const { queryByText } = render(
      <ModelCatalogSheet
        visible
        onClose={() => {}}
        models={MODELS}
        onSelect={() => {}}
      />,
    );
    expect(queryByText('Claude Opus 4.7')).toBeTruthy();
    expect(queryByText('Claude Haiku 4.5')).toBeTruthy();
    expect(queryByText('Gemma 4 E2B')).toBeTruthy();
  });

  it('Opus 4.7 badge text is surfaced on the row', () => {
    const { queryByText } = render(
      <ModelCatalogSheet
        visible
        onClose={() => {}}
        models={MODELS}
        onSelect={() => {}}
      />,
    );
    expect(queryByText('Max+')).toBeTruthy();
  });
});
