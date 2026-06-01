package app.agentrix.claw

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.PixelFormat
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.log10
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt

private const val TAG = "BgWakeWord"
private const val PREFS_NAME = "agentrix_background_wake_word"
private const val PREF_CONFIG = "config_json"
private const val ACTION_START = "app.agentrix.claw.action.START_BG_WAKE_WORD"
private const val ACTION_STOP = "app.agentrix.claw.action.STOP_BG_WAKE_WORD"
private const val ACTION_REFRESH = "app.agentrix.claw.action.REFRESH_BG_WAKE_WORD"
private const val NOTIFICATION_CHANNEL_ID = "agentrix_background_wake_word"
private const val NOTIFICATION_ID = 18731

private const val SAMPLE_RATE = 16000
private const val FRAME_LENGTH = 512
private const val PREBUFFER_SAMPLES = 3200
private const val START_THRESHOLD = 0.12
private const val END_THRESHOLD = 0.045
private const val END_FRAME_COUNT = 8
private const val MIN_DURATION_MS = 280
private const val MAX_DURATION_MS = 1800
private const val COOLDOWN_MS = 1500L

data class BackgroundWakeWordModel(
  val displayName: String,
  val centroid: FloatArray,
  val samples: List<FloatArray>,
)

data class BackgroundWakeWordConfig(
  val enabled: Boolean,
  val displayName: String,
  val threshold: Double,
  val activeInstanceId: String?,
  val activeInstanceName: String?,
  val model: BackgroundWakeWordModel?,
)

object BackgroundWakeWordPreferences {
  fun saveConfig(context: Context, configJson: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(PREF_CONFIG, configJson)
      .apply()
  }

  fun loadConfig(context: Context): BackgroundWakeWordConfig? {
    val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(PREF_CONFIG, null)
      ?: return null
    return parseConfig(raw)
  }

  private fun parseConfig(raw: String): BackgroundWakeWordConfig? {
    return try {
      val json = JSONObject(raw)
      val modelJson = json.optJSONObject("model")
      val centroid = jsonArrayToFloatArray(modelJson?.optJSONArray("centroid"))
      val samplesJson = modelJson?.optJSONArray("samples")
      val samples = mutableListOf<FloatArray>()
      if (samplesJson != null) {
        for (index in 0 until samplesJson.length()) {
          val sampleObject = samplesJson.optJSONObject(index) ?: continue
          val vector = jsonArrayToFloatArray(sampleObject.optJSONArray("vector"))
          if (vector.isNotEmpty()) {
            samples.add(vector)
          }
        }
      }
      val model = if (centroid.isNotEmpty() && samples.isNotEmpty()) {
        BackgroundWakeWordModel(
          displayName = modelJson?.optString("displayName") ?: json.optString("displayName", "Hey Agentrix"),
          centroid = centroid,
          samples = samples,
        )
      } else {
        null
      }
      BackgroundWakeWordConfig(
        enabled = json.optBoolean("enabled", false),
        displayName = json.optString("displayName", "Hey Agentrix"),
        threshold = json.optDouble("threshold", 0.74),
        activeInstanceId = json.optString("activeInstanceId").ifBlank { null },
        activeInstanceName = json.optString("activeInstanceName").ifBlank { null },
        model = model,
      )
    } catch (error: Exception) {
      Log.w(TAG, "Failed to parse background wake-word config", error)
      null
    }
  }

  private fun jsonArrayToFloatArray(array: JSONArray?): FloatArray {
    if (array == null) {
      return floatArrayOf()
    }
    val values = FloatArray(array.length())
    for (index in 0 until array.length()) {
      values[index] = array.optDouble(index, 0.0).toFloat()
    }
    return values
  }
}

private class ShortPcmBuffer(initialCapacity: Int = FRAME_LENGTH * 8) {
  private var buffer = ShortArray(initialCapacity)
  var size: Int = 0
    private set

  fun append(data: ShortArray, length: Int = data.size) {
    ensureCapacity(size + length)
    data.copyInto(buffer, destinationOffset = size, startIndex = 0, endIndex = length)
    size += length
  }

  fun append(data: ShortArray, start: Int, length: Int) {
    ensureCapacity(size + length)
    data.copyInto(buffer, destinationOffset = size, startIndex = start, endIndex = start + length)
    size += length
  }

  fun keepLast(maxSamples: Int) {
    if (size <= maxSamples) return
    val start = size - maxSamples
    buffer.copyInto(buffer, destinationOffset = 0, startIndex = start, endIndex = size)
    size = maxSamples
  }

  fun clear() {
    size = 0
  }

  fun toArray(): ShortArray = buffer.copyOf(size)

  private fun ensureCapacity(required: Int) {
    if (required <= buffer.size) return
    var nextSize = buffer.size
    while (nextSize < required) {
      nextSize *= 2
    }
    buffer = buffer.copyOf(nextSize)
  }
}

class AndroidBackgroundWakeWordService : Service() {
  private var windowManager: WindowManager? = null
  private var overlayView: View? = null
  private var audioRecord: AudioRecord? = null
  private var monitorThread: Thread? = null
  private var config: BackgroundWakeWordConfig? = null
  private val prebuffer = ShortPcmBuffer(PREBUFFER_SAMPLES)
  private val utterance = ShortPcmBuffer(SAMPLE_RATE * 2)
  private var speechActive = false
  private var silentFrames = 0
  private var lastTriggerAt = 0L
  @Volatile private var monitoring = false

  override fun onCreate() {
    super.onCreate()
    isRunning = true
    createNotificationChannel()
    startForegroundCompat()
    refreshConfigAndRuntime()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopSelfSafely()
        return START_NOT_STICKY
      }
      ACTION_REFRESH, ACTION_START, null -> {
        startForegroundCompat()
        refreshConfigAndRuntime()
      }
    }
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    monitoring = false
    monitorThread?.interrupt()
    monitorThread = null
    stopMonitoring()
    removeOverlay()
    isRunning = false
    super.onDestroy()
  }

  private fun refreshConfigAndRuntime() {
    config = BackgroundWakeWordPreferences.loadConfig(this)
    updateOverlay()

    val currentConfig = config
    if (
      currentConfig?.enabled == true &&
      currentConfig.model != null &&
      hasRecordPermission()
    ) {
      startMonitoring(currentConfig)
    } else {
      stopMonitoring()
    }
  }

  private fun hasRecordPermission(): Boolean {
    return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
  }

  private fun startForegroundCompat() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfoForegroundType.microphone)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(): Notification {
    val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse("agentrix://voice-chat")).apply {
      setClass(this@AndroidBackgroundWakeWordService, MainActivity::class.java)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val contentIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
      .setContentTitle(getString(R.string.background_wake_word_title))
      .setContentText(getString(R.string.background_wake_word_message))
      .setSmallIcon(R.drawable.notification_icon)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(contentIntent)
      .build()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val manager = getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID) != null) {
      return
    }
    manager.createNotificationChannel(
      NotificationChannel(
        NOTIFICATION_CHANNEL_ID,
        getString(R.string.background_wake_word_channel_name),
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = getString(R.string.background_wake_word_channel_description)
      },
    )
  }

  private fun updateOverlay() {
    if (!Settings.canDrawOverlays(this)) {
      removeOverlay()
      return
    }
    if (overlayView != null) {
      return
    }

    val manager = getSystemService(WINDOW_SERVICE) as? WindowManager ?: return
    val ballSize = (48 * resources.displayMetrics.density).toInt()
    val label = TextView(this).apply {
      text = "AX"
      textSize = 14f
      setTextColor(0xFFFFFFFF.toInt())
      gravity = Gravity.CENTER
      val bg = android.graphics.drawable.GradientDrawable(
        android.graphics.drawable.GradientDrawable.Orientation.TL_BR,
        intArrayOf(0xCC6C5CE7.toInt(), 0xCCa78bfa.toInt())
      )
      bg.cornerRadius = ballSize / 2f
      background = bg
      elevation = 18f
      width = ballSize
      height = ballSize
    }

    val params = WindowManager.LayoutParams(
      ballSize,
      ballSize,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.END
      x = 24
      y = 280
    }

    var initialX = 0
    var initialY = 0
    var touchX = 0f
    var touchY = 0f
    var moved = false

    var longPressHandler: android.os.Handler? = android.os.Handler(android.os.Looper.getMainLooper())
    var longPressRunnable: Runnable? = null

    label.setOnTouchListener { _, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          initialX = params.x
          initialY = params.y
          touchX = event.rawX
          touchY = event.rawY
          moved = false
          // Start long-press timer (800ms to exit)
          longPressRunnable = Runnable {
            if (!moved) {
              Log.i(TAG, "Long-press detected — stopping service and removing overlay")
              stopSelf()
            }
          }
          longPressHandler?.postDelayed(longPressRunnable!!, 800L)
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val deltaX = (touchX - event.rawX).toInt()
          val deltaY = (event.rawY - touchY).toInt()
          if (abs(deltaX) > 4 || abs(deltaY) > 4) {
            moved = true
            longPressRunnable?.let { longPressHandler?.removeCallbacks(it) }
          }
          params.x = initialX + deltaX
          params.y = initialY + deltaY
          manager.updateViewLayout(label, params)
          true
        }
        MotionEvent.ACTION_UP -> {
          longPressRunnable?.let { longPressHandler?.removeCallbacks(it) }
          if (!moved) {
            launchVoiceChat("overlay_tap")
          }
          true
        }
        else -> false
      }
    }

    manager.addView(label, params)
    windowManager = manager
    overlayView = label
  }

  private fun removeOverlay() {
    val manager = windowManager
    val view = overlayView
    if (manager != null && view != null) {
      runCatching { manager.removeView(view) }
    }
    overlayView = null
    windowManager = null
  }

  private fun startMonitoring(activeConfig: BackgroundWakeWordConfig) {
    if (monitoring) {
      return
    }

    val minBufferSize = AudioRecord.getMinBufferSize(
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
    )
    if (minBufferSize <= 0) {
      Log.w(TAG, "AudioRecord min buffer size invalid: $minBufferSize")
      return
    }

    val recorder = AudioRecord(
      MediaRecorder.AudioSource.MIC,
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      max(minBufferSize, FRAME_LENGTH * 8),
    )
    if (recorder.state != AudioRecord.STATE_INITIALIZED) {
      recorder.release()
      Log.w(TAG, "AudioRecord failed to initialize")
      return
    }

    audioRecord = recorder
    monitoring = true
    recorder.startRecording()
    monitorThread = Thread {
      val frame = ShortArray(FRAME_LENGTH)
      while (monitoring && !Thread.currentThread().isInterrupted) {
        val readCount = recorder.read(frame, 0, frame.size)
        if (readCount <= 0) {
          continue
        }
        processFrame(activeConfig, frame, readCount)
      }
    }.apply {
      name = "AgentrixBgWakeWord"
      start()
    }
  }

  private fun stopMonitoring() {
    monitoring = false
    monitorThread?.interrupt()
    monitorThread = null
    audioRecord?.runCatching {
      if (recordingState == AudioRecord.RECORDSTATE_RECORDING) {
        stop()
      }
      release()
    }
    audioRecord = null
    prebuffer.clear()
    utterance.clear()
    speechActive = false
    silentFrames = 0
  }

  private fun processFrame(activeConfig: BackgroundWakeWordConfig, frame: ShortArray, readCount: Int) {
    val frameSlice = if (readCount == frame.size) frame else frame.copyOf(readCount)
    val volume = calculateNormalizedVolume(frameSlice)

    if (!speechActive) {
      prebuffer.append(frameSlice, readCount)
      prebuffer.keepLast(PREBUFFER_SAMPLES)
      if (volume >= START_THRESHOLD) {
        speechActive = true
        utterance.clear()
        utterance.append(prebuffer.toArray())
        utterance.append(frameSlice, readCount)
        prebuffer.clear()
        silentFrames = 0
      }
      return
    }

    utterance.append(frameSlice, readCount)
    silentFrames = if (volume <= END_THRESHOLD) silentFrames + 1 else 0
    val durationMs = utterance.size * 1000.0 / SAMPLE_RATE
    if (silentFrames >= END_FRAME_COUNT || durationMs >= MAX_DURATION_MS) {
      flushUtterance(activeConfig)
    }
  }

  private fun flushUtterance(activeConfig: BackgroundWakeWordConfig) {
    val samples = utterance.toArray()
    utterance.clear()
    speechActive = false
    silentFrames = 0

    val durationMs = samples.size * 1000.0 / SAMPLE_RATE
    if (durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) {
      return
    }
    val model = activeConfig.model ?: return
    val vector = toFeatureVector(samples) ?: return
    val similarity = scoreWakeWordMatch(model, vector)
    if (similarity < activeConfig.threshold) {
      return
    }
    val now = System.currentTimeMillis()
    if (now - lastTriggerAt < COOLDOWN_MS) {
      return
    }
    lastTriggerAt = now
    launchVoiceChat("wake_match")
  }

  private fun launchVoiceChat(trigger: String) {
    val currentConfig = config
    val uri = Uri.parse("agentrix://voice-chat")
      .buildUpon()
      .apply {
        currentConfig?.activeInstanceId?.let { appendQueryParameter("instanceId", it) }
        currentConfig?.activeInstanceName?.let { appendQueryParameter("instanceName", it) }
        appendQueryParameter("trigger", trigger)
      }
      .build()

    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
      setClass(this@AndroidBackgroundWakeWordService, MainActivity::class.java)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    startActivity(intent)
  }

  private fun stopSelfSafely() {
      stopForegroundCompat(removeNotification = true)
    stopSelf()
  }

    private fun stopForegroundCompat(removeNotification: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      super.stopForeground(if (removeNotification) STOP_FOREGROUND_REMOVE else STOP_FOREGROUND_DETACH)
    } else {
      @Suppress("DEPRECATION")
      super.stopForeground(removeNotification)
    }
  }

  companion object {
    @Volatile var isRunning: Boolean = false
      private set

    fun enqueueStart(context: Context) {
      val intent = Intent(context, AndroidBackgroundWakeWordService::class.java).apply {
        action = ACTION_START
      }
      ContextCompat.startForegroundService(context, intent)
    }

    fun enqueueRefresh(context: Context) {
      val intent = Intent(context, AndroidBackgroundWakeWordService::class.java).apply {
        action = ACTION_REFRESH
      }
      ContextCompat.startForegroundService(context, intent)
    }

    fun enqueueStop(context: Context) {
      val intent = Intent(context, AndroidBackgroundWakeWordService::class.java).apply {
        action = ACTION_STOP
      }
      context.startService(intent)
    }
  }
}

private object ServiceInfoForegroundType {
  val microphone: Int
    get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    } else {
      0
    }
}

private fun calculateNormalizedVolume(frame: ShortArray): Double {
  if (frame.isEmpty()) return 0.0
  var sumSquares = 0.0
  for (sample in frame) {
    val sampleValue = sample.toDouble()
    sumSquares += sampleValue * sampleValue
  }
  val rms = sqrt(sumSquares / frame.size) / 32767.0
  if (!rms.isFinite() || rms <= 0.0) {
    return 0.0
  }
  val dbfs = 20.0 * log10(max(rms, 1e-9))
  return min(1.0, max(0.0, (dbfs + 60.0) / 60.0))
}

private fun toFeatureVector(int16Samples: ShortArray): FloatArray? {
  val trimmed = trimSilence(int16Samples)
  val durationMs = trimmed.size * 1000.0 / SAMPLE_RATE
  if (trimmed.size < SAMPLE_RATE * 0.2 || durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) {
    return null
  }

  var peak = 0
  for (sample in trimmed) {
    peak = max(peak, abs(sample.toInt()))
  }
  if (peak <= 0) {
    return null
  }

  val normalized = FloatArray(trimmed.size)
  for (index in trimmed.indices) {
    normalized[index] = trimmed[index] / peak.toFloat()
  }

  val segmentCount = 24
  val vector = ArrayList<Float>(segmentCount * 6)
  for (segmentIndex in 0 until segmentCount) {
    val start = (segmentIndex.toDouble() / segmentCount * normalized.size).toInt()
    val end = max(start + 1, (((segmentIndex + 1).toDouble() / segmentCount) * normalized.size).toInt())
    val boundedEnd = min(end, normalized.size)
    val segment = normalized.copyOfRange(start, boundedEnd)

    val rms = calculateNormalizedVolume(segment.map { (it * 32767f).toInt().toShort() }.toShortArray()).toFloat()
    val zcr = zeroCrossingRate(segment)
    val derivative = meanAbsoluteDifference(segment)
    val lowEnergy = ln(1.0 + goertzelEnergy(segment, SAMPLE_RATE, 350.0)).toFloat()
    val midEnergy = ln(1.0 + goertzelEnergy(segment, SAMPLE_RATE, 900.0)).toFloat()
    val highEnergy = ln(1.0 + goertzelEnergy(segment, SAMPLE_RATE, 1800.0)).toFloat()

    vector.add(rms)
    vector.add(zcr)
    vector.add(derivative)
    vector.add(lowEnergy)
    vector.add(midEnergy)
    vector.add(highEnergy)
  }

  return normalizeVector(vector.toFloatArray())
}

private fun trimSilence(samples: ShortArray): ShortArray {
  val frameSize = 160
  val threshold = 0.04
  var start = 0
  var end = samples.size

  while (start + frameSize < samples.size) {
    if (calculateNormalizedVolume(samples.copyOfRange(start, start + frameSize)) > threshold) {
      break
    }
    start += frameSize
  }

  while (end - frameSize > start) {
    if (calculateNormalizedVolume(samples.copyOfRange(end - frameSize, end)) > threshold) {
      break
    }
    end -= frameSize
  }

  return samples.copyOfRange(start, end)
}

private fun meanAbsoluteDifference(samples: FloatArray): Float {
  if (samples.size <= 1) return 0f
  var total = 0.0
  for (index in 1 until samples.size) {
    total += abs(samples[index] - samples[index - 1])
  }
  return (total / (samples.size - 1)).toFloat()
}

private fun zeroCrossingRate(samples: FloatArray): Float {
  if (samples.size <= 1) return 0f
  var crossings = 0
  for (index in 1 until samples.size) {
    val previous = samples[index - 1]
    val current = samples[index]
    if ((previous >= 0f && current < 0f) || (previous < 0f && current >= 0f)) {
      crossings += 1
    }
  }
  return crossings.toFloat() / (samples.size - 1)
}

private fun goertzelEnergy(samples: FloatArray, sampleRate: Int, frequency: Double): Double {
  if (samples.isEmpty()) return 0.0
  val omega = 2.0 * PI * frequency / sampleRate
  val coefficient = 2.0 * cos(omega)
  var q0 = 0.0
  var q1 = 0.0
  var q2 = 0.0
  for (sample in samples) {
    q0 = coefficient * q1 - q2 + sample
    q2 = q1
    q1 = q0
  }
  val energy = q1.pow(2) + q2.pow(2) - coefficient * q1 * q2
  return max(0.0, energy / samples.size)
}

private fun normalizeVector(vector: FloatArray): FloatArray {
  var norm = 0.0
  for (value in vector) {
    norm += value * value
  }
  norm = sqrt(norm)
  if (!norm.isFinite() || norm <= 1e-8) {
    return FloatArray(vector.size)
  }
  return FloatArray(vector.size) { index -> (vector[index] / norm).toFloat() }
}

private fun cosineSimilarity(left: FloatArray, right: FloatArray): Double {
  if (left.isEmpty() || right.isEmpty() || left.size != right.size) {
    return 0.0
  }
  var dot = 0.0
  var leftNorm = 0.0
  var rightNorm = 0.0
  for (index in left.indices) {
    val leftValue = left[index].toDouble()
    val rightValue = right[index].toDouble()
    dot += leftValue * rightValue
    leftNorm += leftValue * leftValue
    rightNorm += rightValue * rightValue
  }
  if (leftNorm <= 1e-8 || rightNorm <= 1e-8) {
    return 0.0
  }
  return dot / sqrt(leftNorm * rightNorm)
}

private fun scoreWakeWordMatch(model: BackgroundWakeWordModel, vector: FloatArray): Double {
  val bestSample = model.samples.maxOfOrNull { cosineSimilarity(vector, it) } ?: 0.0
  val centroidScore = cosineSimilarity(vector, model.centroid)
  return bestSample * 0.65 + centroidScore * 0.35
}