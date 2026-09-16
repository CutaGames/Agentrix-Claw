package app.agentrix.wear.health

import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.health.services.client.HealthServices
import androidx.health.services.client.PassiveListenerCallback
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DataTypeAvailability
import androidx.health.services.client.data.PassiveListenerConfig
import androidx.health.services.client.data.DataPointContainer
import app.agentrix.wear.core.ApiClient
import app.agentrix.wear.core.PerceptionSignal
import app.agentrix.wear.core.TokenStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.util.Calendar

/**
 * HealthMonitor — REAL sensor data via Health Services (replaces the old RN Math.random
 * simulation). It NEVER uploads raw readings: on-device it maps heart-rate / steps into a
 * coarse SEMANTIC activity class and uploads that de-identified signal to E1
 * (POST /embodiment/perception/signal).
 *
 * Gates (design Property 3):
 *   1. BODY_SENSORS runtime permission granted, AND
 *   2. perceptionEnabled == true (default OFF; user opt-in via the authorization center).
 * If either gate is closed → nothing is collected or uploaded.
 */
class HealthMonitor(
    context: Context,
    private val api: ApiClient,
    private val tokens: TokenStore,
) {
    private val appContext = context.applicationContext
    private val client = HealthServices.getClient(appContext).passiveMonitoringClient

    /** Default OFF — collection only after explicit opt-in (perceptionEnabled). */
    @Volatile
    var perceptionEnabled: Boolean = false

    private val _latest = MutableStateFlow(HealthSnapshot())
    val latest: StateFlow<HealthSnapshot> = _latest

    data class HealthSnapshot(
        val available: Boolean = false,
        val activityClass: String? = null,   // sedentary | active | focused | resting
        val hrAvailable: Boolean = false,
    )

    fun hasBodySensorsPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            appContext, android.Manifest.permission.BODY_SENSORS,
        ) == PackageManager.PERMISSION_GRANTED

    /** Begin passive monitoring — no-op unless both gates are open. */
    suspend fun start() {
        if (!perceptionEnabled) { Log.d(TAG, "perception disabled — not collecting"); return }
        if (!hasBodySensorsPermission()) { Log.d(TAG, "no BODY_SENSORS — not collecting"); return }

        val config = PassiveListenerConfig.builder()
            .setDataTypes(setOf(DataType.HEART_RATE_BPM, DataType.STEPS_DAILY))
            .build()

        runCatching {
            client.setPassiveListenerCallback(config, callback)
        }.onFailure { Log.w(TAG, "setPassiveListenerCallback failed: ${it.message}") }
    }

    suspend fun stop() {
        runCatching { client.clearPassiveListenerCallbackAsync() }
    }

    private val callback = object : PassiveListenerCallback {
        override fun onNewDataPointsReceived(dataPoints: DataPointContainer) {
            if (!perceptionEnabled) return
            val hr: Double? = dataPoints.getData(DataType.HEART_RATE_BPM)
                .lastOrNull()?.value
            val steps: Double? = dataPoints.getData(DataType.STEPS_DAILY)
                .lastOrNull()?.value?.toDouble()
            val activity = classify(hr, steps)
            _latest.value = HealthSnapshot(
                available = true,
                activityClass = activity,
                hrAvailable = hr != null,
            )
            uploadSemantic(activity)
        }

        override fun onPermissionLost() {
            _latest.value = HealthSnapshot(available = false)
        }
    }

    /** Delegates to the pure [ActivityClassifier] (coarse buckets ONLY; no raw data leaves). */
    internal fun classify(hr: Double?, dailySteps: Double?): String =
        ActivityClassifier.classify(hr, dailySteps)

    private fun localTimeBucket(): String {
        val h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return when (h) {
            in 5..11 -> "morning"
            in 12..17 -> "afternoon"
            in 18..22 -> "evening"
            else -> "night"
        }
    }

    private val uploadScope = kotlinx.coroutines.CoroutineScope(
        kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.IO,
    )

    private fun uploadSemantic(activityClass: String) {
        val agent = tokens.agentAccountId ?: return
        val signal = PerceptionSignal(
            agentAccountId = agent,
            shell = "watch",
            activityClass = activityClass,
            ambientTags = listOf("wearable"),
            localTime = localTimeBucket(),
        )
        // Fire-and-forget; failure is closed (nothing uploaded, no raw data retained).
        uploadScope.launch {
            runCatching { api.uploadPerception(signal) }
                .onFailure { Log.w(TAG, "perception upload failed (closed): ${it.message}") }
        }
    }

    companion object {
        private const val TAG = "AgentrixHealth"
        val supportedDataTypes = setOf(DataType.HEART_RATE_BPM, DataType.STEPS_DAILY)
    }
}
