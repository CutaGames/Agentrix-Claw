# Pet Sound Assets — Placeholder Slots

Drop the following 5 short audio clips here once design has them ready.
The mobile pet companion (`src/services/petInteractionFx.ts`) lazily
`require()`s each file; if a file is missing the corresponding sound is
silently skipped (haptics + the rest of the UI still work), so this
directory can stay empty during early dev with no crashes.

| File | Expected length | Trigger | Notes |
| --- | --- | --- | --- |
| `chirp.m4a`  | 100 - 250 ms | Tap on pet | Soft happy chirp / blip. |
| `crunch.m4a` | 250 - 500 ms | Feed action | Single bite or kibble crunch. |
| `purr.m4a`   | ~1 s, fades  | Long-press on pet | Warm purr loop snippet. |
| `snore.m4a`  | 1 - 2 s, **loopable** | Sleepy emotion | Looped while pet emotion=sleepy. |
| `cheer.m4a`  | 400 - 700 ms | Mini-game level-up | Short success / cheer sting. |

## Recommended encoding

- Container: `m4a` (AAC-LC) — works on iOS and Android via `expo-av`.
- Bitrate: 64 - 96 kbps (these are very short cues).
- Sample rate: 44.1 kHz mono is fine.
- Volume: roughly -6 dBFS peak; let the player attenuate to 60% in code.
- iOS silent switch: respected automatically (`playsInSilentModeIOS: false`).

## Sourcing options

1. Voice actor pet pack (preferred — matches "灵狐" character voice).
2. CC0 / royalty-free libraries:
   - [freesound.org](https://freesound.org/) — search "cat chirp", "kitten purr".
   - [zapsplat.com](https://zapsplat.com/) (free with attribution).
3. Synth: tool such as Logic Pro, GarageBand, or `sox`/`ffmpeg` can
   generate placeholder beeps.

After dropping the files, no code change is required — just rebuild the
mobile binary so the bundler picks up the new `require()` resolutions.
