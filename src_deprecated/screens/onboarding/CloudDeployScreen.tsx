import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { provisionCloudAgent, getInstanceById } from '../../services/openclaw.service';

type WizardStep = 'setup' | 'deploying' | 'done';

export function CloudDeployScreen() {
  const navigation = useNavigation<any>();
  const { addInstance, setActiveInstance, setOnboardingComplete } = useAuthStore.getState();

  const [wizardStep, setWizardStep] = useState<WizardStep>('setup');
  const [agentName, setAgentName] = useState('');
  const [progress, setProgress] = useState(0);
  const [instanceUrl, setInstanceUrl] = useState('');
  const [deployedInstanceId, setDeployedInstanceId] = useState<string | null>(null);

  const handleDeploy = async () => {
    const name = agentName.trim() || 'My Agent';
    setWizardStep('deploying');
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 15, 90));
    }, 600);

    try {
      // llmProvider is determined by platform backend — user doesn't choose
      const result = await provisionCloudAgent({ name, llmProvider: 'default' });

      // SSH provisioning is async — poll up to 60 s for instanceUrl to be ready
      let finalUrl = result.instanceUrl;
      if (!finalUrl) {
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          setProgress((p) => Math.min(p + 2, 95));
          try {
            const info = await getInstanceById(result.id);
            if (info.instanceUrl) { finalUrl = info.instanceUrl; break; }
          } catch (_) { /* keep polling */ }
        }
      }

      clearInterval(interval);
      setProgress(100);

      const instance = {
        id: result.id,
        name,
        instanceUrl: finalUrl || `cloud-${result.id}.openclaw.app`,
        status: 'active' as const,
        deployType: 'cloud' as const,
      };
      addInstance(instance);
      setActiveInstance(instance.id);
      setInstanceUrl(instance.instanceUrl);
      setDeployedInstanceId(instance.id);
      setWizardStep('done');
    } catch (err: any) {
      clearInterval(interval);
      setWizardStep('setup');
      Alert.alert(
        'Deploy Failed',
        err?.message || 'Could not provision cloud agent. Please try again later.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleFinish = () => {
    setOnboardingComplete();
    // Navigate directly to AgentConsole — Telegram binding can be set up later
    try {
      navigation.navigate('AgentConsole');
    } catch (_) {
      // In onboarding context: setOnboardingComplete() triggers RootNavigator to show Main
    }
  };

  if (wizardStep === 'deploying') {
    return (
      <View style={styles.centered}>
        <Text style={styles.deployTitle}>Setting up your agent...</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>{Math.round(progress)}%</Text>
        <Text style={styles.deployStep}>
          {progress < 30 ? 'Allocating container...' :
           progress < 60 ? 'Configuring AI models...' :
           progress < 85 ? 'Starting the agent...' : 'Almost ready...'}
        </Text>
      </View>
    );
  }

  if (wizardStep === 'done') {
    return (
      <View style={styles.centered}>
        <Text style={styles.celebrateTitle}>Your agent is live! 🎉</Text>
        <Text style={styles.celebrateSubtitle}>
          {agentName || 'Your agent'} is running at:
        </Text>
        <View style={styles.urlBox}>
          <Text style={styles.urlText} numberOfLines={1}>{instanceUrl}</Text>
        </View>
        <View style={[styles.featureBox, styles.storageGift, { width: '100%' }]}>
          <Text style={styles.storageGiftTitle}>🎁 10 GB Storage Activated</Text>
          <Text style={styles.storageGiftDesc}>Your free early-access storage is ready. Upgrade to 40 GB or 100 GB in Agent Console → Storage.</Text>
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleFinish}>
          <Text style={styles.primaryBtnText}>Start Chatting</Text>
        </TouchableOpacity>
        <Text style={styles.shareHint}>Share your agent with friends to earn commissions!</Text>
      </View>
    );
  }

  // ── Single-screen setup: just a name + deploy ─────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>1-Click Cloud Deploy</Text>
      <Text style={styles.subtitle}>
        We handle everything — server, AI model, and configuration.
      </Text>

      <View style={[styles.featureBox, styles.storageGift]}>
        <Text style={styles.storageGiftTitle}>🎁 Early Access Gift</Text>
        <Text style={styles.storageGiftDesc}>New users receive <Text style={{ fontWeight: '800', color: '#a78bfa' }}>10 GB</Text> cloud storage free. Upgrade to 40 GB or 100 GB anytime.</Text>
      </View>

      <View style={styles.featureBox}>
        <Text style={styles.featureItem}>☁️  AI model auto-configured by platform</Text>
        <Text style={styles.featureItem}>🔒  No API keys or setup required</Text>
        <Text style={styles.featureItem}>⚡  Agent live in ~30 seconds</Text>
        <Text style={styles.featureItem}>📦  5200+ ClawHub Skills ready to install</Text>
      </View>

      <Text style={styles.label}>Name your agent (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. My Awesome Agent"
        placeholderTextColor={colors.textMuted}
        value={agentName}
        onChangeText={setAgentName}
        maxLength={32}
      />

      <TouchableOpacity style={styles.primaryBtn} onPress={handleDeploy}>
        <Text style={styles.primaryBtnText}>Launch Cloud Agent</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backBtnText}>Back to options</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 24, paddingTop: 48, paddingBottom: 40, gap: 16 },
  centered: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 22, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    color: colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureBox: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  storageGift: {
    borderColor: '#7c3aed55',
    backgroundColor: '#7c3aed11',
  },
  storageGiftTitle: { fontSize: 15, fontWeight: '800', color: '#a78bfa' },
  storageGiftDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  featureItem: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 17,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  backBtn: { alignItems: 'center', padding: 12 },
  backBtnText: { color: colors.textMuted, fontSize: 14 },
  deployTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  progressBar: { width: '100%', height: 8, backgroundColor: colors.bgCard, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 4 },
  progressText: { fontSize: 18, fontWeight: '700', color: colors.accent },
  deployStep: { fontSize: 14, color: colors.textSecondary },
  celebrateTitle: { fontSize: 28, fontWeight: '800', color: colors.textPrimary },
  celebrateSubtitle: { fontSize: 15, color: colors.textSecondary },
  urlBox: {
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    padding: 14,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  urlText: { color: colors.accent, fontSize: 13, fontFamily: 'monospace' },
  shareHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
});