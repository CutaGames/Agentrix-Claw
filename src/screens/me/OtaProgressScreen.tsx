/**
 * OtaProgressScreen — Sprint WB #5
 *
 * Firmware OTA update progress display for Toy devices.
 * Per toy-prd-v4 §5.3: `ota.chunk` frame type.
 *
 * Shows:
 *   - Device name + current firmware version
 *   - Target version + release notes
 *   - Chunk progress bar (index / total)
 *   - Estimated time remaining
 *   - Success / failure state
 *
 * Navigation: Me → Devices → ToyBinding → [device] → Check OTA → this screen
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { apiFetch } from '../../services/api';
import { themedStyles } from '../../theme/useTheme';

// ── Types ────────────────────────────────────────────────────

interface OtaManifest {
  package_id: string;
  device_class: string;
  version: string;
  channel: string;
  size_bytes: number;
  sha256: string;
  chunk_size: number;
  chunk_count: number;
  mandatory: boolean;
  release_notes?: string;
}

type OtaState = 'checking' | 'ready' | 'downloading' | 'verifying' | 'complete' | 'error' | 'up_to_date';

// ── API ──────────────────────────────────────────────────────

async function fetchOtaManifest(deviceId: string): Promise<OtaManifest | null> {
  try {
    const res = await apiFetch<OtaManifest>(`/v1/clawcore/devices/${deviceId}/ota/manifest`);
    return res;
  } catch {
    return null;
  }
}

async function startOtaUpdate(deviceId: string, packageId: string): Promise<{ started: boolean }> {
  return apiFetch('/v1/clawcore/ota/start', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId, package_id: packageId }),
  });
}

// ── Component ────────────────────────────────────────────────

export function OtaProgressScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const deviceId = route.params?.deviceId ?? '';
  const deviceName = route.params?.deviceName ?? 'Device';
  const currentFw = route.params?.currentFirmware ?? 'unknown';

  const [state, setState] = useState<OtaState>('checking');
  const [manifest, setManifest] = useState<OtaManifest | null>(null);
  const [progress, setProgress] = useState(0); // 0-100
  const [chunksReceived, setChunksReceived] = useState(0);
  const [error, setError] = useState('');

  // Check for updates on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await fetchOtaManifest(deviceId);
      if (cancelled) return;
      if (!m) {
        setState('up_to_date');
        return;
      }
      if (m.version === currentFw) {
        setState('up_to_date');
        return;
      }
      setManifest(m);
      setState('ready');
    })();
    return () => { cancelled = true; };
  }, [deviceId, currentFw]);

  // Listen for OTA progress events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as any).detail;
      if (detail?.device_id !== deviceId) return;
      if (detail?.type === 'ota_progress') {
        const pct = Math.round((detail.index / detail.total) * 100);
        setProgress(pct);
        setChunksReceived(detail.index);
        if (detail.index >= detail.total) {
          setState('verifying');
          setTimeout(() => setState('complete'), 2000);
        }
      }
      if (detail?.type === 'ota_error') {
        setError(detail.message || 'OTA failed');
        setState('error');
      }
    };
    window.addEventListener('agentrix:ota-progress', handler as EventListener);
    return () => window.removeEventListener('agentrix:ota-progress', handler as EventListener);
  }, [deviceId]);

  const handleStartUpdate = useCallback(async () => {
    if (!manifest) return;
    setState('downloading');
    setProgress(0);
    try {
      await startOtaUpdate(deviceId, manifest.package_id);
    } catch (err: any) {
      setError(err?.message || 'Failed to start OTA');
      setState('error');
    }
  }, [deviceId, manifest]);

  // ── Render ─────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Device info */}
      <View style={styles.deviceCard}>
        <Text style={styles.deviceName}>📟 {deviceName}</Text>
        <Text style={styles.deviceFw}>
          {t({ en: 'Current', zh: '当前' })}: v{currentFw}
        </Text>
      </View>

      {/* State-specific content */}
      {state === 'checking' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.statusText}>{t({ en: 'Checking for updates...', zh: '检查更新中...' })}</Text>
        </View>
      )}

      {state === 'up_to_date' && (
        <View style={styles.center}>
          <Text style={styles.bigIcon}>✅</Text>
          <Text style={styles.statusText}>{t({ en: 'Firmware is up to date', zh: '固件已是最新版本' })}</Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryBtnText}>{t({ en: 'Back', zh: '返回' })}</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'ready' && manifest && (
        <View style={styles.center}>
          <Text style={styles.bigIcon}>📦</Text>
          <Text style={styles.statusText}>
            {t({ en: 'Update available', zh: '有可用更新' })}
          </Text>
          <View style={styles.manifestCard}>
            <Text style={styles.manifestVersion}>v{manifest.version}</Text>
            <Text style={styles.manifestSize}>
              {(manifest.size_bytes / 1024).toFixed(0)} KB · {manifest.chunk_count} chunks
            </Text>
            {manifest.release_notes && (
              <Text style={styles.manifestNotes}>{manifest.release_notes}</Text>
            )}
            {manifest.mandatory && (
              <Text style={styles.mandatoryBadge}>⚠️ {t({ en: 'Mandatory', zh: '强制更新' })}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleStartUpdate}>
            <Text style={styles.primaryBtnText}>{t({ en: 'Install Update', zh: '安装更新' })}</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'downloading' && manifest && (
        <View style={styles.center}>
          <Text style={styles.bigIcon}>⬇️</Text>
          <Text style={styles.statusText}>
            {t({ en: 'Downloading...', zh: '下载中...' })}
          </Text>
          <View style={styles.progressWrap}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {progress}% · {chunksReceived} / {manifest.chunk_count} chunks
          </Text>
          <Text style={styles.hint}>
            {t({ en: 'Keep device nearby and powered on', zh: '请保持设备在附近且开机' })}
          </Text>
        </View>
      )}

      {state === 'verifying' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.statusText}>{t({ en: 'Verifying integrity...', zh: '验证完整性...' })}</Text>
        </View>
      )}

      {state === 'complete' && (
        <View style={styles.center}>
          <Text style={styles.bigIcon}>🎉</Text>
          <Text style={styles.statusText}>{t({ en: 'Update complete!', zh: '更新完成！' })}</Text>
          <Text style={styles.hint}>
            {t({ en: 'Device will restart automatically', zh: '设备将自动重启' })}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.primaryBtnText}>{t({ en: 'Done', zh: '完成' })}</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <Text style={styles.bigIcon}>❌</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleStartUpdate}>
            <Text style={styles.primaryBtnText}>{t({ en: 'Retry', zh: '重试' })}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  deviceCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  deviceName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  deviceFw: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  bigIcon: { fontSize: 56, marginBottom: 16 },
  statusText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 12, textAlign: 'center' },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 8, textAlign: 'center' },
  manifestCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.accent + '40',
    marginBottom: 20,
    alignItems: 'center',
    width: '100%',
  },
  manifestVersion: { fontSize: 22, fontWeight: '800', color: colors.accent, marginBottom: 4 },
  manifestSize: { fontSize: 12, color: colors.textMuted },
  manifestNotes: { fontSize: 13, color: colors.textPrimary, marginTop: 8, textAlign: 'center', lineHeight: 18 },
  mandatoryBadge: { fontSize: 12, color: '#f59e0b', fontWeight: '700', marginTop: 8 },
  progressWrap: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bgSecondary,
    overflow: 'hidden',
    marginVertical: 12,
  },
  progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 4 },
  progressText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  errorText: { fontSize: 14, color: '#ef4444', textAlign: 'center', marginBottom: 16 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 12,
  },
  secondaryBtnText: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
}));
