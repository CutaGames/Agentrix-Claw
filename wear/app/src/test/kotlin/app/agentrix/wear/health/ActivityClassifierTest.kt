package app.agentrix.wear.health

import org.junit.Assert.assertEquals
import org.junit.Test

/** Unit tests for the pure semantic classifier (JVM, no Android runtime needed). */
class ActivityClassifierTest {

    @Test
    fun lowHeartRate_isResting() {
        assertEquals("resting", ActivityClassifier.classify(hr = 48.0, dailySteps = 5000.0))
    }

    @Test
    fun highHeartRate_isActive() {
        assertEquals("active", ActivityClassifier.classify(hr = 130.0, dailySteps = 100.0))
    }

    @Test
    fun fewSteps_isSedentary() {
        assertEquals("sedentary", ActivityClassifier.classify(hr = 70.0, dailySteps = 50.0))
    }

    @Test
    fun default_isFocused() {
        assertEquals("focused", ActivityClassifier.classify(hr = 72.0, dailySteps = 3000.0))
    }

    @Test
    fun nullInputs_default_isFocused() {
        assertEquals("focused", ActivityClassifier.classify(hr = null, dailySteps = null))
    }
}
