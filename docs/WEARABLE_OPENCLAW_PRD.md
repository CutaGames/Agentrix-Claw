# Agentrix Wearable OpenClaw PRD

## Goal

Build an executable wearable integration path inside the mobile app that stays compatible with the OpenClaw model: separate raw BLE/GATT transport, device-specific adaptation, and agent-facing capability mapping.

Phase 1 must be real, not mocked. The app needs to scan real nearby BLE wearables, connect to one device, discover GATT services and characteristics, read at least one readable characteristic when available, and surface a minimal verification payload that can later be routed into OpenClaw-compatible agent events.

## Product Outcome

The mobile app gains a real wearable validation lane under the existing Wearables entry. A partner can open the screen, grant permissions, discover a nearby device, connect, inspect service layout, see the first readable characteristic payload, and view the normalized agent verification event that proves the stack is wired end to end.

## Implementation Status

Current repository status:

- Phase 1 is implemented in-app with real BLE scan, connection, GATT discovery, first readable characteristic read, normalized profile generation, and verification event preview.
- Phase 2 has started with known-device registry enrichment, paired-device local persistence, and live monitoring support for the first notifiable characteristic.
- Phase 3 remains intentionally out of scope for the current mobile-only iteration.

## Layer Split

### 1. BLE/GATT Layer

Responsibilities:

- Own native BLE permissions and adapter state handling.
- Scan nearby BLE devices.
- Connect to a specific device.
- Discover services and characteristics.
- Perform the first readable characteristic read.
- Avoid product assumptions about vendor meaning.

Implementation file:

- `src/services/wearables/wearableBleGateway.service.ts`

Phase-1 contract:

- Input: none or selected device id.
- Output: raw scan results and raw connection snapshot with services, readable characteristics, first read payload, and read error if present.

### 2. Device Adaptation Layer

Responsibilities:

- Normalize raw BLE scan/connect output into stable Agentrix wearable models.
- Infer coarse device kind like ring, band, clip, or sensor.
- Translate standard service UUIDs into readable labels.
- Produce support tier and concise readiness summary.
- Stay device-profile oriented instead of agent-policy oriented.

Implementation file:

- `src/services/wearables/wearableDeviceAdapter.service.ts`

Phase-1 contract:

- Input: raw scan result or raw connection snapshot.
- Output: wearable candidate card data and normalized wearable profile.

### 3. Agent Capability Layer

Responsibilities:

- Convert normalized wearable profile into OpenClaw-compatible agent intent candidates.
- Generate the minimal verification event payload for downstream routing.
- Keep the boundary explicit: no direct BLE calls, no native assumptions.

Implementation file:

- `src/services/wearables/wearableAgentCapability.service.ts`

Phase-1 contract:

- Input: normalized wearable profile.
- Output: capability preview, trigger recommendations, and `wearable.phase1_verified` event payload.

## Phase-1 User Flow

1. User opens Wearables.
2. User grants Bluetooth and nearby-device permissions.
3. App runs a real BLE scan window and renders discovered devices.
4. User selects one device.
5. App connects and discovers GATT services.
6. App reads the first readable characteristic when available.
7. App shows connection result, discovered service labels, readable characteristic count, base64 payload preview or read error, and agent verification event preview.

## Acceptance Criteria

Phase 1 is done when all of the following are true:

- The Wearables screen no longer uses mock device data for the main flow.
- Android and iOS builds include BLE permission descriptions required for runtime access.
- The screen performs a real scan through `react-native-ble-plx`.
- The user can connect to a scanned device.
- The app discovers services and characteristics from the selected device.
- The app attempts one real characteristic read against the first readable characteristic.
- The result is converted into a normalized wearable profile.
- The normalized profile is converted into an agent-facing verification event.
- The full chain is visible in UI without requiring backend changes.

## Non-Goals For Phase 1

- Background BLE execution.
- Notification subscriptions and continuous streaming.
- Vendor-specific gesture decoding.
- Writing characteristics or OTA/device configuration.
- Syncing wearable data to backend.
- Auto-launching OpenClaw instances from wearable events.

## File Map

- `src/screens/agent/WearableHubScreen.tsx`: phase-1 UI and orchestration.
- `src/services/wearables/wearableBleGateway.service.ts`: raw BLE/GATT gateway.
- `src/services/wearables/wearableDeviceAdapter.service.ts`: device adaptation layer.
- `src/services/wearables/wearableAgentCapability.service.ts`: agent capability layer.
- `src/services/wearables/wearableTypes.ts`: shared contracts.

## Next Phases

### Phase 2

- characteristic subscription and live notification stream
- vendor profile registry for known devices
- gesture-to-agent event mapping
- persistent paired-device storage

Phase 2 current state:

- live notification stream: partially implemented via first notifiable characteristic monitor in the wearable hub screen
- vendor profile registry: partially implemented through a lightweight known-device registry keyed by device name patterns
- gesture-to-agent event mapping: still pending vendor-specific contracts
- persistent paired-device storage: implemented locally with AsyncStorage

### Phase 3

- OpenClaw bridge integration for routed wearable events
- background delivery policies
- silent context aggregation
- permission hardening and telemetry