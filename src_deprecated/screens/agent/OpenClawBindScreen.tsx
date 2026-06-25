import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { bindOpenClaw, createBindSession, pollBindSession } from '../../services/openclaw.service';
import { startQrBindSession, waitForQrBind } from '../../services/auth';
import type { AgentStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AgentStackParamList, 'OpenClawBind'>;

export function OpenClawBindScreen() {
  const navigation = useNavigation<Nav>();
  const { addInstance, setActiveInstance } = useAuthStore.getState();
  const [mode, setMode] = useState<'manual' | 'qr'>('manual');
  const [instanceUrl, setInstanceUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<'pending' | 'scanned' | 'error'>('pending');

  // Start QR session when switching to QR mode
  useEffect(() => {
    if (mode === 'qr') startQRSession();
  }, [mode]);

  const startQRSession = async () => {
    try {
      setQrLoading(true);
      const session = await startQrBindSession();
      setQrCode(session.qrData);
      setQrSessionId(session.sessionId);
      setQrStatus('pending');
      pollQR(session.sessionId);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not start QR session');
    } finally {
      setQrLoading(false);
    }
  };

  const pollQR = async (sessionId: string) => {
    try {
      const instance = await waitForQrBind(sessionId);
      if (instance) {
        setQrStatus('scanned');
        addInstance(instance);
        setActiveInstance(instance.id ?? '');
        navigation.goBack();
      }
    } catch {
      setQrStatus('error');
    }
  };

  const handleManualBind = async () => {
    const url = instanceUrl.trim();
    if (!url) { Alert.alert('Required', 'Enter your OpenClaw instance URL'); return; }
    setLoading(true);
    try {
      const result = await bindOpenClaw({ instanceUrl: url, apiToken: apiToken.trim() || '' });
      const instance = {
        id: result.id,
        name: instanceName.trim() || result.name || `Instance ${Date.now()}`,
        instanceUrl: url,
        status: 'active' as const,
        deployType: 'existing' as const,
      };
      addInstance(instance);
      setActiveInstance(instance.id);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Bind Failed', err?.message || 'Connection failed. Check URL and token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Add OpenClaw Instance</Text>
      <Text style={styles.subtitle}>Connect another OpenClaw instance to your ClawLink account.</Text>

      <View style={styles.tabs}>
        {(['manual', 'qr'] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.tab, mode === m && styles.tabActive]}
            onPress={() => setMode(m)}
          >
            <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
              {m === 'manual' ? '⌨️ Manual' : '📱 QR Scan'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'manual' && (
        <View style={styles.fields}>
          <Text style={styles.label}>Instance Name (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Home Server, Work Agent..."
            placeholderTextColor={colors.textMuted}
            value={instanceName}
            onChangeText={setInstanceName}
          />
          <Text style={styles.label}>Instance URL</Text>
          <TextInput
            style={styles.input}
            placeholder="http://localhost:3001"
            placeholderTextColor={colors.textMuted}
            value={instanceUrl}
            onChangeText={setInstanceUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
          <Text style={styles.label}>API Token (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="sk-oc-xxxxx"
            placeholderTextColor={colors.textMuted}
            value={apiToken}
            onChangeText={setApiToken}
            secureTextEntry
          />
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={handleManualBind}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" size="small" /> :
              <Text style={styles.primaryBtnText}>🔗 Bind Instance</Text>}
          </TouchableOpacity>
        </View>
      )}

      {mode === 'qr' && (
        <View style={styles.qrSection}>
          {qrLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 32 }} />
          ) : qrCode ? (
            <>
              <Text style={styles.qrInstructions}>
                Open your OpenClaw instance → Settings → Mobile Bind → Scan this code
              </Text>
              <View style={styles.qrBox}>
                {/* QR code placeholder — in production use react-native-qrcode-svg */}
                <Text style={styles.qrPlaceholder}>📱</Text>
                <Text style={styles.qrCode}>{qrCode.substring(0, 20)}...</Text>
              </View>
              <Text style={[styles.qrStatus, qrStatus === 'scanned' && { color: colors.success }]}>
                {qrStatus === 'pending' ? '⏳ Waiting for scan...' :
                 qrStatus === 'scanned' ? '✅ Connected!' : '❌ Session expired'}
              </Text>
              {qrStatus === 'error' && (
                <TouchableOpacity style={styles.secondaryBtn} onPress={startQRSession}>
                  <Text style={styles.secondaryBtnText}>🔄 Refresh QR</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.qrError}>Could not generate QR code. Try manual bind.</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 24, paddingTop: 24, paddingBottom: 40, gap: 16 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  tabs: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: colors.bgSecondary },
  tabText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: colors.accent },
  fields: { gap: 12 },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, color: colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: colors.border },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: { backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  qrSection: { alignItems: 'center', gap: 16, paddingVertical: 16 },
  qrInstructions: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  qrBox: { width: 200, height: 200, backgroundColor: colors.bgCard, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.accent, gap: 8 },
  qrPlaceholder: { fontSize: 64 },
  qrCode: { fontSize: 10, color: colors.textMuted, fontFamily: 'monospace' },
  qrStatus: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  qrError: { fontSize: 14, color: colors.error, textAlign: 'center' },
});
