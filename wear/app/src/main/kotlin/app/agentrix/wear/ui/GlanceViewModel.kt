package app.agentrix.wear.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.agentrix.wear.AgentrixWearApp
import app.agentrix.wear.core.ApiClient
import app.agentrix.wear.core.AuthBridge
import app.agentrix.wear.core.EarningsGlance
import app.agentrix.wear.core.PendingApproval
import app.agentrix.wear.core.SoulSessionView
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Drives the glance surface: auth state → E3 handshake → read-only summary + earnings.
 * All failures degrade gracefully (offline / unavailable), never crash the thin shell.
 */
class GlanceViewModel : ViewModel() {

    private val app get() = AgentrixWearApp.instance

    data class UiState(
        val auth: AuthBridge.AuthState = AuthBridge.AuthState.Requesting,
        val session: SoulSessionView? = null,
        val earnings: EarningsGlance = EarningsGlance(),
        val approvals: List<PendingApproval> = emptyList(),
        val offline: Boolean = false,
        val loading: Boolean = true,
    )

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    fun bootstrap() {
        viewModelScope.launch {
            app.authBridge.state.collect { authState ->
                _ui.value = _ui.value.copy(auth = authState)
                if (authState == AuthBridge.AuthState.Authenticated) {
                    refresh()
                }
            }
        }
        viewModelScope.launch { app.authBridge.requestAuthState() }
    }

    fun refresh() {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true)
            // E3 handshake for the read-only soul summary.
            when (val hs = app.soulShell.handshake()) {
                is ApiClient.Result.Ok ->
                    _ui.value = _ui.value.copy(session = hs.value, offline = false)
                is ApiClient.Result.Unauthorized -> {
                    app.authBridge.requestAuthState(); return@launch
                }
                is ApiClient.Result.Unavailable ->
                    _ui.value = _ui.value.copy(session = null) // E3 gated off → glance still works
                is ApiClient.Result.Error ->
                    _ui.value = _ui.value.copy(offline = true)
            }

            val agent = app.tokens.agentAccountId
            if (agent != null) {
                when (val e = app.api.earningsGlance(agent)) {
                    is ApiClient.Result.Ok -> _ui.value = _ui.value.copy(earnings = e.value)
                    else -> { /* keep last / zeros — honest empty state */ }
                }
            }
            when (val a = app.api.pendingApprovals()) {
                is ApiClient.Result.Ok -> _ui.value = _ui.value.copy(approvals = a.value)
                else -> { /* leave as-is */ }
            }
            _ui.value = _ui.value.copy(loading = false)
        }
    }
}
