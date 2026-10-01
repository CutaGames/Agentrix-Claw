# Native Modules — Implementation Guide

> Sprint 5 · Task 5.8
>
> This document describes the native code that needs to be written to fully
> enable VRM 3D rendering, AR scanning, and iOS Dynamic Island features.

---

## 1. iOS Live Activity (Dynamic Island)

### Overview

Dynamic Island displays the pet's emotion, energy level, and current task
progress in the iOS system UI. Requires **iOS 16.1+** and a **Widget Extension**
target with ActivityKit capability.

### What needs to be built

1. **Widget Extension Target** (`AgentrixLiveActivityWidget`)
   - Add a new Widget Extension target in Xcode
   - Enable "Supports Live Activities" in the extension's Info.plist
   - Add `NSSupportsLiveActivities = YES` to the main app's Info.plist

2. **Swift ActivityAttributes**

```swift
import ActivityKit
import WidgetKit
import SwiftUI

struct PetActivityAttributes: ActivityAttributes {
    // Static data (set at start, doesn't change)
    struct ContentState: Codable, Hashable {
        var petName: String
        var emotion: String        // "happy", "sad", "excited", etc.
        var energyPercent: Int     // 0-100
        var currentTask: String?
        var taskProgress: Int?     // 0-100
    }
}
```

3. **Widget Views**

```swift
struct PetLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PetActivityAttributes.self) { context in
            // Lock screen / banner view
            PetLockScreenView(state: context.state)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded view (long press)
                DynamicIslandExpandedRegion(.leading) {
                    PetEmotionIcon(emotion: context.state.emotion)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    EnergyGauge(percent: context.state.energyPercent)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.petName)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let task = context.state.currentTask {
                        TaskProgressView(task: task, progress: context.state.taskProgress)
                    }
                }
            } compactLeading: {
                // Compact leading (left pill)
                PetMiniEmoji(emotion: context.state.emotion)
            } compactTrailing: {
                // Compact trailing (right pill)
                Text("\(context.state.energyPercent)%")
                    .font(.caption2)
            } minimal: {
                // Minimal (when sharing with other activities)
                PetMiniEmoji(emotion: context.state.emotion)
            }
        }
    }
}
```

4. **Expo Native Module Bridge** (`AgentrixLiveActivity`)

```swift
import ExpoModulesCore
import ActivityKit

public class AgentrixLiveActivityModule: Module {
    public func definition() -> ModuleDefinition {
        Name("AgentrixLiveActivity")

        AsyncFunction("startActivity") { (params: [String: Any]) -> String? in
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }

            let attributes = PetActivityAttributes()
            let state = PetActivityAttributes.ContentState(
                petName: params["petName"] as? String ?? "",
                emotion: params["emotion"] as? String ?? "neutral",
                energyPercent: params["energyPercent"] as? Int ?? 100,
                currentTask: params["currentTask"] as? String,
                taskProgress: params["taskProgress"] as? Int
            )

            let activity = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil)
            )
            return activity.id
        }

        AsyncFunction("updateActivity") { (activityId: String, params: [String: Any]) in
            // Find and update the activity by ID
            for activity in Activity<PetActivityAttributes>.activities {
                if activity.id == activityId {
                    let state = PetActivityAttributes.ContentState(/* ... */)
                    await activity.update(.init(state: state, staleDate: nil))
                    break
                }
            }
        }

        AsyncFunction("endActivity") { (activityId: String) in
            for activity in Activity<PetActivityAttributes>.activities {
                if activity.id == activityId {
                    await activity.end(nil, dismissalPolicy: .immediate)
                    break
                }
            }
        }

        AsyncFunction("endAllActivities") {
            for activity in Activity<PetActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }

        AsyncFunction("hasActiveActivity") { () -> Bool in
            return !Activity<PetActivityAttributes>.activities.isEmpty
        }
    }
}
```

5. **Registration** — Add to `ios/Podfile` or expo module config:
   - The module auto-registers via `expo-modules-core` if placed in the
     correct directory structure

### Testing

- Requires a **physical iOS device** (Simulator supports Live Activities
  only in Xcode 14.1+)
- Use `ActivityKit.ActivityAuthorizationInfo().areActivitiesEnabled` to
  check if the user has enabled Live Activities in Settings

---

## 2. AR Scanning (Advanced — Future)

### Current Implementation

The current `CameraScanScreen` uses a simplified multi-photo capture flow
with `expo-camera`. Users manually take 8-12 photos from different angles.

### Native AR Enhancement (Optional)

For a guided AR experience with real-time object tracking:

1. **iOS (ARKit)**
   - Use `ARWorldTrackingConfiguration` with object detection
   - Overlay a 3D bounding box around the detected object
   - Auto-capture frames at optimal angles (every ~30° rotation)
   - Use `ARFrame.capturedImage` for high-quality captures

2. **Android (ARCore)**
   - Use `Session` with `Config.UpdateMode.LATEST_CAMERA_IMAGE`
   - Track a plane/object and guide the user around it
   - Capture frames using `Frame.acquireCameraImage()`

3. **Implementation approach**
   - Create an Expo native module `AgentrixARScanner`
   - Bridge the native AR session to React Native
   - Emit events: `onObjectDetected`, `onAngleChanged`, `onAutoCapture`
   - Fall back to the manual photo flow if AR is unavailable

### Dependencies (if implementing native AR)

```
# iOS — already included via Expo
ARKit (system framework)

# Android
com.google.ar:core:1.40.0
```

### Why we chose multi-photo over native AR

- Works on all devices (no AR hardware requirement)
- Simpler implementation (no native code needed)
- Same end result (photos → backend NeRF/SfM → .vrm)
- AR guidance is a UX enhancement, not a functional requirement

---

## 3. VRM 3D Rendering — Performance Notes

### Current Approach: expo-gl + three.js

We use `expo-gl` (GLView) as the WebGL rendering surface with `three.js`
and `@pixiv/three-vrm` for VRM model loading and blendshape control.

### Known Limitations

| Issue | Impact | Mitigation |
|-------|--------|------------|
| WebGL via GLView is single-threaded | Lower FPS than native | Only enable on high-end devices (≥ 8 GB RAM) |
| three.js bundle size (~600 KB gzipped) | Larger app binary | Lazy-load via dynamic import; only loaded when VRM is needed |
| No hardware-accelerated skinning | CPU-bound bone transforms | Limit VRM models to < 30K polygons |
| GLView doesn't support all WebGL2 features | Some shaders may fail | Use basic materials (MeshStandardMaterial) |
| Memory pressure on complex models | Potential OOM on mid-range | Strict device tier gating via `isHighEndDevice()` |

### Performance Targets

- **Target FPS**: 30 fps on high-end devices
- **Max polygon count**: 30,000 triangles
- **Max texture resolution**: 1024×1024
- **Load time**: < 3 seconds for a typical VRM model

### Alternative: react-native-filament (Future)

If WebGL performance proves insufficient, consider migrating to
`react-native-filament` which uses Google's Filament renderer natively:

**Pros:**
- Native GPU rendering (much better performance)
- Supports PBR materials natively
- Hardware-accelerated skeletal animation

**Cons:**
- Newer library, less battle-tested
- Requires native build (no Expo Go)
- Different API from three.js (migration cost)

### Optimization Checklist

- [ ] Use `VRMUtils.removeUnnecessaryJoints()` to reduce bone count
- [ ] Use `VRMUtils.removeUnnecessaryVertices()` to reduce geometry
- [ ] Limit shadow maps (or disable shadows entirely)
- [ ] Use `renderer.setPixelRatio(1)` (not device pixel ratio)
- [ ] Dispose of textures/geometries on unmount
- [ ] Consider LOD (Level of Detail) for distant views
- [ ] Profile with `gl.getExtension('WEBGL_debug_renderer_info')` to
      detect GPU capabilities at runtime

---

## 4. File Structure

```
src/
├── components/pet/
│   ├── PetRiveRenderer.tsx      ← Main renderer (VRM → Rive → Gradient fallback)
│   └── PetVrmRenderer.tsx       ← VRM 3D renderer (expo-gl + three.js)
├── screens/pet/
│   └── CameraScanScreen.tsx     ← Multi-angle photo capture
├── services/
│   ├── petScan.service.ts       ← Photo upload + polling
│   └── liveActivity.service.ts  ← Dynamic Island stub
├── utils/
│   └── deviceCapability.ts      ← Device tier detection (low/mid/high)
└── native/
    └── README.md                ← This file

ios/ (future)
├── AgentrixLiveActivityWidget/
│   ├── AgentrixLiveActivityWidget.swift
│   ├── PetActivityAttributes.swift
│   └── Info.plist
└── Modules/
    └── AgentrixLiveActivityModule.swift
```

---

## 5. Integration Checklist

- [x] `package.json` — Added `three`, `expo-three`, `expo-gl`, `@pixiv/three-vrm`
- [x] `app.json` — Added `expo-gl` to plugins
- [x] `deviceCapability.ts` — Added `'vrm'` renderer type + `isHighEndDevice()`
- [x] `PetVrmRenderer.tsx` — VRM 3D component with emotion blendshapes
- [x] `PetRiveRenderer.tsx` — Updated fallback chain (VRM → Rive → Gradient)
- [x] `CameraScanScreen.tsx` — Multi-angle photo capture UI
- [x] `petScan.service.ts` — Photo upload + task polling
- [x] `liveActivity.service.ts` — Dynamic Island service stub
- [ ] Swift Widget Extension — Requires Xcode + native development
- [ ] AR native module — Optional enhancement (current flow works without it)
- [ ] VRM model assets — Need 3D artist to create clan-specific models
- [ ] Backend NeRF/SfM pipeline — `POST /api/v1/pet-generation/scan` endpoint

---

*Last updated: Sprint 5 implementation*
