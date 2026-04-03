/**
 * LocalConnectScreen
 *
 * Entry point for connecting a local Agentrix-Claw desktop agent to the mobile app.
 * Handles two flows:
 *
 *   A) QR deep-link:  agentrix://connect?instanceId=<id>&token=<tok>&host=<ip>&port=<port>
 *      → received when user scans the QR code shown by the Windows installer wizard.
 *
 *   B) Manual entry: user types the agent URL and token manually.
 *      → fallback when QR scan is unavailable or fails.
 *
 * Also shows a step-by-step install guide if the user hasn't installed Agentrix-Claw yet.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { mapRawInstance } from '../../services/auth';
import { bindOpenClaw } from '../../services/openclaw.service';
import type { AgentStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AgentStackParamList, 'LocalConnect'>;
type Route = RouteProp<AgentStackParamList, 'LocalConnect'>;

const DOWNLOAD_URL = 'https://agentrix.top/download';

// ── Step-by-step install guide ───────────────────────────────────────────────
const INSTALL_STEPS = [
  {
    icon: '💻',
    title: 'Download the installer',
    desc: 'Get Agentrix-Claw-Setup.exe from agentrix.top/download and run it on your Windows PC.',
    action: { label: 'Open Download Page', url: DOWNLOAD_URL },
  },
  {
    icon: '⚙️',
    title: 'Complete the wizard',
    desc: 'The installer automatically sets up Node.js and downloads the Agentrix-Claw agent. Accept the UAC prompt when asked.',
  },
  {
    icon: '📱',
    title: 'Scan the QR code',
    desc: 'On the final step of the installer, a QR code appears. Scan it with this app while both devices are on the same Wi-Fi.',
  },
  {
    icon: '✅',
    title: 'You\'re connected!',
    desc: 'The mobile app links to your local agent. Your queries are processed on your own PC.',
  },
];

export function LocalConnectScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { addInstance, setActiveInstance } = useAuthStore.getState();

  const { instanceId, token, host, port } = route.params ?? {};
  const hasQrParams = !!(instanceId && host);

  type Status = 'guide' | 'connecting' | 'success' | 'error' | 'manual';
  const [status, setStatus] = useState<Status>(hasQrParams ? 'connecting' : 'guide');
  const [errorMsg, setErrorMsg] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('');

  // Manual entry state
  const [manualHost, setManualHost] = useState('');
  const [manualPort, setManualPort] = useState('7474');
  const [manualToken, setManualToken] = useState('');

  useEffect(() => {
    if (hasQrParams) {
      const resolvedPort = port ?? '7474';
      const url = `http://${host}:${resolvedPort}`;
      setInstanceUrl(url);
      connectInstance(url, instanceId!, token ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectInstance = async (url: string, id: string, tok: string) => {
    try {
      setStatus('connecting');
      setInstanceUrl(url);

      const result = await bindOpenClaw({
        instanceUrl: url,
        apiToken: tok,
        instanceName: `Local Agent (${id.substring(0, 10)})`,
        deployType: 'local',
      });

      const instance = mapRawInstance(result, {
        name: result.name || 'Local Agent',
        instanceUrl: url,
        deployType: 'local',
      });
      addInstance(instance);
      setActiveInstance(instance.id);
      setStatus('success');

      setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'AgentConsole' }] });
      }, 1800);
    } catch (err: any) {
      setStatus('error');
      const msg = err?.message || 'Unknown error';
      setErrorMsg(
        msg.includes('Cannot reach') || msg.includes('Network') || msg.includes('fetch')
          ? `Cannot connect to the agent at:\n${url}\n\nMake sure:\n• Your phone and PC are on the same Wi-Fi\n• The Agentrix-Claw agent is running on your PC\n• Port ${port ?? '7474'} is not blocked by a firewall`
          : msg,
      );
    }
  };

  const handleManualConnect = () => {
    if (!manualHost.trim()) return;
    const url = `http://${manualHost.trim()}:${manualPort.trim() || '7474'}`;
    const id = `manual-${Date.now().toString(36)}`;
    connectInstance(url, id, manualToken.trim());
  };

  // ── GUIDE screen ─────────────────────────────────────────────────────────
  if (status === 'guide') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.guideTitle}>Connect a Local Agent</Text>
        <Text style={styles.guideSub}>
          Run Agentrix-Claw on your Windows PC, then scan the QR code to link it to your account.
        </Text>

        {INSTALL_STEPS.map((step, i) => (
          <View key={i} style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepIcon}>{step.icon}</Text>
              <Text style={styles.stepTitle}>{step.title}</Text>
            </View>
            <Text style={styles.stepDesc}>{step.desc}</Text>
            {step.action && (
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => Linking.openURL(step.action!.url)}
              >
                <Text style={styles.stepBtnText}>{step.action.label} ↗</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        <View style={styles.divider} />
        <Text style={styles.manualHint}>Already installed? Enter the URL manually:</Text>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => setStatus('manual')}>
          <Text style={styles.btnSecondaryText}>Enter URL manually</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── MANUAL entry screen ───────────────────────────────────────────────────
  if (status === 'manual') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.manualTitle}>📡  Manual Connection</Text>
        <Text style={styles.manualSub}>
          Find your PC's local IP (e.g. 192.168.1.x) and enter it below.{'\n'}
          The agent runs on port 7474 by default.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>PC IP Address</Text>
          <TextInput
            style={styles.input}
            placeholder="192.168.1.100"
            placeholderTextColor={colors.textMuted}
            value={manualHost}
            onChangeText={setManualHost}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Port</Text>
          <TextInput
            style={styles.input}
            placeholder="7474"
            placeholderTextColor={colors.textMuted}
            value={manualPort}
            onChangeText={setManualPort}
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Token (from installer log or config.json)</Text>
          <TextInput
            style={styles.input}
            placeholder="agent token"
            placeholderTextColor={colors.textMuted}
            value={manualToken}
            onChangeText={setManualToken}
            autoCapitalize="none"
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={[styles.btnPrimary, !manualHost.trim() && styles.btnDisabled]}
          onPress={handleManualConnect}
          disabled={!manualHost.trim()}
        >
          <Text style={styles.btnPrimaryText}>Connect</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnSecondary} onPress={() => setStatus('guide')}>
          <Text style={styles.btnSecondaryText}>← Back to guide</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── CONNECTING / SUCCESS / ERROR screens ─────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.statusEmoji}>
        {status === 'success' ? '✅' : status === 'error' ? '❌' : '🔗'}
      </Text>
      <Text style={styles.statusTitle}>
        {status === 'connecting' && 'Connecting…'}
        {status === 'success' && 'Agent Connected!'}
        {status === 'error' && 'Connection Failed'}
      </Text>

      {status === 'connecting' && (
        <View style={styles.spinnerBox}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.spinnerText}>Reaching {instanceUrl}…</Text>
        </View>
      )}

      {status === 'success' && (
        <View style={styles.card}>
          <Text style={styles.successText}>
            Your local Agentrix-Claw agent is now linked to your account.
          </Text>
          <Text style={styles.mono}>{instanceUrl}</Text>
          <Text style={styles.successSub}>Redirecting to Agent Console…</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.card}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          {instanceUrl ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Agent URL</Text>
              <Text style={styles.mono}>{instanceUrl}</Text>
            </View>
          ) : null}

          <View style={styles.btnRow}>
            {hasQrParams && (
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={() => {
                  setErrorMsg('');
                  const url = `http://${host}:${port ?? '7474'}`;
                  connectInstance(url, instanceId!, token ?? '');
                }}
              >
                <Text style={styles.btnPrimaryText}>↺  Retry</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setStatus('manual')}>
              <Text style={styles.btnSecondaryText}>Enter manually</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => setStatus('guide')} style={styles.linkBtn}>
            <Text style={styles.linkBtnText}>View install guide</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 20, paddingTop: 32, paddingBottom: 48 },

  // Guide
  guideTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  guideSub: { fontSize: 14, color: colors.textMuted, lineHeight: 21, marginBottom: 24 },
  stepCard: {
    backgroundColor: colors.bgCard ?? colors.bgSecondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  stepBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  stepBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  stepIcon: { fontSize: 18 },
  stepTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  stepDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  stepBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent + '22',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  stepBtnText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border ?? '#2a2a2a', marginVertical: 20 },
  manualHint: { color: colors.textMuted, fontSize: 13, marginBottom: 12 },

  // Manual
  manualTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  manualSub: { fontSize: 13, color: colors.textMuted, lineHeight: 20, marginBottom: 24 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.bgCard ?? colors.bgSecondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border ?? '#2a2a2a',
  },

  // Status
  statusEmoji: { fontSize: 52, textAlign: 'center', marginBottom: 12 },
  statusTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 24 },
  spinnerBox: { alignItems: 'center', gap: 16, marginBottom: 24 },
  spinnerText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  card: {
    width: '100%',
    backgroundColor: colors.bgCard ?? colors.bgSecondary,
    borderRadius: 16, padding: 20, gap: 12, marginBottom: 24,
  },
  successText: { color: colors.textPrimary, fontSize: 15, textAlign: 'center' },
  successSub: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  mono: { color: colors.accent, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  errorText: { color: '#F87171', fontSize: 14, lineHeight: 22 },
  infoRow: { gap: 4 },
  infoLabel: { color: colors.textMuted, fontSize: 12 },

  // Buttons
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  btnPrimary: {
    flex: 1, backgroundColor: colors.accent,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { opacity: 0.45 },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnSecondary: {
    flex: 1, backgroundColor: colors.bgCard ?? colors.bgSecondary,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border ?? '#333', marginTop: 8,
  },
  btnSecondaryText: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
  linkBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  linkBtnText: { color: colors.accent, fontSize: 13, textDecorationLine: 'underline' },
});
