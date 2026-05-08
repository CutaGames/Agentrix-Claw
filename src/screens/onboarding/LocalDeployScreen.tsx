import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import { bindOpenClaw, confirmDesktopPairWithApiBase, mapRawInstance } from '../../services/auth';
import { registerLocalRelayAgent } from '../../services/openclaw.service';

// Wizard steps:
// 'choose'    → user picks: novice (install guide) OR existing (scan)
// 'install'   → Docker / NPM guide with QR scan
// 'scanning'  → camera QR scan (for existing or post-install)
// 'connecting'→ processing scanned data

type Step = 'choose' | 'install' | 'scanning' | 'connecting';

export function LocalDeployScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useI18n();
  const { addInstance, setActiveInstance } = useAuthStore.getState();

  const [step, setStep] = useState<Step>('choose');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Auto-open scanner when navigated with directScan param (e.g. from Quick Action)
  useEffect(() => {
    if (route.params?.directScan) {
      openScanner();
    }
  }, []);

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(t({ en: 'Permission Required', zh: '需要权限' }), t({ en: 'Camera access is needed to scan the QR code from your PC.', zh: '需要相机权限才能扫描电脑上的二维码。' }));
        return;
      }
    }
    setStep('scanning');
    setScanned(false);
  };

  const handleBarCodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);
    setStep('connecting');

    try {
      const scanText = data.trim();
      // QR payload formats:
      //   Relay mode (Agentrix Agent): {relayToken, wsRelayUrl, mode:'relay'}
      //   Direct LAN (OpenClaw):       {url:'http://ip:port', token?:'xxx'}
      //   deep-link:                   agentrix://connect?... or clawlink://connect?...
      //   Plain URL fallback:          'http://...'
      let parsedData: { url?: string; token?: string; relayToken?: string; wsRelayUrl?: string; mode?: string; name?: string };
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
        if (
          scanText.startsWith('agentrix://connect') ||
          scanText.startsWith('clawlink://connect') ||
          scanText.startsWith('https://clawlink.app/connect')
        ) {
          try {
            const u = new URL(scanText);
            const host = u.searchParams.get('host') || u.searchParams.get('hostname') || '';
            const port = u.searchParams.get('port') || '7474';
            const token = u.searchParams.get('token') || u.searchParams.get('instanceId') || '';
            if (host) {
              parsedData = {
                url: `http://${host}:${port}`,
                token,
                mode: 'direct',
              };
            } else if (token) {
              parsedData = {
                relayToken: token,
                wsRelayUrl: 'wss://api.agentrix.top/relay',
                mode: 'relay',
              };
            } else {
              throw new Error('QR code format not recognized. Please try again.');
            }
          } catch {
            throw new Error('QR code format not recognized. Please try again.');
          }
        } else if (
          scanText.includes('agentrix.top/pair') ||
          scanText.includes('platform=desktop')
        ) {
          // Desktop pairing QR code — extract session ID and confirm
          const pairUrl = new URL(scanText);
          const pairSession = pairUrl.searchParams.get('session');
          const pairApiBase = pairUrl.searchParams.get('api') || undefined;
          if (!pairSession) throw new Error('Desktop QR code missing session. Please refresh and try again.');

          let lastErr: any;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await confirmDesktopPairWithApiBase(pairSession, pairApiBase);
              lastErr = null;
              break;
            } catch (error: any) {
              lastErr = error;
              if (attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }
          }

          if (lastErr) {
            throw lastErr;
          }

          Alert.alert(
            t({ en: 'Paired!', zh: '配对成功！' }),
            t({ en: 'Desktop is now logged in with your account.', zh: '桌面端已使用你的账号登录。' }),
          );
          setStep('choose');
          setScanned(false);
          return;
        } else if (scanText.startsWith('http') || scanText.startsWith('ws')) {
          parsedData = { url: scanText };
        } else {
          const hostPortMatch = scanText.match(/^([a-zA-Z0-9.-]+|\d{1,3}(?:\.\d{1,3}){3})(?::(\d{2,5}))?(?:\?token=(.+))?$/);
          if (!hostPortMatch) {
            throw new Error('QR code format not recognized. Please try again.');
          }
          const [, host, rawPort, rawToken] = hostPortMatch;
          parsedData = {
            url: `http://${host}:${rawPort || '7474'}`,
            token: rawToken || '',
            mode: 'direct',
          };
        }
      }

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
        navigation.navigate('SocialBind', { instanceId: instance.id, platform: 'telegram' });
      } else {
        if (!parsedData.url) throw new Error('QR code missing URL field.');
        const result = await bindOpenClaw({
          instanceUrl: parsedData.url,
          apiToken: parsedData.token || '',
          instanceName: parsedData.name || 'My PC Agent',
        });
        const instance = mapRawInstance(result, {
          name: result.name || 'My Local Agent',
          instanceUrl: parsedData.url,
          deployType: 'existing',
        });
        addInstance?.(instance);
        setActiveInstance?.(instance.id);
        navigation.navigate('SocialBind', { instanceId: instance.id, platform: 'telegram' });
      }
    } catch (error: any) {
      Alert.alert(t({ en: 'Scan Error', zh: '扫描错误' }), error.message || t({ en: 'Failed to parse QR code.', zh: '二维码解析失败。' }));
      setStep('scanning');
      setScanned(false);
    }
  };

  // ── connecting ────────────────────────────────────────────────────────────
  if (step === 'connecting') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>{t({ en: 'Connecting to local agent...', zh: '正在连接本地智能体…' })}</Text>
      </View>
    );
  }

  // ── scanning ──────────────────────────────────────────────────────────────
  if (step === 'scanning') {
    return (
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.scanLabel}>{t({ en: 'Aim at the QR code on your PC screen', zh: '将摄像头对准电脑屏幕上的二维码' })}</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep(step === 'scanning' ? 'install' : 'choose')}>
            <Text style={styles.cancelBtnText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── install (novice guide — download Agentrix Setup) ─────────────────────
  if (step === 'install') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.stepIndicator}>{t({ en: 'Local Agent Setup', zh: '本地智能体安装' })}</Text>
        <Text style={styles.title}>{t({ en: 'Install Agentrix-Claw', zh: '安装 Agentrix-Claw' })}</Text>
        <Text style={styles.subtitle}>
          {t({ en: 'One installer puts a full AI agent on your PC. Click Next until a QR code appears, then scan with your phone.', zh: '一个安装包即可在你的电脑上部署完整 AI 智能体。一路点击下一步，直到出现二维码，然后用手机扫描即可。' })}
        </Text>

        {/* Windows primary download */}
        <TouchableOpacity
          style={[styles.stepsCard, styles.dlCardPrimary]}
          onPress={() => Linking.openURL('https://api.agentrix.top/downloads/Agentrix-Claw-Setup.exe')}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text style={{ fontSize: 36 }}>🪟</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.methodTitle, { marginBottom: 0 }]}>Agentrix-Claw-Setup.exe</Text>
              <Text style={styles.stepsText}>{t({ en: 'Windows 10 / 11 × 64-bit', zh: 'Windows 10 / 11 × 64 位' })}</Text>
            </View>
            <Text style={{ fontSize: 22, color: '#60a5fa' }}>⬇</Text>
          </View>
        </TouchableOpacity>

        {/* macOS secondary */}
        <TouchableOpacity
          style={[styles.stepsCard, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
          onPress={() => Linking.openURL('https://api.agentrix.top/downloads/agentrix-claw-mac')}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 24 }}>🍎</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.methodTitle, { marginBottom: 0 }]}>{t({ en: 'macOS package', zh: 'macOS 安装包' })}</Text>
            <Text style={styles.stepsText}>{t({ en: 'Desktop pairing build', zh: '桌面端配对版本' })}</Text>
          </View>
          <Text style={{ fontSize: 18, color: colors.textMuted }}>⬇</Text>
        </TouchableOpacity>

        {/* Steps after install */}
        <View style={styles.stepsCard}>
          <Text style={styles.methodTitle}>{t({ en: 'After installing:', zh: '安装完成后：' })}</Text>
          {INSTALL_STEPS.map((s, i) => (
            <View key={i} style={styles.stepsRow}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
              <Text style={styles.stepsText}>{t(s)}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={openScanner} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>📷 {t({ en: 'QR code is ready — Scan Now', zh: '二维码已准备好——立即扫描' })}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setStep('choose')} style={styles.backLink}>
          <Text style={styles.backLinkText}>← {t({ en: 'Back', zh: '返回' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── choose (default / entry) ──────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t({ en: 'Local / Private Agent', zh: '本地 / 私有智能体' })}</Text>
      <Text style={styles.subtitle}>
        {t({ en: 'Run your AI agent on your own PC. Fully private, no monthly cloud fee.', zh: '让你的 AI 智能体运行在自己的电脑上。更私密，无需每月云端费用。' })}
      </Text>

      <TouchableOpacity style={styles.choiceCard} onPress={() => setStep('install')} activeOpacity={0.85}>
        <Text style={styles.choiceEmoji}>🆕</Text>
        <View style={styles.choiceBody}>
          <Text style={styles.choiceTitle}>{t({ en: `I'm new — download the installer`, zh: '我是新用户——下载安装器' })}</Text>
          <Text style={styles.choiceDesc}>{t({ en: 'Download Agentrix-Claw-Setup.exe, click Next through the installer, and a QR code appears automatically. ~2 min.', zh: '下载 Agentrix-Claw-Setup.exe，按向导点击下一步，二维码会自动出现。约 2 分钟。' })}</Text>
        </View>
        <Text style={styles.choiceArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.choiceCard} onPress={openScanner} activeOpacity={0.85}>
        <Text style={styles.choiceEmoji}>📷</Text>
        <View style={styles.choiceBody}>
          <Text style={styles.choiceTitle}>{t({ en: 'I already have the desktop agent running', zh: '我已经启动桌面端智能体' })}</Text>
          <Text style={styles.choiceDesc}>{t({ en: 'Scan the QR code shown in the Agentrix-Claw desktop app or terminal to connect instantly.', zh: '扫描 Agentrix-Claw 桌面应用或终端中显示的二维码即可立即连接。' })}</Text>
        </View>
        <Text style={styles.choiceArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
        <Text style={styles.backLinkText}>← {t({ en: 'Back', zh: '返回' })}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const INSTALL_STEPS = [
  { en: 'Run Agentrix-Claw-Setup.exe and click "Next" through the installer', zh: '运行 Agentrix-Claw-Setup.exe，并按向导点击“下一步”' },
  { en: 'The Agentrix-Claw tray icon appears — a QR code is displayed automatically', zh: 'Agentrix-Claw 托盘图标会出现——二维码会自动显示' },
  { en: 'Tap "QR code is ready — Scan Now" above to connect your phone', zh: '点击上方“二维码已准备好——立即扫描”来连接手机' },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 24, paddingTop: 56, paddingBottom: 48, gap: 16 },
  centered: { flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center', padding: 24 },
  stepIndicator: { fontSize: 12, fontWeight: '600', color: colors.accent, textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: 15, color: colors.textSecondary, lineHeight: 22 },
  loadingText: { marginTop: 20, fontSize: 15, color: colors.textSecondary },

  // Choice cards
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  choiceEmoji: { fontSize: 28, width: 40, textAlign: 'center' },
  choiceBody: { flex: 1, gap: 4 },
  choiceTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  choiceDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  choiceArrow: { fontSize: 22, color: colors.textMuted },

  // Download buttons
  downloadRow: { flexDirection: 'row', gap: 12 },
  dlBtn: { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center', gap: 4, borderWidth: 1 },
  dlBtnWin: { backgroundColor: '#1a73e822', borderColor: '#1a73e8' },
  dlBtnMac: { backgroundColor: colors.bgCard, borderColor: colors.border },
  dlIcon: { fontSize: 28 },
  dlLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  dlSub: { fontSize: 11, color: colors.textMuted },
  dlBtnLinux: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
  dlIconSm: { fontSize: 18 },
  dlLabelSm: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },

  // Install steps card
  stepsCard: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 },
  dlCardPrimary: { borderColor: '#3b82f6', backgroundColor: '#3b82f611' },
  stepsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontSize: 12, fontWeight: '800', color: colors.bgPrimary },
  stepsText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  methodTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  linkBtn: { marginTop: 4, alignSelf: 'flex-start' },
  linkBtnText: { fontSize: 13, color: colors.accent, fontWeight: '600' },

  primaryBtn: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.bgPrimary },
  backLink: { alignItems: 'center', paddingVertical: 10 },
  backLinkText: { fontSize: 14, color: colors.textMuted },

  // Camera overlay
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 240, height: 240, borderWidth: 2, borderColor: colors.accent, borderRadius: 16, backgroundColor: 'transparent', marginBottom: 24 },
  scanLabel: { color: '#fff', fontSize: 15, marginBottom: 40, textAlign: 'center', paddingHorizontal: 20 },
  cancelBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 20 },
  cancelBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

