# Agentrix Watch — independent watchOS app target

This folder contains the SwiftUI sources and Info.plist for the standalone
watchOS application. The app is wired to be added as an Xcode target named
`AgentrixWatch` (WatchKit App + WatchKit Extension) inside the existing
`Agentrix.xcodeproj` workspace.

## Why standalone

App Store no longer accepts watchOS apps that only ship as RN extensions.
The Living Tile, Complications, and Wrist-Tap signing all require a real
watchOS app target. RN can no longer host them after watchOS 10.

## How to add the target in Xcode (10-min setup)

1. Open `ios/Agentrix.xcworkspace` in Xcode 15+.
2. File → New → Target → watchOS → **App**.
3. Product Name: `AgentrixWatch`. Bundle Identifier:
   `app.agentrix.claw.watchkitapp`. Language: **Swift**, Interface: **SwiftUI**.
4. After Xcode generates the placeholder, replace `AgentrixWatchApp.swift` and
   `ContentView.swift` with the files in this folder.
5. Drag `LivingTileView.swift`, `WatchApprovalView.swift`,
   `WristTapHandler.swift`, and `AgentrixWatchComplications.swift` into the
   target's **Compile Sources**.
6. Enable Capabilities: **HealthKit** (read HR / SpO₂ / HRV),
   **Background Modes → Workout processing**, **Sign in with Apple**.
7. Add to `Info.plist` of the new target the keys mirrored from
   `AgentrixWatchInfo.plist` here (NSHealthShareUsageDescription,
   WKBackgroundModes, etc.).
8. Build & run on Apple Watch Series 6+ simulator. Confirm Living Tile renders.

## Wire to phone via WCSession

`WristTapHandler.swift` opens a `WCSession` that talks to the phone's
`AgentrixIntentBridge` (already shipped in
[ios/AgentrixIntents/AgentrixWatchShortcuts.swift](../AgentrixIntents/AgentrixWatchShortcuts.swift)).
After Face/Touch ID returns success on phone, the watch tile gets a
`approval:approved` push back over the same channel and updates UI.

## Approval flow (PRD §L2 wrist-tap)

```
[Watch]                 [Backend]                       [Phone]
  │ raise wrist 1s        │                                │
  ├──────────────────────▶│ POST /approval/:id/wrist-trigger
  │                       │ broadcast presence:approval:wrist-trigger
  │                       │────────────────────────────────▶│
  │                       │                                │ Face/Touch ID prompt
  │                       │                                │ POST /approval/:id/approve
  │                       │◀───────────────────────────────┤
  │ approval:approved push│                                │
  │◀──────────────────────│                                │
  │ haptic ✓              │                                │
```

This file is the **only** Xcode-target manifest checked into git; the actual
`.xcodeproj` modifications stay local until macOS-CI is in place.
