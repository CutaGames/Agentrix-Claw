package app.agentrix.wear.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * DTOs mirroring the backend contracts. Kept minimal — the watch is a THIN SHELL:
 * it renders read-only summaries and uploads de-identified semantics, and never
 * persists the soul's real body, private keys, or raw physiological readings.
 *
 * Contracts:
 *  - E3  soul-shell.types.ts   → handshake / SoulSessionView / wallet-session
 *  - E1  perception.types.ts   → PerceptionSignal
 */

// ── E3: Soul-Shell handshake ─────────────────────────────

@Serializable
data class ShellCapabilities(
    val mic: Boolean? = null,
    val speaker: Boolean? = null,
    val screen: String? = null,       // "none" | "tiny" | "small" | "full"
    val haptics: Boolean? = null,
    val wakeword: Boolean? = null,
    val sensors: List<String>? = null,
    val wallet: Boolean? = null,
)

@Serializable
data class SoulSessionHandshake(
    val agentAccountId: String,
    val shell: String = "watch",
    val capabilities: ShellCapabilities,
    val clientVersion: String? = null,
)

@Serializable
data class Persona(
    val name: String? = null,
    val intimacyLevel: Int? = null,
)

@Serializable
data class ShellPresence(
    val shell: String,
    val active: Boolean,
)

@Serializable
data class PresenceEnvelope(
    val shells: List<ShellPresence> = emptyList(),
)

@Serializable
data class SoulSessionView(
    val agentAccountId: String,
    val persona: Persona = Persona(),
    val memoryAvailable: Boolean = false,
    val presence: PresenceEnvelope = PresenceEnvelope(),
    val voiceId: String? = null,
    val grantedCapabilities: List<String> = emptyList(),
    val negotiated: ShellCapabilities = ShellCapabilities(),
)

// ── E1: de-identified perception signal (upload only) ────

@Serializable
data class PerceptionSignal(
    val agentAccountId: String,
    val shell: String = "watch",
    val sceneClass: String? = null,
    val activityClass: String? = null,     // "focused" | "sedentary" | "active" | ...
    val ambientTags: List<String>? = null,
    val localTime: String? = null,         // "morning" | "afternoon" | "evening" | "night"
)

// ── Read-only glance / approval view models ──────────────

/** Read-only earnings glance. AXP and stablecoin kept SEPARATE (honest, no投资承诺). */
@Serializable
data class EarningsGlance(
    val axp: Double = 0.0,
    val stableByCurrency: Map<String, Double> = emptyMap(), // e.g. {"USDC": 1.2, "USDT": 0.0}
    val unread: Int = 0,
    val pendingApprovals: Int = 0,
)

/** Pending action awaiting wrist approval. */
@Serializable
data class PendingApproval(
    val id: String,
    val kind: String,                    // toolName / action kind
    val description: String = "",
    val amount: Money? = null,
    val counterpartyClass: String? = null,
    val risk: String = "low",            // low | medium | high
)

@Serializable
data class Money(
    val value: Double,
    val currency: String,
)

/** Generic backend envelope: { success, data }. */
@Serializable
data class ApiEnvelope<T>(
    val success: Boolean = false,
    val data: T? = null,
    val message: String? = null,
)
