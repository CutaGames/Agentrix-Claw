import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import { useAuthStore } from '../stores/authStore';
import {
  loginWithGoogle,
  loginWithTwitter,
  loginWithDiscord,
  loginWithTelegram,
  sendEmailCode,
  loginWithEmailCode,
} from '../services/auth';

const { width } = Dimensions.get('window');

type LoginProvider = 'google' | 'x' | 'telegram' | 'discord' | 'wallet' | 'email';

// Wallet apps and their deep-link schemes (app-first principle)
const WALLET_APPS = [
  { name: 'MetaMask', scheme: 'metamask://', storeUrl: 'https://metamask.io/download/' },
  { name: 'Trust Wallet', scheme: 'trust://', storeUrl: 'https://trustwallet.com/download' },
  { name: 'Coinbase Wallet', scheme: 'cbwallet://', storeUrl: 'https://www.coinbase.com/wallet' },
];

const SOCIAL_BUTTONS: {
  provider: LoginProvider;
  label: string;
  icon: string;
  color: string;
}[] = [
  { provider: 'google', label: 'Google', icon: 'G', color: '#EA4335' },
  { provider: 'x', label: 'X / Twitter', icon: '𝕏', color: '#1A1A1A' },
  { provider: 'discord', label: 'Discord', icon: 'D', color: '#5865F2' },
  { provider: 'telegram', label: 'Telegram', icon: '✈', color: '#2AABEE' },
];

export const LoginScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const [loadingProvider, setLoadingProvider] = useState<LoginProvider | null>(null);
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showEmail, setShowEmail] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // App-first wallet login: try installed wallet apps, fall back to WalletConnect
  const handleWalletLogin = useCallback(async () => {
    // Try to open installed wallet apps first
    for (const wallet of WALLET_APPS) {
      try {
        const canOpen = await Linking.canOpenURL(wallet.scheme);
        if (canOpen) {
          // Wallet app installed 鈥?navigate to WalletConnect which will handle deep link
          navigation?.navigate('WalletConnect', { preferredWallet: wallet.name });
          return;
        }
      } catch { /* continue */ }
    }
    // No wallet app installed 鈥?use web-based WalletConnect
    navigation?.navigate('WalletConnect');
  }, [navigation]);

  const handleSendCode = useCallback(async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) { Alert.alert('Error', 'Please enter your email address'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { Alert.alert('Error', 'Please enter a valid email address'); return; }
    setLoadingProvider('email');
    try {
      await sendEmailCode(trimmedEmail);
      setOtpSent(true);
      setCountdown(60);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { if (countdownRef.current) clearInterval(countdownRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to send verification code');
    } finally {
      setLoadingProvider(null);
    }
  }, [email]);

  const handleVerifyCode = useCallback(async () => {
    const trimmedCode = otpCode.trim();
    if (!trimmedCode || trimmedCode.length < 4) { Alert.alert('Error', 'Please enter the verification code'); return; }
    setLoadingProvider('email');
    useAuthStore.getState().setLoading(true);
    try {
      await loginWithEmailCode(email.trim(), trimmedCode);
    } catch (error: any) {
      Alert.alert('Login Failed', error?.message || 'Invalid verification code');
      useAuthStore.getState().setLoading(false);
    } finally {
      setLoadingProvider(null);
    }
  }, [email, otpCode]);

  const handleSocialLogin = useCallback(async (provider: LoginProvider) => {
    setLoadingProvider(provider);
    useAuthStore.getState().setLoading(true);
    try {
      switch (provider) {
        case 'google': await loginWithGoogle(); break;
        case 'x': await loginWithTwitter(); break;
        case 'discord': await loginWithDiscord(); break;
        case 'telegram': await loginWithTelegram(); break;
      }
    } catch (error: any) {
      const message = error?.message || 'Login failed';
      if (!message.includes('cancel')) Alert.alert('Login Failed', message);
      useAuthStore.getState().setLoading(false);
    } finally {
      setLoadingProvider(null);
    }
  }, []);

  const isDisabled = isLoading || loadingProvider !== null;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0B1220', '#0F1A2E', '#131F38', '#0B1220']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      {/* Subtle orbs */}
      <View style={styles.orbTopRight} />
      <View style={styles.orbBottomLeft} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* 鈹€鈹€鈹€鈹€ Brand 鈹€鈹€鈹€鈹€ */}
            <View style={styles.brandSection}>
              <View style={styles.logoGlow}>
                <View style={styles.logoContainer}>
                  <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
                </View>
              </View>
              <Text style={styles.title}>Agentrix</Text>
              <Text style={styles.tagline}>AI Agent Marketplace</Text>
            </View>

            {/* 鈹€鈹€鈹€鈹€ Primary: Wallet Login 鈹€鈹€鈹€鈹€ */}
            <TouchableOpacity
              style={[styles.walletPrimaryBtn, isDisabled && styles.btnDisabled]}
              onPress={handleWalletLogin}
              disabled={isDisabled}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#3B82F6', '#6366F1']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={styles.walletPrimaryIcon}>🔗</Text>
              <View style={styles.walletPrimaryText}>
                <Text style={styles.walletPrimaryTitle}>Connect Wallet</Text>
                <Text style={styles.walletPrimarySubtitle}>MetaMask · Trust · WalletConnect</Text>
              </View>
              <Text style={styles.walletPrimaryArrow}>→</Text>
            </TouchableOpacity>

            {/* 鈹€鈹€鈹€鈹€ Divider 鈹€鈹€鈹€鈹€ */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* 鈹€鈹€鈹€鈹€ Social Grid (2 脳 2) 鈹€鈹€鈹€鈹€ */}
            <View style={styles.socialGrid}>
              {SOCIAL_BUTTONS.map(btn => (
                <TouchableOpacity
                  key={btn.provider}
                  style={[styles.socialBtn, isDisabled && styles.btnDisabled]}
                  onPress={() => handleSocialLogin(btn.provider)}
                  disabled={isDisabled}
                  activeOpacity={0.75}
                >
                  <View style={[styles.socialIconCircle, { backgroundColor: btn.color }]}>
                    {loadingProvider === btn.provider
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.socialIconText}>{btn.icon}</Text>}
                  </View>
                  <Text style={styles.socialLabel}>{btn.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 鈹€鈹€鈹€鈹€ Email (collapsible) 鈹€鈹€鈹€鈹€ */}
            <TouchableOpacity
              style={styles.emailToggle}
              onPress={() => { setShowEmail(v => !v); setOtpSent(false); setOtpCode(''); }}
              activeOpacity={0.7}
            >
              <Text style={styles.emailToggleText}>
                {showEmail ? '▲ Hide email login' : '✉ Continue with Email'}
              </Text>
            </TouchableOpacity>

            {showEmail && (
              <View style={styles.emailCard}>
                <View style={styles.emailRow}>
                  <TextInput
                    style={styles.emailInput}
                    placeholder="your@email.com"
                    placeholderTextColor={colors.muted + '80'}
                    value={email}
                    onChangeText={(t) => { setEmail(t); if (otpSent) { setOtpSent(false); setOtpCode(''); } }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isDisabled}
                  />
                  <TouchableOpacity
                    style={[styles.sendCodeBtn, (isDisabled || countdown > 0) && styles.btnDisabled]}
                    onPress={handleSendCode}
                    disabled={isDisabled || countdown > 0}
                  >
                    {loadingProvider === 'email' && !otpSent
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.sendCodeText}>{countdown > 0 ? `${countdown}s` : 'Send'}</Text>}
                  </TouchableOpacity>
                </View>

                {otpSent && (
                  <>
                    <TextInput
                      style={styles.otpInput}
                      placeholder="• • • • • •"
                      placeholderTextColor={colors.muted + '60'}
                      value={otpCode}
                      onChangeText={setOtpCode}
                      keyboardType="number-pad"
                      maxLength={6}
                      editable={!isDisabled}
                      autoFocus
                    />
                    <TouchableOpacity
                      style={[styles.verifyBtn, isDisabled && styles.btnDisabled]}
                      onPress={handleVerifyCode}
                      disabled={isDisabled}
                    >
                      {loadingProvider === 'email' && otpSent
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.verifyBtnText}>Sign In</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* Loading indicator */}
            {loadingProvider && loadingProvider !== 'email' && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingText}>
                  Connecting to {loadingProvider === 'x' ? 'Twitter/X' : loadingProvider}...
                </Text>
              </View>
            )}

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                By continuing you agree to our{' '}
                <Text style={styles.footerLink}>Terms</Text>
                {' '}路{' '}
                <Text style={styles.footerLink}>Privacy</Text>
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center', paddingVertical: 28 },

  orbTopRight: {
    position: 'absolute', top: -60, right: -60,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: colors.primary + '09',
  },
  orbBottomLeft: {
    position: 'absolute', bottom: -40, left: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: '#8B5CF6' + '07',
  },

  // Brand
  brandSection: { alignItems: 'center', marginBottom: 32 },
  logoGlow: {
    width: 90, height: 90, borderRadius: 25,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35, shadowRadius: 24,
  },
  logoContainer: { width: 72, height: 72, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.card },
  logo: { width: 72, height: 72 },
  title: { fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: 1.5 },
  tagline: { fontSize: 14, color: colors.muted, marginTop: 5, letterSpacing: 0.5 },

  // Wallet primary button
  walletPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 4,
    gap: 12,
    elevation: 4,
    shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12,
  },
  walletPrimaryIcon: { fontSize: 24 },
  walletPrimaryText: { flex: 1 },
  walletPrimaryTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  walletPrimarySubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  walletPrimaryArrow: { fontSize: 18, color: 'rgba(255,255,255,0.8)', fontWeight: '700' },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: 11, marginHorizontal: 14, fontWeight: '700', letterSpacing: 2 },

  // Social grid
  socialGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  socialBtn: {
    width: (width - 48 - 10) / 2,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  socialIconCircle: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  socialIconText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  socialLabel: { fontSize: 13, fontWeight: '600', color: colors.text, flex: 1 },
  btnDisabled: { opacity: 0.4 },

  // Email section
  emailToggle: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  emailToggleText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  emailCard: {
    backgroundColor: colors.card,
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.border,
    gap: 10,
  },
  emailRow: { flexDirection: 'row', gap: 8 },
  emailInput: {
    flex: 1, backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.text,
  },
  sendCodeBtn: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center',
  },
  sendCodeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  otpInput: {
    backgroundColor: colors.bg,
    borderWidth: 1.5, borderColor: colors.primary + '50',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 22, color: colors.text, textAlign: 'center',
    letterSpacing: 10, fontWeight: '700',
  },
  verifyBtn: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  verifyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Loading
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 8 },
  loadingText: { color: colors.muted, fontSize: 13 },

  // Footer
  footer: { paddingTop: 24, paddingBottom: 8, alignItems: 'center' },
  footerText: { fontSize: 11, color: colors.muted + '80', textAlign: 'center', lineHeight: 16 },
  footerLink: { color: colors.primary, textDecorationLine: 'underline' },
});
