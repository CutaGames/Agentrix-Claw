package app.agentrix.wear.approval

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Card
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import app.agentrix.wear.core.PendingApproval

/**
 * 腕上审批 (护城河① 主权). Shows action / amount+currency / counterparty / risk and lets
 * the owner approve or reject. The final gate STILL lives in S1/S3/SettlementCore — the
 * watch only relays the decision. Network failure/timeout = NOT approved (fail-closed),
 * surfaced by ApprovalViewModel.
 */
@Composable
fun ApprovalScreen(vm: ApprovalViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()

    if (state.items.isEmpty()) {
        Column(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("暂无待审批", style = MaterialTheme.typography.title3)
            state.lastError?.let {
                Text(it, style = MaterialTheme.typography.caption3,
                    color = MaterialTheme.colors.error, textAlign = TextAlign.Center)
            }
        }
        return
    }

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        items(state.items, key = { it.id }) { item ->
            ApprovalCard(
                item = item,
                busy = state.processingId == item.id,
                onApprove = { vm.decide(item.id, true) },
                onReject = { vm.decide(item.id, false) },
            )
        }
    }
}

@Composable
private fun ApprovalCard(
    item: PendingApproval,
    busy: Boolean,
    onApprove: () -> Unit,
    onReject: () -> Unit,
) {
    Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(4.dp)) {
            Text(item.kind, style = MaterialTheme.typography.button)
            item.amount?.let {
                Text("${formatNum(it.value)} ${it.currency}",
                    style = MaterialTheme.typography.title3,
                    color = MaterialTheme.colors.primary)
            }
            val meta = buildString {
                item.counterpartyClass?.let { append(it); append(" · ") }
                append("风险 ")
                append(riskLabel(item.risk))
            }
            Text(meta, style = MaterialTheme.typography.caption2,
                color = riskColor(item.risk))
            if (item.description.isNotBlank()) {
                Text(item.description, style = MaterialTheme.typography.caption3,
                    color = MaterialTheme.colors.onSurfaceVariant)
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Chip(
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                    onClick = onReject,
                    colors = ChipDefaults.secondaryChipColors(),
                    label = { Text("拒绝") },
                )
                Chip(
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                    onClick = onApprove,
                    colors = ChipDefaults.primaryChipColors(),
                    label = { Text(if (busy) "…" else "批准") },
                )
            }
        }
    }
}

@Composable
private fun riskColor(risk: String) = when (risk.lowercase()) {
    "high" -> MaterialTheme.colors.error
    "medium" -> MaterialTheme.colors.secondary
    else -> MaterialTheme.colors.onSurfaceVariant
}

private fun riskLabel(risk: String) = when (risk.lowercase()) {
    "high" -> "高"
    "medium" -> "中"
    else -> "低"
}

private fun formatNum(v: Double): String =
    if (v == v.toLong().toDouble()) v.toLong().toString() else String.format("%.2f", v)
