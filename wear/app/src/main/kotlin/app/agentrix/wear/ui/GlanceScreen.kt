package app.agentrix.wear.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import app.agentrix.wear.core.AuthBridge

/**
 * 一瞥主屏 (Glance) — thin-shell home:
 *   • 在场 (online/offline) + persona name
 *   • 今日收益一瞥：AXP 与 稳定币 分列（诚实，不混算、不做投资承诺）
 *   • 未读 / 待审批 数
 *   • 抬腕一句话 / 审批 入口
 *
 * Unauthenticated → explicit "open Agentrix on phone" prompt (no silent 401 loop).
 */
@Composable
fun GlanceScreen(
    vm: GlanceViewModel,
    onQuickAsk: () -> Unit,
    onApprovals: () -> Unit,
) {
    val ui by vm.ui.collectAsStateWithLifecycle()

    when (ui.auth) {
        AuthBridge.AuthState.NeedsLogin -> AuthNeededScreen()
        AuthBridge.AuthState.Requesting -> LoadingScreen()
        AuthBridge.AuthState.Authenticated -> {
            if (ui.loading && ui.session == null) {
                LoadingScreen()
            } else {
                GlanceContent(ui, onQuickAsk, onApprovals)
            }
        }
    }
}

@Composable
private fun GlanceContent(
    ui: GlanceViewModel.UiState,
    onQuickAsk: () -> Unit,
    onApprovals: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        val name = ui.session?.persona?.name ?: "Agent"
        val online = ui.session?.presence?.shells?.any { it.active } ?: !ui.offline
        Text(
            text = if (online) "● $name 在线" else "○ $name 离线",
            style = MaterialTheme.typography.title3,
            color = if (online) MaterialTheme.colors.primary else MaterialTheme.colors.onSurfaceVariant,
        )

        // 收益分列（AXP / 稳定币）
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            EarningPill("AXP", formatNum(ui.earnings.axp))
            val stable = ui.earnings.stableByCurrency.entries.firstOrNull { it.value > 0.0 }
            EarningPill(stable?.key ?: "USDC", formatNum(stable?.value ?: 0.0))
        }

        Text(
            text = "未读 ${ui.earnings.unread} · 待审批 ${ui.approvals.size.coerceAtLeast(ui.earnings.pendingApprovals)}",
            style = MaterialTheme.typography.caption2,
            color = MaterialTheme.colors.onSurfaceVariant,
        )

        Spacer(Modifier.height(2.dp))

        Chip(
            modifier = Modifier.fillMaxWidth(),
            onClick = onApprovals,
            colors = ChipDefaults.primaryChipColors(),
            label = { Text("审批 (${ui.approvals.size})") },
        )
        Chip(
            modifier = Modifier.fillMaxWidth(),
            onClick = onQuickAsk,
            colors = ChipDefaults.secondaryChipColors(),
            label = { Text("抬腕一句话") },
        )
        if (ui.offline) {
            Text("离线 · 显示最近缓存", style = MaterialTheme.typography.caption3,
                color = MaterialTheme.colors.error)
        }
    }
}

@Composable
private fun EarningPill(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.title3)
        Text(label, style = MaterialTheme.typography.caption3,
            color = MaterialTheme.colors.onSurfaceVariant)
    }
}

@Composable
private fun LoadingScreen() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { CircularProgressIndicator() }
}

@Composable
private fun AuthNeededScreen() {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("需要登录", style = MaterialTheme.typography.title3,
            textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(
            "请在手机上打开 Agentrix 登录，手表将自动同步。",
            style = MaterialTheme.typography.caption2,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colors.onSurfaceVariant,
        )
    }
}

private fun formatNum(v: Double): String =
    if (v == v.toLong().toDouble()) v.toLong().toString() else String.format("%.2f", v)
