import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';

// Wizard steps:
// 'choose'    → user picks: novice (install guide) OR existing (scan)
// 'install'   → Docker / NPM guide with QR scan
// 'scanning'  → camera QR scan (for existing or post-install)
// 'connecting'→ processing scanned data

type Step = 'choose' | 'install' | 'scanning' | 'connecting';

export function LocalDeployScreen() {
  const navigation = useNavigation<any>();
  const { addInstance, setActiveInstance } = useAuthStore.getState();

  const [step, setStep] = useState<Step>('choose');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera access is needed to scan the QR code from your PC.');
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
      // QR payload formats:
      //   Relay mode (ClawLink Agent): {relayToken, wsRelayUrl, mode:'relay'}
      //   Direct LAN (OpenClaw):       {url:'http://ip:port', token?:'xxx'}
      //   Plain URL fallback:          'http://...'
      let parsedData: { url?: string; token?: string; relayToken?: string; wsRelayUrl?: string; mode?: string };
      try {
        parsedData = JSON.parse(data);
      } catch {
        if (data.startsWith('http') || data.startsWith('ws')) {
          parsedData = { url: data };
        } else {
          throw new Error('QR code format not recognized. Please try again.');
        }
      }

      const instanceId = `local-${Date.now()}`;

      if (parsedData.mode === 'relay' || parsedData.relayToken) {
        // Relay mode — ClawLink Agent is running on PC, we connect via relay
        if (!parsedData.relayToken) throw new Error('Relay QR missing relayToken.');
        addInstance?.({
          id: instanceId,
          name: 'My PC (ClawLink Relay)',
          instanceUrl: parsedData.wsRelayUrl || 'wss://api.agentrix.top/relay',
          status: 'active',
          deployType: 'local',
          relayToken: parsedData.relayToken,
          wsRelayUrl: parsedData.wsRelayUrl,
        });
      } else {
        // Direct LAN mode — OpenClaw is accessible on local network
        if (!parsedData.url) throw new Error('QR code missing URL field.');
        addInstance?.({
          id: instanceId,
          name: 'My Local Agent',
          instanceUrl: parsedData.url,
          status: 'active',
          deployType: 'local',
        });
      }

      setActiveInstance?.(instanceId);
      navigation.navigate('SocialBind', { instanceId, platform: 'telegram' });
    } catch (error: any) {
      Alert.alert('Scan Error', error.message || 'Failed to parse QR code.');
      setStep('scanning');
      setScanned(false);
    }
  };

  // ── connecting ────────────────────────────────────────────────────────────
  if (step === 'connecting') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Connecting to local agent...</Text>
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
          <Text style={styles.scanLabel}>Aim at the QR code on your PC screen</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep(step === 'scanning' ? 'install' : 'choose')}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── install (novice guide — download Agentrix Setup) ─────────────────────
  if (step === 'install') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.stepIndicator}>Local Agent Setup</Text>
        <Text style={styles.title}>Install Agentrix</Text>
        <Text style={styles.subtitle}>
          One installer puts a full AI agent on your PC. Click Next until a QR code appears, then scan with your phone.
        </Text>

        {/* Windows primary download */}
        <TouchableOpacity
          style={[styles.stepsCard, styles.dlCardPrimary]}
          onPress={() => Linking.openURL('https://api.agentrix.top/downloads/Agentrix-Setup.exe')}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text style={{ fontSize: 36 }}>🪟</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.methodTitle, { marginBottom: 0 }]}>Agentrix-Setup.exe</Text>
              <Text style={styles.stepsText}>Windows 10 / 11 × 64-bit</Text>
            </View>
            <Text style={{ fontSize: 22, color: '#60a5fa' }}>⬇</Text>
          </View>
        </TouchableOpacity>

        {/* Linux secondary */}
        <TouchableOpacity
          style={[styles.stepsCard, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
          onPress={() => Linking.openURL('https://api.agentrix.top/downloads/clawlink-agent-linux')}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 24 }}>🐧</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.methodTitle, { marginBottom: 0 }]}>Linux binary</Text>
            <Text style={styles.stepsText}>x86-64</Text>
          </View>
          <Text style={{ fontSize: 18, color: colors.textMuted }}>⬇</Text>
        </TouchableOpacity>

        {/* Steps after install */}
        <View style={styles.stepsCard}>
          <Text style={styles.methodTitle}>After installing:</Text>
          {INSTALL_STEPS.map((s, i) => (
            <View key={i} style={styles.stepsRow}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
              <Text style={styles.stepsText}>{s}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={openScanner} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>📷 QR code is ready — Scan Now</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setStep('choose')} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── choose (default / entry) ──────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Local / Private Agent</Text>
      <Text style={styles.subtitle}>
        Run your AI agent on your own PC. Fully private, no monthly cloud fee.
      </Text>

      <TouchableOpacity style={styles.choiceCard} onPress={() => setStep('install')} activeOpacity={0.85}>
        <Text style={styles.choiceEmoji}>🆕</Text>
        <View style={styles.choiceBody}>
          <Text style={styles.choiceTitle}>I'm new — download the installer</Text>
          <Text style={styles.choiceDesc}>Download Agentrix-Setup.exe, click Next through the installer, and a QR code appears automatically. ~2 min.</Text>
        </View>
        <Text style={styles.choiceArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.choiceCard} onPress={openScanner} activeOpacity={0.85}>
        <Text style={styles.choiceEmoji}>📷</Text>
        <View style={styles.choiceBody}>
          <Text style={styles.choiceTitle}>I already have OpenClaw running</Text>
          <Text style={styles.choiceDesc}>Scan the QR code shown in your OpenClaw terminal to connect instantly.</Text>
        </View>
        <Text style={styles.choiceArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
        <Text style={styles.backLinkText}>← Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const INSTALL_STEPS = [
  'Run Agentrix-Setup.exe and click "Next" through the installer',
  'The Agentrix tray icon appears — a QR code is displayed automatically',
  'Tap "QR code is ready — Scan Now" above to connect your phone',
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

