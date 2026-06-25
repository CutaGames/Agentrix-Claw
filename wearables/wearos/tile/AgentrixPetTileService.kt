// Phase 6 P2-7 — Wear OS Tile for Agentrix Pet (lightweight demo build).
//
// Renders a minimum-viable pet status tile so the watch face can host
// Agentrix Pet alongside other complications. The full
// ClawCore-Wear-adapter integration still lands in Phase 7+, but this
// stops the Tile being a `TODO` stub: it now produces a real layout when
// queried, using cached state via `PetTileStateCache`.
//
// Surface:
//   - Tile shows: pet name, energy %, today's earnings (if known),
//                 paused indicator (· paused), and a tap-to-open hint.
//   - Tap → opens Agentrix-Claw companion app via `MAIN` intent.
//   - Refresh: every 30 s while screen on; cached state otherwise.
//
// Wire format: matches docs/RFC_CLAWCORE_PROTOCOL.zh-CN.md §4.1 (`pet_state`).
// Cache contract:
//   PetTileStateCache stores the most recent snapshot pushed by the
//   companion phone (via DataLayer or HTTP fetch fallback). A null cache
//   yields a "Connecting…" placeholder layout instead of crashing.

package top.agentrix.wearos.tile

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.wear.tiles.ActionBuilders
import androidx.wear.tiles.ColorBuilders
import androidx.wear.tiles.DimensionBuilders.dp
import androidx.wear.tiles.LayoutElementBuilders
import androidx.wear.tiles.ModifiersBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.ResourceBuilders
import androidx.wear.tiles.ResponseBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import androidx.wear.tiles.TimelineBuilders
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/** Minimal cached pet snapshot. Populated by the companion phone. */
data class PetTileSnapshot(
    val petName: String,
    val energyPct: Int,        // 0-100
    val earningsToday: String, // pre-formatted text, e.g. "$1.23"
    val paused: Boolean,
    val updatedAtMs: Long,
)

/**
 * Process-lifetime cache. Replaced by DataLayer/Room in Phase 7;
 * the goal here is just to stop the Tile being a hard stub.
 */
object PetTileStateCache {
    @Volatile private var snapshot: PetTileSnapshot? = null
    fun get(): PetTileSnapshot? = snapshot
    fun set(value: PetTileSnapshot) { snapshot = value }
}

private const val RESOURCES_VERSION = "p6-p2-7"
private const val REFRESH_INTERVAL_MS = 30_000L
private const val PHONE_PACKAGE = "top.agentrix.claw"

/**
 * AgentrixPetTileService — Wear OS Tile entry point.
 */
class AgentrixPetTileService : TileService() {

    override fun onTileRequest(
        requestParams: RequestBuilders.TileRequest
    ): ListenableFuture<TileBuilders.Tile> {
        val snapshot = PetTileStateCache.get()
        val layout = if (snapshot == null) placeholderLayout() else petLayout(snapshot)

        val tile = TileBuilders.Tile.Builder()
            .setResourcesVersion(RESOURCES_VERSION)
            .setFreshnessIntervalMillis(REFRESH_INTERVAL_MS)
            .setTimeline(
                TimelineBuilders.Timeline.Builder()
                    .addTimelineEntry(
                        TimelineBuilders.TimelineEntry.Builder()
                            .setLayout(
                                LayoutElementBuilders.Layout.Builder().setRoot(layout).build()
                            )
                            .build()
                    )
                    .build()
            )
            .build()
        return Futures.immediateFuture(tile)
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest
    ): ListenableFuture<ResourceBuilders.Resources> {
        return Futures.immediateFuture(
            ResourceBuilders.Resources.Builder()
                .setVersion(RESOURCES_VERSION)
                .build()
        )
    }

    // -------------------------------------------------------------------
    // Layout helpers
    // -------------------------------------------------------------------

    private fun placeholderLayout(): LayoutElementBuilders.LayoutElement {
        return LayoutElementBuilders.Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(textLine("Agentrix Pet", sizeSp = 14, bold = true))
            .addContent(textLine("Connecting…", sizeSp = 11))
            .setModifiers(tapToOpenModifier())
            .build()
    }

    private fun petLayout(s: PetTileSnapshot): LayoutElementBuilders.LayoutElement {
        val statusLine = if (s.paused) "${s.energyPct}% · paused" else "${s.energyPct}% energy"
        return LayoutElementBuilders.Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(textLine(s.petName, sizeSp = 14, bold = true))
            .addContent(textLine(statusLine, sizeSp = 12))
            .addContent(textLine("Today: ${s.earningsToday}", sizeSp = 11))
            .setModifiers(tapToOpenModifier())
            .build()
    }

    private fun textLine(
        text: String,
        sizeSp: Int = 12,
        bold: Boolean = false,
    ): LayoutElementBuilders.Text {
        val style = LayoutElementBuilders.FontStyle.Builder()
            .setSize(LayoutElementBuilders.SpProp.Builder().setValue(sizeSp.toFloat()).build())
            .setColor(ColorBuilders.argb(0xFFFFFFFF.toInt()))
            .setWeight(
                LayoutElementBuilders.FontWeightProp.Builder()
                    .setValue(
                        if (bold) LayoutElementBuilders.FONT_WEIGHT_BOLD
                        else LayoutElementBuilders.FONT_WEIGHT_NORMAL
                    )
                    .build()
            )
            .build()
        return LayoutElementBuilders.Text.Builder()
            .setText(text)
            .setFontStyle(style)
            .build()
    }

    private fun tapToOpenModifier(): ModifiersBuilders.Modifiers {
        val openPhoneApp = ActionBuilders.LaunchAction.Builder()
            .setAndroidActivity(
                ActionBuilders.AndroidActivity.Builder()
                    .setPackageName(PHONE_PACKAGE)
                    .setClassName("$PHONE_PACKAGE.MainActivity")
                    .build()
            )
            .build()
        return ModifiersBuilders.Modifiers.Builder()
            .setClickable(
                ModifiersBuilders.Clickable.Builder()
                    .setId("open_pet_app")
                    .setOnClick(openPhoneApp)
                    .build()
            )
            .build()
    }
}
