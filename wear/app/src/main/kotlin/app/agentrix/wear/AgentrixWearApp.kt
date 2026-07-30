package app.agentrix.wear

import android.app.Application
import app.agentrix.wear.core.ApiClient
import app.agentrix.wear.core.AuthBridge
import app.agentrix.wear.core.SoulShellClient
import app.agentrix.wear.core.TokenStore
import app.agentrix.wear.health.HealthMonitor

/**
 * Application entry point + tiny service locator. No DI framework — a thin shell keeps
 * its dependency surface (and APK size) minimal. All singletons are lazy.
 */
class AgentrixWearApp : Application() {

    val tokens: TokenStore by lazy { TokenStore(this) }
    val api: ApiClient by lazy { ApiClient(tokens) }
    val authBridge: AuthBridge by lazy { AuthBridge(this, tokens) }
    val soulShell: SoulShellClient by lazy { SoulShellClient(api, tokens) }
    val healthMonitor: HealthMonitor by lazy { HealthMonitor(this, api, tokens) }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    companion object {
        @Volatile
        lateinit var instance: AgentrixWearApp
            private set
    }
}
