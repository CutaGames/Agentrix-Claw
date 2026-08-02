package app.agentrix.wear.core

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Encrypted token storage — stores ONLY the JWT synced from the phone (+ minimal
 * identity), never private keys / raw physiological data / soul body (thin-shell).
 *
 * Backed by AndroidX Security EncryptedSharedPreferences (AES-256). Falls back to
 * plain prefs only if the keystore is unavailable (older/rooted devices), which is
 * logged by callers; tokens are short-lived and re-synced from the phone anyway.
 */
class TokenStore(context: Context) {

    private val prefs: SharedPreferences = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "agentrix_wear_secure",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (t: Throwable) {
        context.getSharedPreferences("agentrix_wear_fallback", Context.MODE_PRIVATE)
    }

    var accessToken: String?
        get() = prefs.getString(KEY_TOKEN, null)?.takeIf { it.isNotBlank() }
        set(value) = prefs.edit().putString(KEY_TOKEN, value).apply()

    var userId: String?
        get() = prefs.getString(KEY_USER, null)
        set(value) = prefs.edit().putString(KEY_USER, value).apply()

    var agentAccountId: String?
        get() = prefs.getString(KEY_AGENT, null)
        set(value) = prefs.edit().putString(KEY_AGENT, value).apply()

    val isAuthenticated: Boolean get() = accessToken != null

    fun clear() = prefs.edit().clear().apply()

    private companion object {
        const val KEY_TOKEN = "access_token"
        const val KEY_USER = "user_id"
        const val KEY_AGENT = "agent_account_id"
    }
}
