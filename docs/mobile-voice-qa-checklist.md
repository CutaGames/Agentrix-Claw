# Mobile Voice QA Checklist

Use this checklist before submitting a new mobile build for voice or AgentChat changes.

## Preconditions

- Install the candidate APK on a real Android device.
- Log in with a user account that already has at least one bound OpenClaw instance.
- Confirm the device has microphone permission enabled for the app.
- Confirm backend API is reachable and the bound instance is expected to be online.

## Core Voice Flow

1. Launch the app and wait on Discover.
2. Verify the floating ball is visible in idle state.
3. Tap the floating ball once.
4. Expected:
   - The app navigates to AgentChat.
   - The floating ball disappears on the chat screen.
   - No white screen appears.
   - No offline banner appears if the instance is online.
5. Wait 2 to 3 seconds.
6. Expected:
   - Voice status bar appears.
   - Duplex voice enters ready/listening state.
   - Speaking into the mic updates voice input behavior or transcript flow.

## Repeat Entry Regression

1. From AgentChat, go back to Discover.
2. Verify the floating ball returns in idle state, not stuck green.
3. Tap the floating ball again.
4. Expected:
   - Re-enters AgentChat cleanly.
   - No white screen.
   - No stuck voice state.

## My Agents Entry

1. Open My > Agent Management.
2. Tap a specific agent instance.
3. Expected:
   - AgentChat opens for the selected instance.
   - Header name matches the tapped instance.
   - No incorrect offline banner when the selected instance is online.

## Text Chat Baseline

1. In AgentChat, send a short text message.
2. Expected:
   - Message sends successfully.
   - Assistant reply arrives.
   - No forced offline queue banner unless backend is actually unavailable.

## Voice Interrupt / Resume

1. Trigger assistant speech.
2. While speaking, tap the mic/live voice control.
3. Expected:
   - Speech can be interrupted.
   - App remains responsive.
   - No crash or white screen.

## Wake Word Fallback

1. Return to Discover and leave the app on screen.
2. Say the configured wake phrase.
3. Expected:
   - Either wake-to-chat works, or if disabled/unavailable, there is no crash and tap-to-enter still works.

## Failure Capture

If a step fails, capture all of the following before the next build:

- Screenshot of the screen state.
- Exact entry path used: floating ball or My Agents.
- Whether the instance should have been online.
- Whether microphone permission was granted.
- The first failed step number from this checklist.
