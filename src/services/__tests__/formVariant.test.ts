import { resolveCurrentVariant } from '../formVariant.service';

describe('resolveCurrentVariant priority', () => {
  test('default when nothing matches', () => {
    expect(resolveCurrentVariant({})).toBe('default');
  });

  test('walking → journey', () => {
    expect(resolveCurrentVariant({ isWalking: true })).toBe('journey');
  });

  test('calendar meeting beats walking', () => {
    expect(
      resolveCurrentVariant({ isInCalendarMeeting: true, isWalking: true }),
    ).toBe('work');
  });

  test('Quiet_Hours beats meeting + walking', () => {
    expect(
      resolveCurrentVariant({
        isInQuietHours: true,
        isInCalendarMeeting: true,
        isWalking: true,
      }),
    ).toBe('night');
  });

  test('manual lock with valid until-ms wins over Quiet_Hours', () => {
    expect(
      resolveCurrentVariant({
        manualLockedUntilMs: Date.now() + 60_000,
        manualVariant: 'work',
        isInQuietHours: true,
      }),
    ).toBe('work');
  });

  test('manual lock without manualVariant falls through to next priority', () => {
    expect(
      resolveCurrentVariant({
        manualLockedUntilMs: Date.now() + 60_000,
        // manualVariant is undefined → resolver should not apply manual override
        isInQuietHours: true,
      }),
    ).toBe('night');
  });

  test('expired manual lock falls through to next priority', () => {
    expect(
      resolveCurrentVariant({
        manualLockedUntilMs: Date.now() - 60_000,
        manualVariant: 'work',
        isInQuietHours: true,
      }),
    ).toBe('night');
  });

  test('manual lock can force night when nothing else applies', () => {
    expect(
      resolveCurrentVariant({
        manualLockedUntilMs: Date.now() + 60_000,
        manualVariant: 'night',
      }),
    ).toBe('night');
  });
});
