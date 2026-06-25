# Voice UI Regression Matrix

This suite is the long-term UI guardrail for mobile voice flows that previously relied on backend smoke tests only.

Covered now:
- Floating ball entry into voice chat
- First-time voice onboarding progression and persistence
- Voice chat return path back to agent console without blank-screen regression
- Duplex voice UI state exposure and interaction-mode toggle coverage
- Text-chat entry upgraded into voice mode from inside AgentChat
- Voice mode on/off transitions between text composer and voice status surface
- Back-stack cleanliness guard so AgentConsole is not duplicated after returning
- Microphone permission denial and recovery path for live voice
- Simulated wake-word trigger opening voice chat from the floating ball
- Agent voice persona switching inside chat settings

E2E harness design:
- Web-only E2E bootstrap injects auth, onboarding, instance, and agent-account state
- Voice UI tests run against a minimal navigator shell instead of the entire app shell
- Network calls used by AgentConsole and AgentChat are mocked inside the app to remove CORS and backend coupling
- Duplex/live voice UI state is simulated in E2E mode so UI regressions can be tested without browser microphone or realtime socket dependencies
- Wake-word entry is simulated through an app-level E2E runtime event so the floating-ball path is validated without device speech recognition

Next recommended additions:
- Realtime interruption UI while assistant speech is active
- Cross-platform viewport coverage for narrow mobile web layouts
- Wake-word availability banner and fallback path on supported devices