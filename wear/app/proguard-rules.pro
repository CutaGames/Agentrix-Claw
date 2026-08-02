# Agentrix Wear — R8/ProGuard rules. Goal: aggressive shrink (size <30MB hard cap)
# while keeping serialization + Wear surface entry points intact.

# --- kotlinx.serialization ---
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
# Keep @Serializable classes' synthetic Companion + serializer()
-keepclassmembers class app.agentrix.wear.** {
    *** Companion;
}
-keepclasseswithmembers class app.agentrix.wear.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class app.agentrix.wear.**$$serializer { *; }

# --- Ktor / OkHttp ---
-dontwarn org.slf4j.**
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**

# --- Wear entry points (instantiated by the framework, not by our code) ---
-keep class app.agentrix.wear.MainActivity { *; }
-keep class app.agentrix.wear.tile.AgentrixTileService { *; }
-keep class app.agentrix.wear.tile.AgentrixComplicationService { *; }
-keep class app.agentrix.wear.core.AgentrixWearableListenerService { *; }
-keep class app.agentrix.wear.AgentrixWearApp { *; }

# --- AndroidX Security (Tink) ---
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**

# Coroutines
-dontwarn kotlinx.coroutines.**
