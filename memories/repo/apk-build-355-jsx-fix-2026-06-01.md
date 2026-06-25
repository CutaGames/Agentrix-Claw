# APK build #355 failure root-cause + fix (2026-06-01)

## Symptom
- CI "Build → Test → Release APK" run #355 (branch build/aeon-world-2026-06-01) FAILED at step
  "Build public release APK", sub-task `:app:createBundleReleaseJsAndAssets`:
  `SyntaxError: src/screens/world/WorldHubScreen.tsx: Expected corresponding JSX closing tag for <>. (210:10)`

## Root cause
- Back in Aeon Phase 1, an Aeon entry `<Pressable>` was inserted into WorldHubScreen's `hasAssets`
  fragment block. The insertion DROPPED the opening `<View style={styles.rosterHeader}>` that wrapped
  the "My Characters" section header — leaving `</Pressable>` directly followed by
  `<Text sectionHeader/> <TouchableOpacity/> </View>` with an orphaned `</View>`.
- **getDiagnostics (TS language server) did NOT flag it** — TS's JSX error recovery tolerated the
  imbalance. **Babel/Metro (the release bundler) is stricter** and failed. This is the key lesson:
  getDiagnostics passing is necessary but NOT sufficient for "will the RN bundle build"; the metro
  bundle step in CI is the real gate for JSX structure.

## Fix
- Commit `98435587e`: re-added `<View style={styles.rosterHeader}>` wrapper around the My Characters
  header row. Verified fragment `<>` (line 168) closes at `</>` (line 272), ternary else `: (` intact.

## Re-build
- Re-mirrored to branch `build/aeon-world-2026-06-01b` → CI run #356. Passed
  `createBundleReleaseJsAndAssets` (the exact sub-step that killed #355) and proceeded into native
  Gradle APK compilation → fix confirmed effective.

## Note for future agents
- A pure heuristic JSX tag-balance checker (regex stack) gives too many false positives on
  multi-line tags / generics like `useNavigation<any>()` / ternary JSX. Don't trust it.
- Best cheap pre-build validation for RN JSX is still limited on the Windows stub (no babel/metro).
  Options: (a) run the metro bundle in WSL, or (b) accept the CI bundle step as the gate. Watch any
  file where blocks were programmatically inserted into JSX — verify the surrounding open/close tags
  by reading the tree, not just getDiagnostics.
