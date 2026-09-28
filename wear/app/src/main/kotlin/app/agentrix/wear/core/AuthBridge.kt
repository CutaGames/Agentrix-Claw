package app.agentrix.wear.core

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.tasks.await

/**
 * AuthBridge — reuses the EXACT same Data Layer paths as the RN `AgentrixWearDataLayer`
 * / `WatchDataLayerService`, so it works with the unchanged phone app:
 *
 *   Phone → Watch  DataItem/Message  /agentrix/auth/state   { accessToken, userId, ... }
 *   Watch → Phone  Message           /agentrix/auth/request { requestedAt }
 *
 * On no token → surfaces an "open Agentrix on your phone to log in" prompt (Requirement 6.2),
 * never a silent 401 loop. Tokens land in encrypted TokenStore.
 */
class AuthBridge(
    context: Context,
    private val tokens: TokenStore,
) {
    private val appContext = context.applicationContext
    private val messageClient: MessageClient = Wearable.getMessageClient(appContext)
    private val dataClient = Wearable.getDataClient(appContext)
    private val nodeClient = Wearable.getNodeClient(appContext)

    private val _state = MutableStateFlow(if (tokens.isAuthenticated) AuthState.Authenticated else AuthState.NeedsLogin)
    val state: StateFlow<AuthState> = _state

    enum class AuthState { Authenticated, NeedsLogin, Requesting }

    /** Apply an auth-state payload received on /agentrix/auth/state (DataItem or Message). */
    fun applyAuthState(map: DataMap) {
        val token = map.getString(KEY_TOKEN)
        if (token.isNullOrBlank()) {
            tokens.clear()
            _state.value = AuthState.NeedsLogin
            return
        }
        tokens.accessToken = token
        map.getString(KEY_USER)?.let { tokens.userId = it }
        map.getString(KEY_AGENT)?.let { tokens.agentAccountId = it }
        _state.value = AuthState.Authenticated
    }

    fun applyAuthStateJson(json: String) {
        // Message payloads arrive as JSON bytes (same shape the RN side broadcasts).
        runCatching {
            val obj = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
                .parseToJsonElement(json).let { it as kotlinx.serialization.json.JsonObject }
            val token = obj["accessToken"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
            if (token.isNullOrBlank()) {
                tokens.clear(); _state.value = AuthState.NeedsLogin; return
            }
            tokens.accessToken = token
            (obj["userId"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.let { tokens.userId = it }
            (obj["agentAccountId"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.let { tokens.agentAccountId = it }
            _state.value = AuthState.Authenticated
        }.onFailure { Log.w(TAG, "auth json parse failed: ${it.message}") }
    }

    /** Ask the phone to push the current auth state. Idempotent; safe to retry. */
    suspend fun requestAuthState() {
        if (tokens.isAuthenticated) { _state.value = AuthState.Authenticated; return }
        _state.value = AuthState.Requesting
        runCatching {
            val nodes = nodeClient.connectedNodes.await()
            if (nodes.isEmpty()) { _state.value = AuthState.NeedsLogin; return }
            val payload = "{\"requestedAt\":${System.currentTimeMillis()}}".toByteArray()
            nodes.forEach { node ->
                runCatching { messageClient.sendMessage(node.id, PATH_AUTH_REQUEST, payload).await() }
            }
            // Also refresh via existing DataItem, if any.
            syncFromDataItems()
        }.onFailure {
            Log.w(TAG, "requestAuthState failed: ${it.message}")
            if (!tokens.isAuthenticated) _state.value = AuthState.NeedsLogin
        }
    }

    /** Pull the latest /agentrix/auth/state DataItem (survives disconnects). */
    suspend fun syncFromDataItems() {
        runCatching {
            val items = dataClient.dataItems.await()
            items.forEach { item ->
                if (item.uri.path == PATH_AUTH_STATE) {
                    val map = com.google.android.gms.wearable.DataMapItem.fromDataItem(item).dataMap
                    applyAuthState(map)
                }
            }
            items.release()
        }.onFailure { Log.w(TAG, "syncFromDataItems failed: ${it.message}") }
        if (!tokens.isAuthenticated) _state.value = AuthState.NeedsLogin
    }

    /** Push a watch→phone approval decision message (reuses /agentrix/approval/response). */
    suspend fun sendApprovalResponse(id: String, approve: Boolean) {
        runCatching {
            val nodes = nodeClient.connectedNodes.await()
            val payload = "{\"id\":\"$id\",\"decision\":\"${if (approve) "approve" else "reject"}\"}".toByteArray()
            nodes.forEach { node ->
                runCatching { messageClient.sendMessage(node.id, PATH_APPROVAL_RESPONSE, payload).await() }
            }
        }.onFailure { Log.w(TAG, "sendApprovalResponse failed: ${it.message}") }
    }

    companion object {
        private const val TAG = "AgentrixAuthBridge"
        const val PATH_AUTH_STATE = "/agentrix/auth/state"
        const val PATH_AUTH_REQUEST = "/agentrix/auth/request"
        const val PATH_APPROVAL_REQUEST = "/agentrix/approval/request"
        const val PATH_APPROVAL_RESPONSE = "/agentrix/approval/response"
        private const val KEY_TOKEN = "accessToken"
        private const val KEY_USER = "userId"
        private const val KEY_AGENT = "agentAccountId"
    }
}
