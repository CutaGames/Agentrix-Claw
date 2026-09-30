package app.agentrix.wear.core

/**
 * SoulShellClient — E3 handshake facade for the watch shell.
 *
 * Declares the watch's real capabilities (small screen, mic/speaker if present, haptics,
 * wallet=false by default) and negotiates with the backend. The returned SoulSessionView
 * is a READ-ONLY summary (persona / presence / voice / granted capabilities) — the watch
 * caches it in memory only and never persists the soul's real body (thin-shell).
 *
 * A capability is shown as usable ONLY if it appears in `grantedCapabilities`
 * (S1 authorization ∩ shell hardware), so unauthorized capabilities never render as active.
 */
class SoulShellClient(
    private val api: ApiClient,
    private val tokens: TokenStore,
) {
    @Volatile
    var session: SoulSessionView? = null
        private set

    private fun watchCapabilities(): ShellCapabilities = ShellCapabilities(
        mic = true,
        speaker = true,
        screen = "small",
        haptics = true,
        wakeword = false,
        sensors = listOf("heart_rate", "steps"),
        wallet = false,          // watch never initiates wallet sessions by default
    )

    suspend fun handshake(): ApiClient.Result<SoulSessionView> {
        val agent = tokens.agentAccountId
            ?: return ApiClient.Result.Error("no agent bound")
        val req = SoulSessionHandshake(
            agentAccountId = agent,
            shell = "watch",
            capabilities = watchCapabilities(),
            clientVersion = "wear-0.1.0",
        )
        val result = api.handshake(req)
        if (result is ApiClient.Result.Ok) session = result.value
        return result
    }

    fun grants(): List<String> = session?.grantedCapabilities ?: emptyList()
    fun isGranted(cap: String): Boolean = grants().contains(cap)
}
