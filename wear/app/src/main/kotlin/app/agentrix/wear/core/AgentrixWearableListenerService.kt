package app.agentrix.wear.core

import android.util.Log
import app.agentrix.wear.AgentrixWearApp
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Receives Data Layer traffic from the phone on the shared /agentrix/** paths and
 * routes it: auth-state → AuthBridge (token sync), approval-request → in-app flow.
 *
 * Reuses the exact same paths as the RN `WatchDataLayerService`, so no phone changes.
 */
class AgentrixWearableListenerService : WearableListenerService() {

    override fun onMessageReceived(event: MessageEvent) {
        val app = AgentrixWearApp.instance
        val json = String(event.data)
        when (event.path) {
            AuthBridge.PATH_AUTH_STATE -> app.authBridge.applyAuthStateJson(json)
            AuthBridge.PATH_APPROVAL_REQUEST -> emitApproval(json)
            else -> Log.d(TAG, "unhandled message: ${event.path}")
        }
    }

    override fun onDataChanged(events: DataEventBuffer) {
        val app = AgentrixWearApp.instance
        events.forEach { event ->
            if (event.type != DataEvent.TYPE_CHANGED) return@forEach
            val path = event.dataItem.uri.path ?: return@forEach
            if (path == AuthBridge.PATH_AUTH_STATE) {
                val map = DataMapItem.fromDataItem(event.dataItem).dataMap
                app.authBridge.applyAuthState(map)
            }
        }
    }

    private fun emitApproval(json: String) {
        runCatching { incomingApprovals.tryEmit(json) }
    }

    companion object {
        private const val TAG = "AgentrixWLS"
        /** Push channel for approval requests arriving via Data Layer. */
        val incomingApprovals = MutableSharedFlow<String>(extraBufferCapacity = 8)
        val approvalStream = incomingApprovals.asSharedFlow()
    }
}
