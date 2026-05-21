import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Dimensions, ActivityIndicator, Linking, Platform, Image, Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import { loginWithGoogle, loginWithApple, loginWithDiscord, loginWithEmail, registerWithEmail } from '../../services/auth';
import { loginWithOpenClaw } from '../../services/auth';
import type { AuthStackParamList } from '../../navigation/types';

const { width } = Dimensions.get('window');
type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

const WALLET_PROVIDERS = [
  { id: 'metamask', label: 'MetaMask', emoji: '🦊', scheme: 'metamask://' },
  { id: 'okx', label: 'OKX Wallet', emoji: '🖤', scheme: 'okx://' },
  { id: 'okex', label: 'OKEx (Legacy)', emoji: '🔳', scheme: 'okex://' },
  { id: 'imtoken', label: 'imToken', emoji: '💎', scheme: 'imtokenv2://' },
  { id: 'bitget', label: 'Bitget Wallet', emoji: '📈', scheme: 'bitkeep://' },
  { id: 'tp', label: 'TokenPocket', emoji: '🔵', scheme: 'tpoutside://' },
];

const SOCIAL_PROVIDERS_BASE = [
  { id: 'google', label: 'Google', emoji: '🌐', color: '#4285f4' },
  ...(Platform.OS === 'ios' ? [{ id: 'apple', label: 'Apple', emoji: '🍎', color: '#000000' }] : []),
  { id: 'discord', label: 'Discord', emoji: '🎮', color: '#5865f2' },
];
const SOCIAL_PROVIDERS = SOCIAL_PROVIDERS_BASE;

export function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { setAuth } = useAuthStore.getState();
  const { t, language } = useI18n();
  const [mode, setMode] = useState<'web25' | 'openclaw' | 'email'>('web25');
  const [isSignUp, setIsSignUp] = useState(false);
  const [instanceUrl, setInstanceUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  
  // Wallet detection
  const [detectedWallets, setDetectedWallets] = useState<typeof WALLET_PROVIDERS>([]);
  const [showWalletModal, setShowWalletModal] = useState(false);

  useEffect(() => {
    checkWallets();
  }, []);

  const checkWallets = async () => {
    const detected = [];
    for (const w of WALLET_PROVIDERS) {
      try {
        const canOpen = await Linking.canOpenURL(w.scheme);
        if (canOpen) detected.push(w);
      } catch (e) {}
    }
    setDetectedWallets(detected);
  };

  const handleWalletLogin = async (wallet?: typeof WALLET_PROVIDERS[0]) => {
    // Always enter the dedicated wallet-connect flow so users can:
    // 1) pick an installed wallet and deep-link into it,
    // 2) install a wallet if none is present,
    // 3) fall back to WalletConnect QR.
    (navigation as any).navigate('WalletConnect', wallet ? { walletId: wallet.id } : undefined);
    setShowWalletModal(false);
  };

  const handleOpenClawLogin = async () => {
    const url = instanceUrl.trim();
    if (!url) {
      Alert.alert(t({ en: 'OpenClaw URL required', zh: '请输入 OpenClaw URL' }), t({ en: 'Enter your OpenClaw instance URL (e.g. http://localhost:3001)', zh: '请输入你的 OpenClaw 实例地址（如 http://localhost:3001）' }));
      return;
    }
    try {
      setLoading(true);
      const result = await loginWithOpenClaw({ instanceUrl: url, apiToken: '' }) as any;
      if (result?.user && result?.token) {
        await setAuth(result.user, result.token);
      }
    } catch (err: any) {
      Alert.alert(
        t({ en: 'Connection Failed', zh: '连接失败' }),
        err?.message || t({ en: 'Could not connect to OpenClaw instance. Please verify the instance URL and try again.', zh: '无法连接到 OpenClaw 实例，请检查实例地址后重试。' }),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: string) => {
    try {
      setLoadingProvider(provider);
      let result: any;
      if (provider === 'google') result = await loginWithGoogle();
      else if (provider === 'discord') result = await loginWithDiscord();
      else if (provider === 'apple') result = await loginWithApple();
      else return;
      // handleLoginResult (inside loginWith*) already calls setAuth + fetches instances.
      // Do NOT call setAuth again here — it would overwrite instances.
    } catch (err: any) {
      Alert.alert(
        t({ en: 'Login Failed', zh: '登录失败' }), 
        err?.message || `${provider} ${t({ en: 'login failed. Please try again later.', zh: '登录失败，请稍后重试。' })}`,
      );
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleEmailLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t({ en: 'Missing Fields', zh: '请填写完整' }), t({ en: 'Enter your email and password', zh: '请输入邮箱和密码' }));
      return;
    }
    try {
      setLoading(true);
      const result = isSignUp 
        ? await registerWithEmail(email.trim(), password.trim()) as any
        : await loginWithEmail(email.trim(), password.trim()) as any;
      // handleLoginResult (inside loginWithEmail/registerWithEmail) already calls setAuth.
      // Do NOT call setAuth again here — it would overwrite instances.
    } catch (err: any) {
      Alert.alert(isSignUp ? t({ en: 'Registration Failed', zh: '注册失败' }) : t({ en: 'Login Failed', zh: '登录失败' }), err?.message || t({ en: 'Invalid credentials', zh: '账号或密码错误' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Brand Header */}
      <View style={styles.header}>
        <View style={styles.logoCircle}>
          <Image
            source={require('../../../Agentrix Logo/agentrix_logo_square_transparent.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.logoText}>Agentrix Claw</Text>
        <Text style={styles.tagline}>Intelligent agents, smoother everywhere</Text>
      </View>

      {/* Web2.5 Main Login Area */}
      {mode === 'web25' && (
        <View style={styles.section}>
          <Text style={styles.web25Title}>{t({ en: 'Welcome Back', zh: '欢迎回来' })}</Text>
          <Text style={styles.web25Sub}>{t({ en: 'Choose your preferred sign-in method', zh: '选择你偏好的登录方式' })}</Text>

          {/* Primary Wallet Login */}
          <TouchableOpacity 
            style={styles.walletMainBtn} 
            onPress={() => handleWalletLogin()}
            activeOpacity={0.8}
          >
            <View style={styles.walletIconRow}>
              {detectedWallets.slice(0, 3).map(w => (
                <Text key={w.id} style={styles.walletBadge}>{w.emoji}</Text>
              ))}
              {detectedWallets.length === 0 && <Text style={styles.walletBadge}>💼</Text>}
            </View>
            <Text style={styles.walletMainText}>
              {detectedWallets.length > 0 ? t({ en: 'Connect Wallet', zh: '连接钱包' }) : t({ en: 'Connect Crypto Wallet', zh: '连接加密钱包' })}
            </Text>
            {detectedWallets.length > 0 && (
              <Text style={styles.walletDetectedText}>
                {t({ en: `Detected: ${detectedWallets.map(w => w.label).join(', ')}`, zh: `已检测到：${detectedWallets.map(w => w.label).join('、')}` })}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t({ en: 'or social sign-in', zh: '或社交账号登录' })}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Grid */}
          <View style={styles.socialGridWide}>
            {SOCIAL_PROVIDERS.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.socialBtnWide, loadingProvider === p.id && styles.btnDisabled]}
                onPress={() => handleSocialLogin(p.id)}
                disabled={!!loadingProvider}
              >
                {loadingProvider === p.id ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <>
                    <Text style={[styles.socialEmoji, { color: p.color }]}>{p.emoji}</Text>
                    <Text style={styles.socialLabelWide}>{p.label}</Text>
                  </>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.linkRow} onPress={() => setMode('email')}>
            <Text style={styles.linkText}>{t({ en: 'Use Email Address instead →', zh: '改用邮箱登录 →' })}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* OpenClaw Mode */}
      {mode === 'openclaw' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t({ en: 'Connect OpenClaw Instance', zh: '连接 OpenClaw 实例' })}</Text>
          <Text style={styles.sectionSub}>
            {t({ en: 'Enter your instance URL to sign in directly.', zh: '输入你的实例地址直接登录。' })}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="https://my-openclaw.xyz"
            placeholderTextColor={colors.textMuted}
            value={instanceUrl}
            onChangeText={setInstanceUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={handleOpenClawLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>{t({ en: 'Connect & Sign In', zh: '连接并登录' })}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.backBtn} onPress={() => setMode('web25')}>
            <Text style={styles.backBtnText}>← {t({ en: 'Back to Web2.5 Login', zh: '返回 Web2.5 登录' })}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Email Mode */}
      {mode === 'email' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{isSignUp ? t({ en: 'Create Account', zh: '注册账号' }) : t({ en: 'Sign In with Email', zh: '邮箱登录' })}</Text>
          <TextInput
            style={styles.input}
            placeholder={t({ en: 'Email', zh: '邮箱' })}
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder={t({ en: 'Password', zh: '密码' })}
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={handleEmailLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>{isSignUp ? t({ en: 'Create Account', zh: '注册账号' }) : t({ en: 'Sign In', zh: '登录' })}</Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity style={{ marginTop: 12, alignItems: 'center' }} onPress={() => setIsSignUp(!isSignUp)}>
            <Text style={{ color: colors.accent, fontSize: 14 }}>
              {isSignUp ? t({ en: 'Already have an account? Sign In', zh: '已有账号？登录' }) : t({ en: "Don't have an account? Sign Up", zh: '没有账号？注册' })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backBtn} onPress={() => setMode('web25')}>
            <Text style={styles.backBtnText}>← {t({ en: 'Back to Web2.5 Login', zh: '返回 Web2.5 登录' })}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={showWalletModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t({ en: 'Select Wallet', zh: '选择钱包' })}</Text>
            <View style={styles.modalGrid}>
              {detectedWallets.map(w => (
                <TouchableOpacity key={w.id} style={styles.modalItem} onPress={() => { setShowWalletModal(false); handleWalletLogin(w); }}>
                  <Text style={styles.modalEmoji}>{w.emoji}</Text>
                  <Text style={styles.modalLabel}>{w.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowWalletModal(false)}>
              <Text style={styles.modalCloseText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* OpenClaw Instance Bind Link - Highlighted */}
      <TouchableOpacity 
        style={styles.openclawEntryCard} 
        onPress={() => setMode('openclaw')}
        activeOpacity={0.8}
      >
        <View style={styles.openclawEntryIconBox}>
          <Text style={styles.openclawEntryEmoji}>🦞</Text>
        </View>
        <View style={styles.openclawEntryContent}>
          <Text style={styles.openclawEntryTitle}>{t({ en: 'OpenClaw Instance', zh: '连接私有龙虾实例' })}</Text>
          <Text style={styles.openclawEntrySub}>{t({ en: 'Bind your self-hosted AI agent node', zh: '绑定你自行托管的 AI 智能体节点' })}</Text>
        </View>
        <Text style={styles.openclawEntryArrow}>→</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>
        {t({ en: 'By continuing you agree to Agentrix Terms of Service and Privacy Policy.', zh: '继续即表示你同意 Agentrix 服务条款和隐私政策。' })}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  content: { padding: 24, paddingTop: 100, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 48 },
  logoCircle: { 
    width: 88, 
    height: 88, 
    backgroundColor: 'transparent', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 12,
    borderRadius: 22
  },
  brandLogo: { width: 88, height: 88 },
  logoText: { fontSize: 14, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  tagline: { fontSize: 9, color: '#888888', marginTop: 6, letterSpacing: 0.1 },
  
  web25Title: { fontSize: 24, fontWeight: '700', color: '#ffffff', textAlign: 'center', marginBottom: 8 },
  web25Sub: { fontSize: 15, color: '#aaaaaa', textAlign: 'center', marginBottom: 32 },
  
  walletMainBtn: { backgroundColor: colors.primary, borderRadius: 20, padding: 24, alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 5 },
  walletIconRow: { flexDirection: 'row', gap: -8, marginBottom: 12 },
  walletBadge: { fontSize: 24, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', padding: 4, borderWidth: 2, borderColor: colors.primary },
  walletMainText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  walletDetectedText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },

  socialGridWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  socialBtnWide: {
    width: (width - 48 - 12) / 2,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  socialEmoji: { fontSize: 24, marginBottom: 8 },
  socialLabelWide: { color: colors.textPrimary, fontWeight: '600', fontSize: 14 },
  
  linkRow: { alignItems: 'center', marginTop: 24 },
  linkText: { color: colors.accent, fontWeight: '600', fontSize: 15 },
  
  section: { width: '100%' },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  sectionSub: { fontSize: 14, color: colors.textSecondary, marginBottom: 20 },
  
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    color: colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  backBtn: { marginTop: 20, padding: 12, alignItems: 'center' },
  backBtnText: { color: colors.textSecondary, fontSize: 15 },
  
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 32 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 13, color: colors.textMuted },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.bgSecondary, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 48 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 24 },
  modalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  modalItem: { width: (width - 64 - 32) / 3, alignItems: 'center', gap: 8 },
  modalEmoji: { fontSize: 32 },
  modalLabel: { color: colors.textPrimary, fontSize: 12, textAlign: 'center' },
  modalClose: { marginTop: 32, padding: 16, borderRadius: 16, backgroundColor: colors.bgCard, alignItems: 'center' },
  modalCloseText: { color: colors.textSecondary, fontWeight: '600' },

  openclawEntryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.1)', // Subtle red/orange tint
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
    borderRadius: 16,
    padding: 16,
    marginTop: 40,
  },
  openclawEntryIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 69, 58, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  openclawEntryEmoji: { fontSize: 24 },
  openclawEntryContent: { flex: 1 },
  openclawEntryTitle: { fontSize: 16, fontWeight: '700', color: '#ff6b6b', marginBottom: 2 },
  openclawEntrySub: { fontSize: 12, color: colors.textSecondary },
  openclawEntryArrow: { fontSize: 20, color: '#ff6b6b', fontWeight: '500' },

  footer: { marginTop: 40, textAlign: 'center', fontSize: 12, color: colors.textMuted, lineHeight: 20 },
});

