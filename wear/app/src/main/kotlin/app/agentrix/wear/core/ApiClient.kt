package app.agentrix.wear.core

import app.agentrix.wear.BuildConfig
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

/**
 * Ktor-based backend client for the watch shell.
 *
 * All calls carry the phone-synced JWT (Authorization: Bearer). Endpoints reused:
 *  - E3   POST /soul-shell/handshake, GET /soul-shell/delivery-shell
 *  - E1   POST /embodiment/perception/signal
 *  - glance / approvals (read-only aggregation; falls back gracefully if 404)
 *
 * Design contracts: env-gated backend endpoints return 404 when disabled → callers
 * treat that as "feature unavailable" (not an error). 401 → auth fallback flow.
 */
class ApiClient(private val tokens: TokenStore) {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val http = HttpClient(OkHttp) {
        expectSuccess = false
        install(ContentNegotiation) { json(json) }
        install(HttpTimeout) {
            requestTimeoutMillis = 15_000
            connectTimeoutMillis = 10_000
        }
    }

    private val base = BuildConfig.API_BASE.trimEnd('/')

    sealed class Result<out T> {
        data class Ok<T>(val value: T) : Result<T>()
        object Unauthorized : Result<Nothing>()          // 401 → trigger auth fallback
        object Unavailable : Result<Nothing>()           // 404 / env-gated off
        data class Error(val reason: String) : Result<Nothing>()
    }

    private fun auth(): String? = tokens.accessToken

    // ── E3: handshake ────────────────────────────────────
    suspend fun handshake(req: SoulSessionHandshake): Result<SoulSessionView> =
        postEnvelope("$base/soul-shell/handshake", req)

    // ── E1: perception signal (de-identified upload) ─────
    suspend fun uploadPerception(signal: PerceptionSignal): Result<Boolean> {
        val token = auth() ?: return Result.Unauthorized
        return runCatching {
            val res: HttpResponse = http.post("$base/embodiment/perception/signal") {
                header(HttpHeaders.Authorization, "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(signal)
            }
            mapStatus(res) { Result.Ok(true) }
        }.getOrElse { Result.Error(it.message ?: "network") }
    }

    // ── read-only earnings / unread / pending glance ─────
    suspend fun earningsGlance(agentAccountId: String): Result<EarningsGlance> {
        val token = auth() ?: return Result.Unauthorized
        return runCatching {
            val res: HttpResponse = http.get("$base/wearable-telemetry/glance") {
                header(HttpHeaders.Authorization, "Bearer $token")
                header("X-Agent-Account", agentAccountId)
            }
            mapStatus(res) {
                val env = json.decodeFromString(
                    ApiEnvelope.serializer(EarningsGlance.serializer()),
                    it.bodyText(),
                )
                env.data?.let { d -> Result.Ok(d) } ?: Result.Ok(EarningsGlance())
            }
        }.getOrElse { Result.Error(it.message ?: "network") }
    }

    // ── pending approvals (read) ─────────────────────────
    suspend fun pendingApprovals(): Result<List<PendingApproval>> {
        val token = auth() ?: return Result.Unauthorized
        return runCatching {
            val res: HttpResponse = http.get("$base/wearable-telemetry/approvals") {
                header(HttpHeaders.Authorization, "Bearer $token")
            }
            mapStatus(res) {
                val env = json.decodeFromString(
                    ApiEnvelope.serializer(kotlinx.serialization.builtins.ListSerializer(PendingApproval.serializer())),
                    it.bodyText(),
                )
                Result.Ok(env.data ?: emptyList())
            }
        }.getOrElse { Result.Error(it.message ?: "network") }
    }

    /**
     * Quick-ask: one utterance → short answer. Reuses the phone-verified conversation
     * endpoint; the watch requests an explicitly SHORT response (thin shell — no full thread).
     */
    suspend fun quickAsk(text: String): Result<String> {
        val token = auth() ?: return Result.Unauthorized
        return runCatching {
            val res: HttpResponse = http.post("$base/wearable-telemetry/quick-ask") {
                header(HttpHeaders.Authorization, "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(mapOf("text" to text, "shell" to "watch", "brief" to "true"))
            }
            mapStatus(res) {
                // Parse leniently — the answer may sit under data.reply / data.text / message.
                val root = json.parseToJsonElement(it.bodyText())
                val answer = extractAnswer(root)
                Result.Ok(answer)
            }
        }.getOrElse { Result.Error(it.message ?: "network") }
    }

    /** Respond to an approval. Failure/timeout is handled by the caller as fail-closed. */
    suspend fun respondApproval(id: String, approve: Boolean): Result<Boolean> {
        val token = auth() ?: return Result.Unauthorized
        return runCatching {
            val res: HttpResponse = http.post("$base/wearable-telemetry/approvals/$id") {
                header(HttpHeaders.Authorization, "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(mapOf("decision" to if (approve) "approve" else "reject"))
            }
            mapStatus(res) { Result.Ok(true) }
        }.getOrElse { Result.Error(it.message ?: "network") }
    }

    // ── helpers ──────────────────────────────────────────
    private suspend inline fun <reified Req, reified T> postEnvelope(
        url: String,
        body: Req,
    ): Result<T> {
        val token = auth() ?: return Result.Unauthorized
        return runCatching {
            val res: HttpResponse = http.post(url) {
                header(HttpHeaders.Authorization, "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(body)
            }
            when (res.status) {
                HttpStatusCode.OK, HttpStatusCode.Created -> {
                    val env: ApiEnvelope<T> = res.body()
                    env.data?.let { Result.Ok(it) } ?: Result.Error("empty data")
                }
                HttpStatusCode.Unauthorized -> Result.Unauthorized
                HttpStatusCode.NotFound -> Result.Unavailable
                else -> Result.Error("http ${res.status.value}")
            }
        }.getOrElse { Result.Error(it.message ?: "network") }
    }

    private suspend inline fun <T> mapStatus(
        res: HttpResponse,
        onOk: (HttpResponse) -> Result<T>,
    ): Result<T> = when (res.status) {
        HttpStatusCode.OK, HttpStatusCode.Created -> onOk(res)
        HttpStatusCode.Unauthorized -> Result.Unauthorized
        HttpStatusCode.NotFound -> Result.Unavailable
        else -> Result.Error("http ${res.status.value}")
    }

    private suspend fun HttpResponse.bodyText(): String = body()

    private fun extractAnswer(root: kotlinx.serialization.json.JsonElement): String {
        val obj = root as? kotlinx.serialization.json.JsonObject ?: return ""
        fun str(e: kotlinx.serialization.json.JsonElement?): String? =
            (e as? kotlinx.serialization.json.JsonPrimitive)?.content
        val data = obj["data"] as? kotlinx.serialization.json.JsonObject
        return str(data?.get("reply"))
            ?: str(data?.get("text"))
            ?: str(data?.get("answer"))
            ?: str(obj["data"])
            ?: str(obj["message"])
            ?: ""
    }
}
