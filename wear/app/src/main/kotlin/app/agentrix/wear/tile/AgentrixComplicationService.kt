package app.agentrix.wear.tile

import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import app.agentrix.wear.AgentrixWearApp
import app.agentrix.wear.core.ApiClient

/**
 * 表盘小组件 Complication — agent 在线点 / 未读数. Honors the platform refresh budget
 * (UPDATE_PERIOD_SECONDS=1800 in the manifest). Honest empty state ("—") when unknown.
 */
class AgentrixComplicationService : SuspendingComplicationDataSourceService() {

    override fun getPreviewData(type: ComplicationType): ComplicationData? {
        if (type != ComplicationType.SHORT_TEXT) return null
        return shortText("●3", "Agentrix 未读")
    }

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData {
        val app = AgentrixWearApp.instance
        val agent = app.tokens.agentAccountId
            ?: return shortText("—", "未登录")
        return when (val r = app.api.earningsGlance(agent)) {
            is ApiClient.Result.Ok -> {
                val unread = r.value.unread + r.value.pendingApprovals
                shortText(if (unread > 0) "●$unread" else "●", "Agentrix 在线")
            }
            else -> shortText("—", "离线")
        }
    }

    private fun shortText(text: String, description: String): ShortTextComplicationData =
        ShortTextComplicationData.Builder(
            text = PlainComplicationText.Builder(text).build(),
            contentDescription = PlainComplicationText.Builder(description).build(),
        ).build()
}
