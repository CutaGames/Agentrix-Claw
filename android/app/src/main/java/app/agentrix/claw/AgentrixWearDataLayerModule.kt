package app.agentrix.claw

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

class AgentrixWearDataLayerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext),
  MessageClient.OnMessageReceivedListener,
  DataClient.OnDataChangedListener {

  private var isListening = false

  override fun getName(): String = "AgentrixWearDataLayer"

  @ReactMethod
  fun startListening(promise: Promise) {
    try {
      if (!isListening) {
        Wearable.getMessageClient(reactContext).addListener(this)
        Wearable.getDataClient(reactContext).addListener(this)
        isListening = true
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("wear_start_listening_failed", error)
    }
  }

  @ReactMethod
  fun stopListening(promise: Promise) {
    try {
      stopNativeListeners()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("wear_stop_listening_failed", error)
    }
  }

  @ReactMethod
  fun getConnectedNodes(promise: Promise) {
    Wearable.getNodeClient(reactContext).connectedNodes
      .addOnSuccessListener { nodes ->
        val result = WritableNativeArray()
        nodes.forEach { node ->
          val map = WritableNativeMap()
          map.putString("id", node.id)
          map.putString("displayName", node.displayName)
          map.putBoolean("isNearby", node.isNearby)
          result.pushMap(map)
        }
        promise.resolve(result)
      }
      .addOnFailureListener { error ->
        promise.reject("wear_get_nodes_failed", error)
      }
  }

  @ReactMethod
  fun sendMessage(nodeId: String, path: String, data: String, promise: Promise) {
    if (!path.startsWith("/")) {
      promise.reject("wear_invalid_path", "Wear Data Layer path must start with /")
      return
    }

    Wearable.getMessageClient(reactContext)
      .sendMessage(nodeId, path, data.toByteArray(Charsets.UTF_8))
      .addOnSuccessListener { promise.resolve(true) }
      .addOnFailureListener { error -> promise.reject("wear_send_message_failed", error) }
  }

  @ReactMethod
  fun putDataItem(path: String, data: String, promise: Promise) {
    if (!path.startsWith("/")) {
      promise.reject("wear_invalid_path", "Wear Data Layer path must start with /")
      return
    }

    try {
      val request = PutDataMapRequest.create(path).apply {
        dataMap.putString("json", data)
        dataMap.putLong("updatedAt", System.currentTimeMillis())
      }.asPutDataRequest().setUrgent()

      Wearable.getDataClient(reactContext)
        .putDataItem(request)
        .addOnSuccessListener { promise.resolve(true) }
        .addOnFailureListener { error -> promise.reject("wear_put_data_item_failed", error) }
    } catch (error: Exception) {
      promise.reject("wear_put_data_item_failed", error)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by React Native NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by React Native NativeEventEmitter.
  }

  override fun onMessageReceived(event: MessageEvent) {
    val payload = event.data?.toString(Charsets.UTF_8) ?: "{}"
    emitWearMessage(event.path, payload, event.sourceNodeId)
  }

  override fun onDataChanged(dataEvents: DataEventBuffer) {
    try {
      dataEvents.forEach { event ->
        if (event.type != DataEvent.TYPE_CHANGED) return@forEach
        val path = event.dataItem.uri.path ?: return@forEach
        val payload = try {
          DataMapItem.fromDataItem(event.dataItem).dataMap.getString("json") ?: "{}"
        } catch (_: Exception) {
          "{}"
        }
        emitWearMessage(path, payload, null)
      }
    } finally {
      dataEvents.release()
    }
  }

  override fun invalidate() {
    stopNativeListeners()
    super.invalidate()
  }

  private fun stopNativeListeners() {
    if (!isListening) return
    Wearable.getMessageClient(reactContext).removeListener(this)
    Wearable.getDataClient(reactContext).removeListener(this)
    isListening = false
  }

  private fun emitWearMessage(path: String, data: String, sourceNodeId: String?) {
    if (!reactContext.hasActiveReactInstance()) return
    val event = WritableNativeMap().apply {
      putString("path", path)
      putString("data", data)
      if (sourceNodeId != null) putString("nodeId", sourceNodeId)
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("onWearMessage", event)
  }
}