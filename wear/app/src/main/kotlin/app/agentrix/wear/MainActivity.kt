package app.agentrix.wear

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.TimeText
import app.agentrix.wear.approval.ApprovalScreen
import app.agentrix.wear.approval.ApprovalViewModel
import app.agentrix.wear.core.ApiClient
import app.agentrix.wear.ui.GlanceScreen
import app.agentrix.wear.ui.GlanceViewModel
import app.agentrix.wear.ui.QuickAskScreen
import app.agentrix.wear.ui.QuickAskState
import kotlinx.coroutines.launch

/**
 * Host activity for the 4 thin-shell surfaces, swipeable via a pager:
 *   page 0 → 一瞥 (Glance)   page 1 → 审批 (Approvals)   page 2 → 抬腕一句话 (Quick Ask)
 *
 * Speech capture uses the SYSTEM RecognizerIntent (no bundled ASR — keeps APK small).
 * Health opt-in is requested lazily and gated behind perceptionEnabled (default OFF).
 */
class MainActivity : ComponentActivity() {

    private val glanceVm: GlanceViewModel by viewModels()
    private val approvalVm: ApprovalViewModel by viewModels()

    private var quickAskState by mutableStateOf<QuickAskState>(QuickAskState.Idle)

    private val speechLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val spoken = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
                ?.trim()
            if (spoken.isNullOrEmpty()) {
                quickAskState = QuickAskState.Error("没听清，请重试")
            } else {
                runQuickAsk(spoken)
            }
        } else {
            quickAskState = QuickAskState.Idle
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        glanceVm.bootstrap()
        approvalVm.start()

        setContent {
            MaterialTheme {
                val pagerState = rememberPagerState(pageCount = { 3 })
                val scope = rememberCoroutineScope()
                Scaffold(timeText = { TimeText() }) {
                    HorizontalPager(state = pagerState, modifier = Modifier) { page ->
                        when (page) {
                            0 -> GlanceScreen(
                                vm = glanceVm,
                                onQuickAsk = { scope.launch { pagerState.animateScrollToPage(2) } },
                                onApprovals = { scope.launch { pagerState.animateScrollToPage(1) } },
                            )
                            1 -> ApprovalScreen(vm = approvalVm)
                            2 -> QuickAskScreen(state = quickAskState, onListen = ::launchSpeech)
                        }
                    }
                }
            }
        }
    }

    private fun launchSpeech() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PROMPT, "说出你的需求")
        }
        runCatching { speechLauncher.launch(intent) }
            .onFailure { quickAskState = QuickAskState.Error("此设备不支持语音输入") }
    }

    private fun runQuickAsk(text: String) {
        quickAskState = QuickAskState.Working
        lifecycleScope.launch {
            when (val r = AgentrixWearApp.instance.api.quickAsk(text)) {
                is ApiClient.Result.Ok ->
                    quickAskState = QuickAskState.Result(text, r.value.ifBlank { "已处理" })
                is ApiClient.Result.Unauthorized -> {
                    AgentrixWearApp.instance.authBridge.requestAuthState()
                    quickAskState = QuickAskState.Error("请先在手机上登录")
                }
                is ApiClient.Result.Unavailable ->
                    quickAskState = QuickAskState.Error("功能未开启")
                is ApiClient.Result.Error ->
                    quickAskState = QuickAskState.Error("网络失败，请重试")
            }
        }
    }
}
