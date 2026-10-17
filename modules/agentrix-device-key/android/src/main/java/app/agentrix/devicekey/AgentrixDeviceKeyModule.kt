package app.agentrix.devicekey

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.security.keystore.UserNotAuthenticatedException
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.math.BigInteger
import java.security.InvalidAlgorithmParameterException
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec

private const val KEYSTORE = "AndroidKeyStore"
private const val ALIAS = "agentrix.device.p256.v1"

/**
 * After the owner authenticated (biometrics or the lock-screen code, through expo-local-authentication in
 * src/services/phoneDeviceKeyNative.ts), the key can sign for this many seconds. Enrollment signs twice
 * (pairing, then registering) inside one window.
 */
private const val AUTH_WINDOW_SECONDS = 15

private class DeviceKeyException(code: String, message: String, cause: Throwable? = null) :
  CodedException(code, message, cause)

/**
 * The phone's own P-256 device key (src/services/phoneDeviceKey.ts; contracts device-pairing-proof.ts,
 * device-signing-credential.ts).
 * - Generated in the Android Keystore: never exportable; StrongBox when the phone has it, else the TEE.
 * - Every use needs a recent owner authentication (biometrics class 3 or the device credential), so the key
 *   needs a secure lock screen to exist at all. A new biometric enrolment invalidates it (the default), the
 *   phone then registers again with a new key.
 * - Signs ECDSA-SHA256 over the UTF-8 message and returns the DER signature (base64); the JS side turns it
 *   into the contracts' P1363 form. Nothing here logs a message or a signature.
 */
class AgentrixDeviceKeyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AgentrixDeviceKey")

    AsyncFunction<Map<String, String>?>("getPublicKey") {
      return@AsyncFunction currentPublicKey()
    }

    AsyncFunction<Map<String, String>>("createKey") {
      return@AsyncFunction currentPublicKey() ?: generate()
    }

    AsyncFunction("sign") { message: String, _prompt: String ->
      return@AsyncFunction sign(message)
    }
  }

  private fun keyStore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

  private fun currentPublicKey(): Map<String, String>? {
    val store = keyStore()
    val certificate = store.getCertificate(ALIAS) ?: return null
    val publicKey = certificate.publicKey as? ECPublicKey ?: return null
    val privateKey = store.getKey(ALIAS, null) as? PrivateKey ?: return null
    return mapOf(
      "x" to coordinate(publicKey.w.affineX),
      "y" to coordinate(publicKey.w.affineY),
      "hardware" to hardwareOf(privateKey),
    )
  }

  private fun generate(): Map<String, String> {
    val strongBox = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
    try {
      try {
        generateWith(strongBox)
      } catch (error: Exception) {
        // No StrongBox on this phone: the TEE.
        if (strongBox && isStrongBoxUnavailable(error)) generateWith(false) else throw error
      }
    } catch (error: Exception) {
      throw mapGenerateError(error)
    }
    return currentPublicKey() ?: throw DeviceKeyException("key_unavailable", "the key was not stored")
  }

  private fun isStrongBoxUnavailable(error: Exception): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
    return error is StrongBoxUnavailableException
  }

  private fun generateWith(strongBox: Boolean) {
    val builder = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
      .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
      .setDigests(KeyProperties.DIGEST_SHA256)
      .setUserAuthenticationRequired(true)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      builder.setUserAuthenticationParameters(
        AUTH_WINDOW_SECONDS,
        KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL,
      )
    } else {
      @Suppress("DEPRECATION")
      builder.setUserAuthenticationValidityDurationSeconds(AUTH_WINDOW_SECONDS)
    }
    if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      builder.setIsStrongBoxBacked(true)
    }
    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE)
    generator.initialize(builder.build())
    generator.generateKeyPair()
  }

  private fun mapGenerateError(error: Exception): CodedException {
    // No secure lock screen: a key that needs the owner cannot exist.
    if (error is InvalidAlgorithmParameterException || error.cause is IllegalStateException) {
      return DeviceKeyException("no_lock_screen", "set a screen lock first", error)
    }
    return DeviceKeyException("key_unavailable", error.javaClass.simpleName, error)
  }

  private fun sign(message: String): String {
    val privateKey = keyStore().getKey(ALIAS, null) as? PrivateKey
      ?: throw DeviceKeyException("no_key", "no device key")
    val signature = Signature.getInstance("SHA256withECDSA")
    try {
      signature.initSign(privateKey)
      signature.update(message.toByteArray(Charsets.UTF_8))
      return Base64.encodeToString(signature.sign(), Base64.NO_WRAP)
    } catch (error: UserNotAuthenticatedException) {
      throw DeviceKeyException("user_not_authenticated", "authenticate first", error)
    } catch (error: KeyPermanentlyInvalidatedException) {
      throw DeviceKeyException("key_invalidated", "the device key was invalidated", error)
    }
  }

  private fun hardwareOf(privateKey: PrivateKey): String {
    return try {
      val info = KeyFactory.getInstance(privateKey.algorithm, KEYSTORE).getKeySpec(privateKey, KeyInfo::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        when (info.securityLevel) {
          KeyProperties.SECURITY_LEVEL_STRONGBOX -> "strongbox"
          KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "tee"
          KeyProperties.SECURITY_LEVEL_SOFTWARE -> "software"
          else -> "unknown"
        }
      } else {
        @Suppress("DEPRECATION")
        if (info.isInsideSecureHardware) "tee" else "software"
      }
    } catch (_: Exception) {
      "unknown"
    }
  }

  /** Unsigned big-endian, exactly 32 bytes, base64url without padding. */
  private fun coordinate(value: BigInteger): String {
    val raw = value.toByteArray()
    val bytes = ByteArray(32)
    val length = minOf(raw.size, 32)
    System.arraycopy(raw, raw.size - length, bytes, 32 - length, length)
    return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
  }
}
