package app.agentrix.wear.approval

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.agentrix.wear.AgentrixWearApp
import app.agentrix.wear.core.AgentrixWearableListenerService
import app.agentrix.wear.core.ApiClient
import app.agentrix.wear.core.Money
import app.agentrix.wear.core.PendingApproval
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Wrist-approval state. Sources待审批 from BOTH the REST endpoint (polled on open) and the
 * Data Layer push (/agentrix/approval/request from the phone). Decisions go back through
 * the backend fence; if that write fails, we DO NOT mark it approved (fail-closed).
 */
class ApprovalViewModel : ViewModel() {

    private val app get() = AgentrixWearApp.instance
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    data class State(
        val items: List<PendingApproval> = emptyList(),
        val processingId: String? = null,
        val lastError: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    fun start() {
        refresh()
        viewModelScope.launch {
            AgentrixWearableListenerService.approvalStream.collect { payload ->
                parsePush(payload)?.let { incoming ->
                    val merged = (_state.value.items + incoming).distinctBy { it.id }
                    _state.value = _state.value.copy(items = merged)
                }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            when (val r = app.api.pendingApprovals()) {
                is ApiClient.Result.Ok -> _state.value = _state.value.copy(items = r.value, lastError = null)
                is ApiClient.Result.Unavailable -> { /* endpoint gated / none — keep Data Layer items */ }
                is ApiClient.Result.Unauthorized -> { app.authBridge.requestAuthState() }
                is ApiClient.Result.Error -> _state.value = _state.value.copy(lastError = "加载失败")
            }
        }
    }

    fun decide(id: String, approve: Boolean) {
        _state.value = _state.value.copy(processingId = id, lastError = null)
        viewModelScope.launch {
            // Relay through both channels: REST (authoritative fence) + Data Layer (phone).
            val rest = app.api.respondApproval(id, approve)
            app.authBridge.sendApprovalResponse(id, approve)
            when (rest) {
                is ApiClient.Result.Ok ->
                    _state.value = _state.value.copy(
                        items = _state.value.items.filterNot { it.id == id },
                        processingId = null,
                    )
                else -> {
                    // Fail-closed: do NOT remove/approve locally; surface the failure.
                    _state.value = _state.value.copy(
                        processingId = null,
                        lastError = "网络失败，已按未批准处理",
                    )
                }
            }
        }
    }

    private fun parsePush(payload: String): PendingApproval? = runCatching {
        val o: JsonObject = json.parseToJsonElement(payload).jsonObject
        val id = o["id"]?.jsonPrimitive?.content ?: return null
        PendingApproval(
            id = id,
            kind = o["toolName"]?.jsonPrimitive?.content
                ?: o["kind"]?.jsonPrimitive?.content ?: "action",
            description = o["description"]?.jsonPrimitive?.content ?: "",
            amount = parseMoney(o),
            counterpartyClass = o["counterpartyClass"]?.jsonPrimitive?.content,
            risk = o["riskLevel"]?.jsonPrimitive?.content
                ?: o["risk"]?.jsonPrimitive?.content ?: "low",
        )
    }.getOrNull()

    private fun parseMoney(o: JsonObject): Money? {
        val amt = o["amount"] as? JsonObject ?: return null
        val v = (amt["value"] as? JsonPrimitive)?.content?.toDoubleOrNull() ?: return null
        val c = (amt["currency"] as? JsonPrimitive)?.content ?: return null
        return Money(v, c)
    }
}
