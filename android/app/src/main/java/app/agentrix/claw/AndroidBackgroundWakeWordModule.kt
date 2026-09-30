package app.agentrix.claw

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AndroidBackgroundWakeWordModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AndroidBackgroundWakeWord"

  @ReactMethod
  fun isOverlayPermissionGranted(promise: Promise) {
    promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
  }

  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${reactApplicationContext.packageName}"),
      ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("overlay_permission", error)
    }
  }

  @ReactMethod
  fun syncConfig(configJson: String, promise: Promise) {
    try {
      BackgroundWakeWordPreferences.saveConfig(reactApplicationContext, configJson)
      AndroidBackgroundWakeWordService.enqueueRefresh(reactApplicationContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("sync_config_failed", error)
    }
  }

  @ReactMethod
  fun startService(promise: Promise) {
    try {
      AndroidBackgroundWakeWordService.enqueueStart(reactApplicationContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("start_service_failed", error)
    }
  }

  @ReactMethod
  fun stopService(promise: Promise) {
    try {
      AndroidBackgroundWakeWordService.enqueueStop(reactApplicationContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("stop_service_failed", error)
    }
  }

  @ReactMethod
  fun isServiceRunning(promise: Promise) {
    promise.resolve(AndroidBackgroundWakeWordService.isRunning)
  }
}