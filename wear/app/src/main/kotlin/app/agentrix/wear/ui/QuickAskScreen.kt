package app.agentrix.wear.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text

/**
 * 抬腕一句话 (Quick Ask) — one utterance → execute → ≤1-2 line result + haptic.
 * Deep conversation is delegated to the phone (thin shell does NOT host a full chat thread).
 *
 * The actual speech capture is launched from MainActivity via the system
 * RecognizerIntent (no bundled ASR → keeps APK small). This composable renders the states.
 */
@Composable
fun QuickAskScreen(
    state: QuickAskState,
    onListen: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        when (state) {
            is QuickAskState.Idle -> {
                Text("抬腕一句话", style = MaterialTheme.typography.title3)
                Text("说出你的需求", style = MaterialTheme.typography.caption2,
                    color = MaterialTheme.colors.onSurfaceVariant, textAlign = TextAlign.Center)
                Chip(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    onClick = onListen,
                    colors = ChipDefaults.primaryChipColors(),
                    label = { Text("🎤 说话") },
                )
            }
            is QuickAskState.Working ->
                CircularProgressIndicator()
            is QuickAskState.Result -> {
                Text(state.query, style = MaterialTheme.typography.caption3,
                    color = MaterialTheme.colors.onSurfaceVariant, textAlign = TextAlign.Center)
                Text(state.answer, style = MaterialTheme.typography.body2,
                    textAlign = TextAlign.Center)
                Text("深入对话请在手机上继续", style = MaterialTheme.typography.caption3,
                    color = MaterialTheme.colors.onSurfaceVariant, textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 6.dp))
                Chip(
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                    onClick = onListen,
                    colors = ChipDefaults.secondaryChipColors(),
                    label = { Text("再问一句") },
                )
            }
            is QuickAskState.Error -> {
                Text(state.message, style = MaterialTheme.typography.body2,
                    color = MaterialTheme.colors.error, textAlign = TextAlign.Center)
                Chip(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    onClick = onListen,
                    colors = ChipDefaults.secondaryChipColors(),
                    label = { Text("重试") },
                )
            }
        }
    }
}

sealed class QuickAskState {
    object Idle : QuickAskState()
    object Working : QuickAskState()
    data class Result(val query: String, val answer: String) : QuickAskState()
    data class Error(val message: String) : QuickAskState()
}
