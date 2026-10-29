/**
 * LoginScreen — sign in or sign up in one page (E84 A, I-049; `briefs/login-simplify-v1.md`).
 *
 * The server says which methods it can serve (`GET /api/auth/providers`, E86); the contract splits them
 * into main buttons (email code, Google, Apple) and "更多方式" (email + password, wallet, X, Discord,
 * Telegram), plus a self-hosted OpenClaw instance, always there. A method the server cannot serve is not
 * shown; if the list cannot be read, the contract's fallback decides and "更多方式" opens by itself.
 * "先逛逛" (guest) stays. The layout lives in `services/loginOptions.ts`. Every button calls the same
 * sign-in function as before. Colours come from the theme (light by default, E83).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import {
  loginAsGuest,
  loginWithApple,
  loginWithDiscord,
  loginWithEmail,
  loginWithEmailCode,
  loginWithGoogle,
  loginWithOpenClaw,
  loginWithTelegram,
  loginWithX,
  registerWithEmail,
  sendEmailCode,
} from '../../services/auth';
import {
  EMAIL_CODE_RESEND_SECONDS,
  LOGIN_LEGAL_URLS,
  frozenSignInText,
  isLoginCode,
  isLoginEmail,
  loginLayout,
  loginScreenLayout,
  type LoginMethod,
  type LoginMethodId,
} from '../../services/loginOptions';
import { readAuthProviders } from '../../services/authProviders';
import type { AuthProvidersResponseV1 } from '../../../shared/types/auth-providers';
import type { AuthStackParamList } from '../../navigation/types';
import { useThemedStyles, type Palette } from '../../theme/useTheme';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;
type Mode = 'choose' | 'email_code' | 'email_password' | 'openclaw';

const SOCIAL: Partial<Record<LoginMethodId, () => Promise<unknown>>> = {
  google: loginWithGoogle,
  apple: loginWithApple,
  x: loginWithX,
  discord: loginWithDiscord,
  telegram: loginWithTelegram,
};

export function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { t, language } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const [mode, setMode] = useState<Mode>('choose');
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [instanceUrl, setInstanceUrl] = useState('');
  // E86: which methods this server can serve. Read once per open (the service keeps a good answer 60 s).
  const [providers, setProviders] = useState<{ kind: 'loading' } | { kind: 'ready'; value: AuthProvidersResponseV1 | null }>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    void readAuthProviders().then((value) => {
      if (alive) setProviders({ kind: 'ready', value });
    });
    return () => {
      alive = false;
    };
  }, []);

  const layout = loginLayout(providers.kind === 'ready' ? providers.value : null, Platform.OS);
  // The first main button is solid; with no main method the first usable 更多方式 one is promoted (T7 r1).
  const shown = loginScreenLayout(layout);
  // Nothing at all to show as a main button: open 更多方式.
  const moreOpen = showMore || (providers.kind === 'ready' && shown.openMore);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const fail = (title: { en: string; zh: string }, error: unknown, fallback: { en: string; zh: string }) => {
    // L8-9 item 5: a frozen account says so in the app language, with the support address.
    const frozen = frozenSignInText(error, language);
    if (frozen) {
      Alert.alert(t({ en: "Can't sign in", zh: '无法登录' }), frozen);
      return;
    }
    // E84 C sign-in errors carry their own text in both languages (MobileHandoffSignInError).
    const localized = (error as { localized?: { en: string; zh: string } } | null)?.localized;
    Alert.alert(t(title), (localized && t(localized)) || (error as { message?: string } | null)?.message || t(fallback));
  };

  const run = async (key: string, task: () => Promise<unknown>, title: { en: string; zh: string }, fallback: { en: string; zh: string }) => {
    try {
      setBusy(key);
      // The sign-in functions store the session themselves (handleLoginResult); nothing else to do here.
      await task();
    } catch (error) {
      fail(title, error, fallback);
    } finally {
      setBusy(null);
    }
  };

  const choose = (method: LoginMethod) => {
    const social = SOCIAL[method.id];
    if (social) {
      void run(method.id, social, { en: 'Sign-in failed', zh: '登录失败' }, { en: 'Please try again later.', zh: '请稍后重试。' });
      return;
    }
    if (method.id === 'wallet') {
      (navigation as any).navigate('WalletConnect');
      return;
    }
    if (method.id === 'email_code') setMode('email_code');
    if (method.id === 'email_password') setMode('email_password');
    if (method.id === 'openclaw') setMode('openclaw');
  };

  const sendCode = () => {
    if (!isLoginEmail(email)) {
      Alert.alert(t({ en: 'Check the email', zh: '请检查邮箱' }), t({ en: 'Enter a valid email address.', zh: '请输入正确的邮箱地址。' }));
      return;
    }
    void run(
      'send_code',
      async () => {
        await sendEmailCode(email.trim());
        setCodeSent(true);
        setCooldown(EMAIL_CODE_RESEND_SECONDS);
      },
      { en: 'Code not sent', zh: '验证码没有发出' },
      { en: 'Please try again later, or use Google or Apple.', zh: '请稍后重试，或者用 Google、Apple 登录。' },
    );
  };

  const verifyCode = () => {
    if (!isLoginCode(code)) {
      Alert.alert(t({ en: 'Check the code', zh: '请检查验证码' }), t({ en: 'Enter the code from the email.', zh: '请输入邮件里的验证码。' }));
      return;
    }
    void run('verify_code', () => loginWithEmailCode(email.trim(), code.trim()), { en: 'Sign-in failed', zh: '登录失败' }, { en: 'The code is wrong or has expired.', zh: '验证码不对或者过期了。' });
  };

  const emailPassword = () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t({ en: 'Missing fields', zh: '请填写完整' }), t({ en: 'Enter your email and password.', zh: '请输入邮箱和密码。' }));
      return;
    }
    void run(
      'email_password',
      () => (isSignUp ? registerWithEmail(email.trim(), password.trim()) : loginWithEmail(email.trim(), password.trim())),
      isSignUp ? { en: 'Registration failed', zh: '注册失败' } : { en: 'Sign-in failed', zh: '登录失败' },
      { en: 'Invalid credentials.', zh: '账号或密码错误。' },
    );
  };

  const openClaw = () => {
    const url = instanceUrl.trim();
    if (!url) {
      Alert.alert(t({ en: 'Server address required', zh: '请输入服务器地址' }), t({ en: 'Enter the address of your server.', zh: '请输入你自己部署的服务器地址。' }));
      return;
    }
    void run(
      'openclaw',
      async () => {
        const result = (await loginWithOpenClaw({ instanceUrl: url, apiToken: '' })) as any;
        if (result?.user && result?.token) await useAuthStore.getState().setAuth(result.user, result.token);
      },
      { en: 'Connection failed', zh: '连接失败' },
      { en: 'Check the server address and try again.', zh: '请检查服务器地址后重试。' },
    );
  };

  // 免注册先逛逛: a guest token; RootNavigator switches to Main and asks to sign in when it matters.
  const guest = () =>
    void run('guest', () => loginAsGuest(), { en: 'Could not start', zh: '无法开始' }, { en: 'Please check your connection and try again.', zh: '请检查网络后重试。' });

  const back = () => {
    setMode('choose');
    setCode('');
    setPassword('');
  };

  // 'solid' is the one main way in, 'outline' the other main methods, 'more' a row inside 更多方式.
  const methodButton = (method: LoginMethod, kind: 'solid' | 'outline' | 'more') => (
    <TouchableOpacity
      key={method.id}
      style={[kind === 'solid' ? styles.solidMethod : kind === 'outline' ? styles.primaryMethod : styles.moreMethod, busy === method.id && styles.disabled]}
      onPress={() => choose(method)}
      disabled={busy !== null}
      accessibilityRole="button"
      accessibilityLabel={t(method.label)}
      testID={method.testId}
    >
      <View style={kind === 'solid' ? styles.solidMark : styles.mark}>
        <Text style={kind === 'solid' ? styles.solidMarkText : styles.markText}>{method.mark}</Text>
      </View>
      <Text style={kind === 'solid' ? styles.solidMethodText : kind === 'outline' ? styles.primaryMethodText : styles.moreMethodText}>{t(method.label)}</Text>
      {busy === method.id ? <ActivityIndicator style={styles.spinner} color={kind === 'solid' ? styles.solidMethodText.color : undefined} /> : null}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="login-screen">
      <View style={styles.header}>
        <Image source={require('../../../Agentrix Logo/agentrix_logo_square_transparent.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brand}>Agentrix Claw</Text>
      </View>

      {mode === 'choose' ? (
        <View style={styles.section}>
          <Text style={styles.title} accessibilityRole="header">
            {t({ en: 'Sign in or sign up', zh: '登录或注册' })}
          </Text>
          <Text style={styles.sub}>{t({ en: 'New here? Your account is created as you sign in.', zh: '第一次用会直接帮你建好账号。' })}</Text>
          {/* Buttons only once the server has answered (or the read timed out), so they do not swap under a finger. */}
          {providers.kind === 'loading' ? <ActivityIndicator style={styles.providersLoading} testID="login-providers-loading" /> : null}
          {providers.kind === 'ready' ? shown.main.map((method, index) => methodButton(method, index === 0 ? 'solid' : 'outline')) : null}
          {providers.kind === 'ready' && shown.more.length > 0 ? (
            <TouchableOpacity
              style={styles.moreToggle}
              onPress={() => setShowMore(!moreOpen)}
              accessibilityRole="button"
              accessibilityState={{ expanded: moreOpen }}
              testID="login-more"
            >
              <Text style={styles.moreToggleText}>{moreOpen ? t({ en: 'Fewer ways ▴', zh: '收起 ▴' }) : t({ en: 'More ways ▾', zh: '更多方式 ▾' })}</Text>
            </TouchableOpacity>
          ) : null}
          {providers.kind === 'ready' && moreOpen ? <View style={styles.moreList}>{shown.more.map((method) => methodButton(method, 'more'))}</View> : null}
          <TouchableOpacity style={[styles.guest, busy === 'guest' && styles.disabled]} onPress={guest} disabled={busy !== null} accessibilityRole="button" testID="login-guest">
            {busy === 'guest' ? <ActivityIndicator /> : <Text style={styles.guestText}>{t({ en: 'Look around first, sign up later', zh: '先逛逛，之后再注册' })}</Text>}
          </TouchableOpacity>
        </View>
      ) : null}

      {mode === 'email_code' ? (
        <View style={styles.section} testID="login-email-code-form">
          <Text style={styles.title} accessibilityRole="header">
            {t({ en: 'Continue with an email code', zh: '用邮箱验证码继续' })}
          </Text>
          <Text style={styles.sub}>{t({ en: 'No password. New emails get an account.', zh: '不用密码。新邮箱会直接建账号。' })}</Text>
          <TextInput
            style={styles.input}
            placeholder={t({ en: 'Email', zh: '邮箱' })}
            placeholderTextColor={styles.placeholder.color}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={busy === null}
            accessibilityLabel={t({ en: 'Email', zh: '邮箱' })}
          />
          {codeSent ? (
            <TextInput
              style={styles.input}
              placeholder={t({ en: 'Code from the email', zh: '邮件里的验证码' })}
              placeholderTextColor={styles.placeholder.color}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={8}
              editable={busy === null}
              accessibilityLabel={t({ en: 'Code from the email', zh: '邮件里的验证码' })}
            />
          ) : null}
          {codeSent ? (
            <TouchableOpacity style={[styles.cta, busy !== null && styles.disabled]} onPress={verifyCode} disabled={busy !== null} accessibilityRole="button" testID="login-email-code-verify">
              {busy === 'verify_code' ? <ActivityIndicator color={styles.ctaText.color} /> : <Text style={styles.ctaText}>{t({ en: 'Sign in', zh: '登录' })}</Text>}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[codeSent ? styles.linkButton : styles.cta, (busy !== null || cooldown > 0) && styles.disabled]}
            onPress={sendCode}
            disabled={busy !== null || cooldown > 0}
            accessibilityRole="button"
            testID="login-email-code-send"
          >
            {busy === 'send_code' ? (
              <ActivityIndicator color={codeSent ? undefined : styles.ctaText.color} />
            ) : (
              <Text style={codeSent ? styles.linkText : styles.ctaText}>
                {cooldown > 0
                  ? t({ en: `Send again in ${cooldown} s`, zh: `${cooldown} 秒后可以重发` })
                  : codeSent
                    ? t({ en: 'Send the code again', zh: '重新发送验证码' })
                    : t({ en: 'Send the code', zh: '发送验证码' })}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.back} onPress={back} accessibilityRole="button">
            <Text style={styles.backText}>{t({ en: '← Other ways', zh: '← 其他方式' })}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {mode === 'email_password' ? (
        <View style={styles.section} testID="login-email-password-form">
          <Text style={styles.title} accessibilityRole="header">
            {isSignUp ? t({ en: 'Create an account', zh: '注册账号' }) : t({ en: 'Email and password', zh: '邮箱和密码' })}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t({ en: 'Email', zh: '邮箱' })}
            placeholderTextColor={styles.placeholder.color}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            accessibilityLabel={t({ en: 'Email', zh: '邮箱' })}
          />
          <TextInput
            style={styles.input}
            placeholder={t({ en: 'Password', zh: '密码' })}
            placeholderTextColor={styles.placeholder.color}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            accessibilityLabel={t({ en: 'Password', zh: '密码' })}
          />
          <TouchableOpacity style={[styles.cta, busy !== null && styles.disabled]} onPress={emailPassword} disabled={busy !== null} accessibilityRole="button" testID="login-email-password-submit">
            {busy === 'email_password' ? (
              <ActivityIndicator color={styles.ctaText.color} />
            ) : (
              <Text style={styles.ctaText}>{isSignUp ? t({ en: 'Create account', zh: '注册' }) : t({ en: 'Sign in', zh: '登录' })}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkButton} onPress={() => setIsSignUp((value) => !value)} accessibilityRole="button">
            <Text style={styles.linkText}>
              {isSignUp ? t({ en: 'Already have an account? Sign in', zh: '已有账号？登录' }) : t({ en: 'No account yet? Sign up', zh: '没有账号？注册' })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.back} onPress={back} accessibilityRole="button">
            <Text style={styles.backText}>{t({ en: '← Other ways', zh: '← 其他方式' })}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {mode === 'openclaw' ? (
        <View style={styles.section} testID="login-openclaw-form">
          <Text style={styles.title} accessibilityRole="header">
            {t({ en: 'Connect your own server', zh: '连接自己部署的服务器' })}
          </Text>
          <Text style={styles.sub}>{t({ en: 'Enter the address of the Agent server you run yourself to sign in directly.', zh: '输入你自己部署的 Agent 服务器地址，直接登录。' })}</Text>
          <TextInput
            style={styles.input}
            placeholder="https://agent.example.com"
            placeholderTextColor={styles.placeholder.color}
            value={instanceUrl}
            onChangeText={setInstanceUrl}
            autoCapitalize="none"
            keyboardType="url"
            accessibilityLabel={t({ en: 'Server address', zh: '服务器地址' })}
          />
          <TouchableOpacity style={[styles.cta, busy !== null && styles.disabled]} onPress={openClaw} disabled={busy !== null} accessibilityRole="button">
            {busy === 'openclaw' ? <ActivityIndicator color={styles.ctaText.color} /> : <Text style={styles.ctaText}>{t({ en: 'Connect and sign in', zh: '连接并登录' })}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.back} onPress={back} accessibilityRole="button">
            <Text style={styles.backText}>{t({ en: '← Other ways', zh: '← 其他方式' })}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {t({ en: 'By continuing you agree to the Agentrix Terms of Service and Privacy Policy.', zh: '继续即表示你同意 Agentrix 的服务条款和隐私政策。' })}
        </Text>
        {/* T7 r1: the sentence named the two documents but nothing opened them. */}
        <View style={styles.footerLinks}>
          <TouchableOpacity style={styles.footerLink} onPress={() => void Linking.openURL(LOGIN_LEGAL_URLS.terms)} accessibilityRole="link" testID="login-terms">
            <Text style={styles.footerLinkText}>{t({ en: 'Terms of Service', zh: '服务条款' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.footerLink} onPress={() => void Linking.openURL(LOGIN_LEGAL_URLS.privacy)} accessibilityRole="link" testID="login-privacy">
            <Text style={styles.footerLinkText}>{t({ en: 'Privacy Policy', zh: '隐私政策' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 24, paddingTop: 72, paddingBottom: 40, gap: 12 },
    header: { alignItems: 'center', marginBottom: 20, gap: 8 },
    // The mark is a dark square tile; rounded, it reads as the app icon on the light page (E83).
    logo: { width: 72, height: 72, borderRadius: 16 },
    brand: { color: c.textPrimary, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
    section: { gap: 12 },
    title: { color: c.textPrimary, fontSize: 24, fontWeight: '800', textAlign: 'center' },
    sub: { color: c.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 8 },
    primaryMethod: {
      minHeight: 54,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 12,
    },
    primaryMethodText: { color: c.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 },
    solidMethod: {
      minHeight: 54,
      borderRadius: 14,
      backgroundColor: c.accent,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 12,
    },
    solidMethodText: { color: c.onAccent, fontSize: 16, fontWeight: '800', flex: 1 },
    solidMark: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.onAccent, alignItems: 'center', justifyContent: 'center' },
    solidMarkText: { color: c.accent, fontSize: 14, fontWeight: '800' },
    moreMethod: { minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 12 },
    moreMethodText: { color: c.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 },
    mark: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.bgSecondary, alignItems: 'center', justifyContent: 'center' },
    markText: { color: c.textPrimary, fontSize: 14, fontWeight: '800' },
    spinner: { marginLeft: 8 },
    providersLoading: { minHeight: 54 },
    moreToggle: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
    moreToggleText: { color: c.accent, fontSize: 14, fontWeight: '700' },
    moreList: { borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.bgCard, paddingVertical: 4 },
    guest: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    guestText: { color: c.textSecondary, fontSize: 15, fontWeight: '600' },
    input: {
      minHeight: 52,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      paddingHorizontal: 16,
      color: c.textPrimary,
      fontSize: 16,
    },
    placeholder: { color: c.textMuted },
    cta: { minHeight: 52, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    ctaText: { color: c.onAccent, fontSize: 16, fontWeight: '800' },
    linkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    linkText: { color: c.accent, fontSize: 14, fontWeight: '700' },
    back: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    backText: { color: c.textSecondary, fontSize: 14 },
    disabled: { opacity: 0.6 },
    footer: { marginTop: 24, alignItems: 'center' },
    footerText: { color: c.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
    footerLinks: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
    footerLink: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
    footerLinkText: { color: c.accent, fontSize: 13, fontWeight: '700' },
  });
