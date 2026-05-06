// Phase 4 W7 — HW-7.x — Wear OS Tile placeholder for Agentrix Pet
//
// This is the *contract* skeleton that the @hardware team will flesh out
// once the ClawCore Wear OS adapter (Phase 5) is built. It is intentionally
// the only Wear OS file in the repo today so the API surface is reviewable
// during Phase 4 RFC.
//
// Surface:
//   - Tile shows: pet name, energy bar, today's earnings, paused indicator.
//   - Tap → opens companion phone app (Agentrix-Claw).
//   - Refresh: 30 s while screen on; cached state otherwise.
//
// Wire format: matches docs/RFC_CLAWCORE_PROTOCOL.zh-CN.md §4.1 (`pet_state`).

package top.agentrix.wearos.tile

import androidx.wear.tiles.TileService
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.ResponseBuilders
import com.google.common.util.concurrent.ListenableFuture

/**
 * AgentrixPetTileService — Wear OS Tile entry point.
 *
 * NOTE: This is a stub placeholder for Phase 4 review. Real implementation
 * lands in Phase 5 W9-W12 alongside ClawCore SDK v1.
 */
class AgentrixPetTileService : TileService() {

    override fun onTileRequest(
        requestParams: RequestBuilders.TileRequest
    ): ListenableFuture<ResponseBuilders.Tile> {
        // TODO(@hardware Phase 5):
        //   1. Fetch cached PetState from ClawCore Wear adapter
        //      (transport: Bluetooth → companion phone → backend).
        //   2. Render LayoutElementBuilders with energy ring + earnings text.
        //   3. Wire onClick → ActivityIntent that opens Agentrix-Claw app.
        TODO("Phase 5 — implement against ClawCore wearable adapter")
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest
    ): ListenableFuture<ResponseBuilders.Resources> {
        TODO("Phase 5 — provide pet skin thumbnail + energy ring assets")
    }
}
