// ClawCore Android Bridge SDK — interface skeleton (Phase 5 HW-10.4).
//
// Source-of-truth contract: shared/clawcore/v1/bridge.ts
//
// Real implementation lands as a published .aar in Phase 5 W10. This file
// freezes the package + interface signature so the @hardware team and the
// Agentrix-Claw RN bridge can plan against a stable surface.

package top.agentrix.clawcore

import kotlinx.coroutines.flow.Flow

/** Result of a successful pair() call. The DST MUST be persisted exactly
 *  once in EncryptedSharedPreferences / Android Keystore. */
data class PairResult(
    val deviceId: String,
    val dst: String,
    val deviceClass: String
)

/** Discovery result (BLE advertisement). */
data class ScanHit(
    val deviceId: String,
    val rssi: Int,
    val advName: String?
)

/** Lifecycle + frame events surfaced as a Kotlin Flow. */
sealed class BridgeEvent {
    data class Connected(val deviceId: String) : BridgeEvent()
    data class Disconnected(val deviceId: String, val reason: String?) : BridgeEvent()
    data class PetStateFrame(val raw: String) : BridgeEvent()       // raw JSON; host parses
    data class PetEventFrame(val raw: String) : BridgeEvent()
    data class ApprovalRequestFrame(val raw: String) : BridgeEvent()
    data class OtaProgress(val deviceId: String, val index: Int, val total: Int) : BridgeEvent()
    data class Error(val deviceId: String?, val code: String, val message: String) : BridgeEvent()
}

interface ClawCoreBridge {
    suspend fun init(apiBase: String, mqttHost: String, mqttPort: Int = 8883)
    suspend fun scan(timeoutMs: Long = 10_000): List<ScanHit>
    suspend fun pair(ticket: String, deviceId: String): PairResult
    suspend fun connect(deviceId: String, dst: String)
    suspend fun disconnect(deviceId: String)
    suspend fun sendApprovalResponse(frameJson: String)
    suspend fun sendEvent(frameJson: String)
    suspend fun beginOta(deviceId: String): Pair<String, String> // (packageId, version)
    fun events(): Flow<BridgeEvent>
}

/** Error codes — must match shared/clawcore/v1/bridge.ts BridgeErrorCodes. */
object BridgeErrorCodes {
    const val NOT_INITIALISED = "BRIDGE_NOT_INITIALISED"
    const val TRANSPORT_UNAVAILABLE = "BRIDGE_TRANSPORT_UNAVAILABLE"
    const val PAIR_TICKET_INVALID = "BRIDGE_PAIR_TICKET_INVALID"
    const val AUTH_REJECTED = "BRIDGE_AUTH_REJECTED"
    const val REPLAY_DETECTED = "BRIDGE_REPLAY_DETECTED"
    const val OTA_INTEGRITY_FAIL = "BRIDGE_OTA_INTEGRITY_FAIL"
    const val OTA_RESUMED = "BRIDGE_OTA_RESUMED"
    const val TIMEOUT = "BRIDGE_TIMEOUT"
}
