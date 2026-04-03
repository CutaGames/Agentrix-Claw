import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import { confirmDesktopPair, bindOpenClaw, mapRawInstance } from '../../services/auth';
import { registerLocalRelayAgent } from '../../services/openclaw.service';

/**
 * Universal QR Scanner — handles all Agentrix QR types:
 *   • Desktop pair  (agentrix.top/pair?session=...&platform=desktop)
 *   • Web pair      (agentrix.top/pair?session=...&platform=web)
 *   • OpenClaw JSON ({"url":..., "token":...})
 *   • Relay JSON    ({"relayToken":..., "wsRelayUrl":...})
 *   • Deep links    (agentrix://connect?... or clawlink://connect?...)
 *   • Plain URL     (http://ip:port)
 */
export function ScanScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();
  const { addInstance, setActiveInstance } = useAuthStore.getState();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Request camera on mount
  React.useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  const handleBarCodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scanned || processing) return;
    setScanned(true);
    setProcessing(true);

    try {
      const scanText = data.trim();

      // ── 1) Desktop / Web pair QR ──
      if (scanText.includes('agentrix.top/pair') || scanText.includes('platform=desktop') || scanText.includes('platform=web')) {
        const pairUrl = new URL(scanText);
        const pairSession = pairUrl.searchParams.get('session');
        const platform = pairUrl.searchParams.get('platform') || 'desktop';
        if (!pairSession) throw new Error(t({ en: 'QR code missing session info.', zh: '二维码缺少会话信息。' }));
        await confirmDesktopPair(pairSession);
        const platformLabel = platform === 'web'
          ? t({ en: 'Web', zh: '网页端' })
          : t({ en: 'Desktop', zh: '桌面端' });
        Alert.alert(
          t({ en: 'Paired!', zh: '配对成功！' }),
          t({ en: `${platformLabel} is now logged in with your account.`, zh: `${platformLabel}已使用你的账号登录。` }),
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
        setProcessing(false);
        return;
      }

      // ── 2) JSON payload (OpenClaw / Relay) ──
      let parsedData: { url?: string; token?: string; relayToken?: string; wsRelayUrl?: string; mode?: string; name?: string } | null = null;
      try {
        const json = JSON.parse(scanText);
        parsedData = {
          url: json.url || json.instanceUrl || json.apiUrl || json.serverUrl,
          token: json.token || json.apiToken || json.instanceToken,
          relayToken: json.relayToken,
          wsRelayUrl: json.wsRelayUrl,
          mode: json.mode,
          name: json.name,
        };
      } catch {
        // not JSON, continue to other handlers
      }

      // ── 3) Deep link (agentrix:// or clawlink://) ──
      if (!parsedData && (
        scanText.startsWith('agentrix://connect') ||
        scanText.startsWith('clawlink://connect') ||
        scanText.startsWith('https://clawlink.app/connect')
      )) {
        const u = new URL(scanText);
        const host = u.searchParams.get('host') || u.searchParams.get('hostname') || '';
        const port = u.searchParams.get('port') || '7474';
        const token = u.searchParams.get('token') || u.searchParams.get('instanceId') || '';
        if (host) {
          parsedData = { url: `http://${host}:${port}`, token, mode: 'direct' };
        } else if (token) {
          parsedData = { relayToken: token, wsRelayUrl: 'wss://api.agentrix.top/relay', mode: 'relay' };
        }
      }

      // ── 4) Plain URL ──
      if (!parsedData && (scanText.startsWith('http') || scanText.startsWith('ws'))) {
        parsedData = { url: scanText };
      }

      // ── 5) host:port pattern ──
      if (!parsedData) {
        const m = scanText.match(/^([a-zA-Z0-9.-]+|\d{1,3}(?:\.\d{1,3}){3})(?::(\d{2,5}))?(?:\?token=(.+))?$/);
        if (m) {
          parsedData = { url: `http://${m[1]}:${m[2] || '7474'}`, token: m[3] || '', mode: 'direct' };
        }
      }

      if (!parsedData) throw new Error(t({ en: 'QR code format not recognized.', zh: '无法识别的二维码格式。' }));

      // ── Connect: Relay or Direct ──
      if (parsedData.mode === 'relay' || parsedData.relayToken) {
        if (!parsedData.relayToken) throw new Error('Relay QR missing relayToken.');
        const registered = await registerLocalRelayAgent({
          relayToken: parsedData.relayToken,
          name: parsedData.name || 'My PC Agent',
          wsRelayUrl: parsedData.wsRelayUrl,
        });
        const instance = mapRawInstance(registered, {
          name: registered.name || 'My PC (Agentrix Relay)',
          instanceUrl: parsedData.wsRelayUrl || 'wss://api.agentrix.top/relay',
          deployType: 'local',
          relayToken: parsedData.relayToken,
          wsRelayUrl: parsedData.wsRelayUrl,
        });
        addInstance?.(instance);
        setActiveInstance?.(instance.id);
        Alert.alert(t({ en: 'Connected!', zh: '连接成功！' }), t({ en: 'Agent connected via relay.', zh: '智能体已通过中继连接。' }),
          [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        if (!parsedData.url) throw new Error(t({ en: 'QR code missing URL.', zh: '二维码缺少地址。' }));
        const result = await bindOpenClaw({
          instanceUrl: parsedData.url,
          apiToken: parsedData.token || '',
          instanceName: parsedData.name || 'My Agent',
        });
        const instance = mapRawInstance(result, {
          name: result.name || 'My Agent',
          instanceUrl: parsedData.url,
          deployType: 'existing',
        });
        addInstance?.(instance);
        setActiveInstance?.(instance.id);
        Alert.alert(t({ en: 'Connected!', zh: '连接成功！' }), t({ en: 'Agent connected.', zh: '智能体已连接。' }),
          [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (error: any) {
      Alert.alert(
        t({ en: 'Scan Error', zh: '扫描错误' }),
        error.message || t({ en: 'Failed to process QR code.', zh: '二维码处理失败。' }),
      );
      setScanned(false);
    } finally {
      setProcessing(false);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>{t({ en: 'Camera permission required', zh: '需要相机权限' })}</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>{t({ en: 'Grant Permission', zh: '授予权限' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned && !processing ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Scan frame */}
        <View style={styles.scanFrame}>
          {processing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.processingText}>{t({ en: 'Processing...', zh: '处理中...' })}</Text>
            </View>
          )}
        </View>

        {/* Hint */}
        <Text style={styles.hint}>
          {t({ en: 'Scan desktop, web, or agent QR code', zh: '扫描桌面端、网页端或智能体二维码' })}
        </Text>

        {/* Rescan button */}
        {scanned && !processing && (
          <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)}>
            <Text style={styles.rescanText}>{t({ en: 'Tap to Rescan', zh: '点击重新扫描' })}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permText: { fontSize: 16, color: colors.textSecondary, marginBottom: 16 },
  permBtn: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame: {
    width: 260, height: 260, borderRadius: 20,
    borderWidth: 3, borderColor: colors.accent,
    backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  processingOverlay: { alignItems: 'center', gap: 12 },
  processingText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  hint: { marginTop: 24, fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', paddingHorizontal: 32 },
  rescanBtn: { marginTop: 16, backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  rescanText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
