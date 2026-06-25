// Phase 4 W7 — HW-7.x — watchOS Complication placeholder for Agentrix Pet
//
// Stub provider that will be implemented in Phase 5 (W9-W12) when the
// ClawCore watchOS adapter ships. This file exists in Phase 4 so the API
// surface can be reviewed alongside docs/RFC_CLAWCORE_PROTOCOL.zh-CN.md.
//
// Surface:
//   - Complication families: .modularSmall, .modularLarge, .graphicCircular,
//     .graphicCorner.
//   - Content: pet energy %, today's earnings, paused glyph.
//   - Refresh: 15 min minimum (watchOS Time-Travel budget); push via
//     companion iPhone when energy or paused state changes materially.
//
// Wire format: matches docs/RFC_CLAWCORE_PROTOCOL.zh-CN.md §4.1 (`pet_state`).

import ClockKit
import Foundation

/// AgentrixPetComplicationProvider — watchOS Complication entry point.
///
/// NOTE: Stub placeholder for Phase 4 review. Real implementation lands in
/// Phase 5 alongside ClawCore SDK v1.
@available(watchOS 7.0, *)
final class AgentrixPetComplicationProvider: NSObject, CLKComplicationDataSource {

    func getCurrentTimelineEntry(
        for complication: CLKComplication,
        withHandler handler: @escaping (CLKComplicationTimelineEntry?) -> Void
    ) {
        // TODO(@hardware Phase 5):
        //   1. Read cached PetState from ClawCore watch adapter
        //      (App Group shared with companion iOS app).
        //   2. Build CLKComplicationTemplate per family showing energy %,
        //      today's earnings, paused glyph.
        //   3. Schedule next reload when state changes via WCSession push.
        handler(nil)
    }

    func getPlaceholderTemplate(
        for complication: CLKComplication,
        withHandler handler: @escaping (CLKComplicationTemplate?) -> Void
    ) {
        // Render demo content for the watch face gallery picker.
        handler(nil)
    }

    func getSupportedTimeTravelDirections(
        for complication: CLKComplication,
        withHandler handler: @escaping (CLKComplicationTimeTravelDirections) -> Void
    ) {
        handler([])
    }
}
