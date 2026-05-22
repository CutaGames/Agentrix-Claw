/**
 * ReconstructionProgressScreen — Sprint P-8 (2026-05-22).
 *
 * Polls a backend reconstruction job after the scanner submits frames
 * and shows the user a progress indicator until the 3D asset is ready.
 * On completion, deep-links to the inventory; on failure, surfaces a
 * retry button.
 *
 * Backend contract:
 *   GET /v1/world-engine/jobs/:jobId/status
 *     → { jobId, status: 'queued'|'reconstructing'|'styling'|'character_gen'|'completed'|'failed',
 *         progress: 0-100, stage?, estimatedSecondsRemaining?, resultAssetId?, error? }
 *
 * Receives via navigation params:
 *   { jobId: string, estimatedSeconds?: number, scanMode?: 'quick'|'detail'|'room' }
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import {
  getJobStatus,
  generateDungeon,
  type ReconstructionJobStatus,
} from '../services/worldEngineApi';

interface RouteParams {
  jobId: string;
  estimatedSeconds?: number;
  scanMode?: 'quick' | 'detail' | 'room';
  /** When scanMode === 'room', the screen auto-calls /dungeons/generate
   *  on completion using this sessionId. */
  scanSessionId?: string;
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 4 * 60 * 1000; // 4 min hard cap

const STAGE_LABEL_ZH: Record<ReconstructionJobStatus, string> = {
  queued: '排队中…',
  reconstructing: '正在重建 3D 网格…',
  styling: '正在套用风格化材质…',
  character_gen: '正在生成角色档案…',
  completed: '完成',
  failed: '失败',
};

export default function ReconstructionProgressScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ p: RouteParams }, 'p'>>();
  const { jobId, estimatedSeconds = 30, scanMode, scanSessionId } = route.params ?? ({} as RouteParams);

  const [status, setStatus] = useState<ReconstructionJobStatus>('queued');
  const [progress, setProgress] = useState(0);
  const [stageLabel, setStageLabel] = useState<string>('排队中…');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultAssetId, setResultAssetId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(estimatedSeconds);
  // Sprint P-8 P2: auto-generated dungeon code (room scan path).
  const [dungeonCode, setDungeonCode] = useState<string | null>(null);
  const [dungeonGenerating, setDungeonGenerating] = useState(false);

  const startTsRef = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const pollOnce = useCallback(async () => {
    try {
      const result = await getJobStatus(jobId);
      setStatus(result.status);
      setProgress(Math.max(0, Math.min(100, result.progress ?? 0)));
      setStageLabel(result.stage || STAGE_LABEL_ZH[result.status] || '处理中…');
      if (typeof result.estimatedSecondsRemaining === 'number') {
        setSecondsLeft(result.estimatedSecondsRemaining);
      }
      if (result.status === 'completed' && result.resultAssetId) {
        setResultAssetId(result.resultAssetId);
        stopPolling();
        // Sprint P-8 P2 (2026-05-22): auto-generate a dungeon if the
        // scan was a room scan. We don't block the success state on
        // this — the user sees "completed" immediately, and the
        // dungeon code shows up below the action button when ready.
        if (scanMode === 'room' && scanSessionId && !dungeonGenerating && !dungeonCode) {
          setDungeonGenerating(true);
          try {
            const dungeon = await generateDungeon({ scanSessionId });
            setDungeonCode(dungeon.shareCode);
          } catch (genErr: any) {
            console.warn('[ReconstructionProgress] dungeon auto-gen failed:', genErr);
          } finally {
            setDungeonGenerating(false);
          }
        }
      } else if (result.status === 'failed') {
        setErrorMessage(result.error || '生成失败,未知错误');
        stopPolling();
      }
    } catch (err: unknown) {
      // Network blip — keep polling, don't kill the screen.
      console.warn('[ReconstructionProgress] poll error:', err);
    }
  }, [jobId, stopPolling, scanMode, scanSessionId, dungeonGenerating, dungeonCode]);

  useEffect(() => {
    if (!jobId) {
      setErrorMessage('缺少 jobId,无法跟踪生成进度');
      return;
    }
    // Kick off immediately, then poll every 3s.
    void pollOnce();
    intervalRef.current = setInterval(() => {
      // Hard timeout
      if (Date.now() - startTsRef.current > POLL_TIMEOUT_MS) {
        stopPolling();
        setErrorMessage('生成超时(4 分钟),请稍后到资产库查看是否完成,或重试');
        return;
      }
      void pollOnce();
    }, POLL_INTERVAL_MS);
    return stopPolling;
  }, [jobId, pollOnce, stopPolling]);

  const handleViewInventory = useCallback(() => {
    // Reset to inventory so back button doesn't bring user back to spinner.
    navigation.reset({
      index: 0,
      routes: [{ name: 'WorldAssetInventory' }],
    });
  }, [navigation]);

  const handleRetry = useCallback(() => {
    // Pop back to the scanner so user can retry.
    navigation.goBack();
  }, [navigation]);

  // ── Render ──
  if (errorMessage) {
    return (
      <View style={styles.container} testID="reconstruction-error">
        <Text style={styles.icon}>❌</Text>
        <Text style={styles.title}>生成失败</Text>
        <Text style={styles.subtitle}>{errorMessage}</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleViewInventory}>
            <Text style={styles.secondaryButtonText}>查看资产库</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
            <Text style={styles.primaryButtonText}>重试</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (status === 'completed') {
    return (
      <View style={styles.container} testID="reconstruction-complete">
        <Text style={styles.icon}>🎉</Text>
        <Text style={styles.title}>生成完成</Text>
        <Text style={styles.subtitle}>
          你的世界资产已就绪{resultAssetId ? `,ID ${resultAssetId.slice(0, 8)}…` : ''}
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handleViewInventory} testID="reconstruction-view-inventory">
          <Text style={styles.primaryButtonText}>📦 打开资产库</Text>
        </TouchableOpacity>

        {/* Sprint P-8 P2: auto-dungeon flow visible only for room scans. */}
        {scanMode === 'room' && (
          <View style={styles.dungeonBox}>
            {dungeonGenerating ? (
              <>
                <ActivityIndicator size="small" color="#22c55e" />
                <Text style={styles.dungeonHint}>正在用扫描数据生成副本…</Text>
              </>
            ) : dungeonCode ? (
              <>
                <Text style={styles.dungeonLabel}>🏰 副本已生成</Text>
                <Text style={styles.dungeonCode} testID="reconstruction-dungeon-code">{dungeonCode}</Text>
                <Text style={styles.dungeonHint}>分享这个代码给好友来挑战你的副本</Text>
                <TouchableOpacity
                  style={styles.dungeonButton}
                  onPress={() =>
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'WorldDungeonExplorer', params: { shareCode: dungeonCode } }],
                    })
                  }
                  testID="reconstruction-open-dungeon"
                >
                  <Text style={styles.dungeonButtonText}>进入副本 →</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container} testID="reconstruction-progress">
      <ActivityIndicator size="large" color="#6c5ce7" />
      <Text style={styles.title}>正在生成你的世界资产</Text>
      <Text style={styles.subtitle}>{stageLabel}</Text>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.progressLabel}>
        {progress}% · 预计剩余 {Math.max(0, Math.round(secondsLeft))} 秒
      </Text>

      <Text style={styles.hint}>
        生成期间你可以离开此页面,完成后会推送通知。
      </Text>
      <TouchableOpacity style={styles.secondaryButton} onPress={handleViewInventory}>
        <Text style={styles.secondaryButtonText}>稍后查看</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 80 : 50,
    alignItems: 'center',
  },
  icon: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6c5ce7',
  },
  progressLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 10,
  },
  hint: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
  },
  primaryButton: {
    marginTop: 24,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#6c5ce7',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#222',
  },
  secondaryButtonText: {
    color: '#aaa',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  // Sprint P-8 P2: dungeon auto-trigger UI on room-scan completion.
  dungeonBox: {
    marginTop: 32,
    width: '100%',
    backgroundColor: '#0f1610',
    borderColor: '#22c55e44',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  dungeonLabel: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  dungeonCode: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    marginVertical: 6,
  },
  dungeonHint: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  dungeonButton: {
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#22c55e22',
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  dungeonButtonText: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '600',
  },
});
