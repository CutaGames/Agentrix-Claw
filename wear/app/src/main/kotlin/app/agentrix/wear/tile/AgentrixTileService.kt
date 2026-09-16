package app.agentrix.wear.tile

import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DeviceParametersBuilders.DeviceParameters
import androidx.wear.protolayout.LayoutElementBuilders.Column
import androidx.wear.protolayout.LayoutElementBuilders.Layout
import androidx.wear.protolayout.LayoutElementBuilders.LayoutElement
import androidx.wear.protolayout.ResourceBuilders.Resources
import androidx.wear.protolayout.TimelineBuilders.Timeline
import androidx.wear.protolayout.material.Text
import androidx.wear.protolayout.material.Typography
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders.Tile
import androidx.wear.tiles.TileService
import app.agentrix.wear.AgentrixWearApp
import app.agentrix.wear.core.ApiClient
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.guava.future

/**
 * 一瞥卡片 Tile — 免打开 App 显示 在场 / 收益(AXP·稳定币分列) / 未读+待审批。
 * Low-frequency refresh (30 min) to respect the background/battery budget.
 *
 * Thin-shell honest state: shows zeros/"—" when data unavailable, never fabricates.
 */
class AgentrixTileService : TileService() {

    private val scope = CoroutineScope(Dispatchers.IO)
    private val RESOURCES_VERSION = "1"

    override fun onTileRequest(
        requestParams: RequestBuilders.TileRequest,
    ): ListenableFuture<Tile> = scope.future {
        val summary = loadSummary()
        val params = requestParams.deviceConfiguration
        Tile.Builder()
            .setResourcesVersion(RESOURCES_VERSION)
            .setFreshnessIntervalMillis(30 * 60 * 1000L)
            .setTileTimeline(
                Timeline.fromLayoutElement(tileLayout(summary, params)),
            )
            .build()
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest,
    ): ListenableFuture<Resources> = Futures.immediateFuture(
        Resources.Builder().setVersion(RESOURCES_VERSION).build(),
    )

    private data class Summary(
        val online: Boolean,
        val axp: String,
        val stable: String,
        val pending: Int,
    )

    private suspend fun loadSummary(): Summary {
        val app = AgentrixWearApp.instance
        val agent = app.tokens.agentAccountId ?: return Summary(false, "—", "—", 0)
        val earnings = when (val r = app.api.earningsGlance(agent)) {
            is ApiClient.Result.Ok -> r.value
            else -> return Summary(false, "—", "—", 0)
        }
        val stable = earnings.stableByCurrency.entries.firstOrNull { it.value > 0.0 }
        return Summary(
            online = true,
            axp = fmt(earnings.axp),
            stable = "${stable?.key ?: "USDC"} ${fmt(stable?.value ?: 0.0)}",
            pending = earnings.pendingApprovals,
        )
    }

    private fun tileLayout(s: Summary, params: DeviceParameters): LayoutElement =
        Column.Builder()
            .addContent(
                Text.Builder(this, if (s.online) "● 在线" else "○ 离线")
                    .setTypography(Typography.TYPOGRAPHY_TITLE3)
                    .setColor(argb(0xFF7C5CFF.toInt()))
                    .build(),
            )
            .addContent(
                Text.Builder(this, "AXP ${s.axp}")
                    .setTypography(Typography.TYPOGRAPHY_BODY1)
                    .setColor(argb(0xFFFFFFFF.toInt()))
                    .build(),
            )
            .addContent(
                Text.Builder(this, s.stable)
                    .setTypography(Typography.TYPOGRAPHY_BODY2)
                    .setColor(argb(0xFFB0B0B0.toInt()))
                    .build(),
            )
            .addContent(
                Text.Builder(this, "待审批 ${s.pending}")
                    .setTypography(Typography.TYPOGRAPHY_CAPTION2)
                    .setColor(argb(0xFFB0B0B0.toInt()))
                    .build(),
            )
            .build()

    private fun fmt(v: Double): String =
        if (v == v.toLong().toDouble()) v.toLong().toString() else String.format("%.2f", v)
}
