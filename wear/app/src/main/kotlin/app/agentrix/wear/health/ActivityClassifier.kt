package app.agentrix.wear.health

/**
 * Pure, side-effect-free mapping from (heart rate, daily steps) → a COARSE semantic
 * activity class. Extracted from HealthMonitor so it is unit-testable on the JVM without
 * the Android/Health-Services runtime.
 *
 * Red line: only coarse buckets leave the device — raw HR/steps are never uploaded.
 */
object ActivityClassifier {
    fun classify(hr: Double?, dailySteps: Double?): String = when {
        hr != null && hr > 0 && hr < 55 -> "resting"
        hr != null && hr >= 110 -> "active"
        dailySteps != null && dailySteps < 200 -> "sedentary"
        else -> "focused"
    }
}
