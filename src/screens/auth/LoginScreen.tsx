/**
 * LoginScreen — sign in or sign up in one page (E84 A, I-049; `briefs/login-simplify-v1.md`).
 *
 * Three main buttons, the same as the Web: Google, Apple, email code (third until the production code
 * store and mail sending are fixed, E84). "更多方式" holds email + password (existing accounts),
 * wallet, X, Discord, Telegram and a self-hosted OpenClaw instance. "先逛逛" (guest) stays.
 * The order lives in `services/loginOptions.ts`. Only the screen changed: every button calls the same
 * sign-in function as before. Colours come from the theme (light by default, E83).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  LOGIN_MORE_METHODS,
  LOGIN_PRIMARY_METHODS,
  isLoginCode,
  isLoginEmail,
  type LoginMethod,
  type LoginMethodId,
} from '../../services/loginOptions';
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
  const { t } = useI18n();
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

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const fail = (title: { en: string; zh: string }, error: unknown, fallback: { en: string; zh: string }) =>
    Alert.alert(t(title), (error as { message?: string } | null)?.message || t(fallback));

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
      Alert.alert(t({ en: 'OpenClaw URL required', zh: '请输入 OpenClaw 地址' }), t({ en: 'Enter your instance URL.', zh: '请输入你的实例地址。' }));
      return;
    }
    void run(
      'openclaw',
      async () => {
        const result = (await loginWithOpenClaw({ instanceUrl: url, apiToken: '' })) as any;
        if (result?.user && result?.token) await useAuthStore.getState().setAuth(result.user, result.token);
      },
      { en: 'Connection failed', zh: '连接失败' },
      { en: 'Check the instance URL and try again.', zh: '请检查实例地址后重试。' },
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

  const methodButton = (method: LoginMethod, primary: boolean) => (
    <TouchableOpacity
      key={method.id}
      style={[primary ? styles.primaryMethod : styles.moreMethod, busy === method.id && styles.disabled]}
      onPress={() => choose(method)}
      disabled={busy !== null}
      accessibilityRole="button"
      accessibilityLabel={t(method.label)}
      testID={method.testId}
    >
      <View style={styles.mark}>
        <Text style={styles.markText}>{method.mark}</Text>
      </View>
      <Text style={primary ? styles.primaryMethodText : styles.moreMethodText}>{t(method.label)}</Text>
      {busy === method.id ? <ActivityIndicator style={styles.spinner} /> : null}
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
          {LOGIN_PRIMARY_METHODS.map((method) => methodButton(method, true))}
          <TouchableOpacity
            style={styles.moreToggle}
            onPress={() => setShowMore((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showMore }}
            testID="login-more"
          >
            <Text style={styles.moreToggleText}>{showMore ? t({ en: 'Fewer ways ▴', zh: '收起 ▴' }) : t({ en: 'More ways ▾', zh: '更多方式 ▾' })}</Text>
          </TouchableOpacity>
          {showMore ? <View style={styles.moreList}>{LOGIN_MORE_METHODS.map((method) => methodButton(method, false))}</View> : null}
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
            {t({ en: 'Self-hosted OpenClaw instance', zh: '连接私有龙虾实例' })}
          </Text>
          <Text style={styles.sub}>{t({ en: 'Enter your instance URL to sign in directly.', zh: '输入你的实例地址直接登录。' })}</Text>
          <TextInput
            style={styles.input}
            placeholder="https://my-openclaw.xyz"
            placeholderTextColor={styles.placeholder.color}
            value={instanceUrl}
            onChangeText={setInstanceUrl}
            autoCapitalize="none"
            keyboardType="url"
            accessibilityLabel={t({ en: 'Instance URL', zh: '实例地址' })}
          />
          <TouchableOpacity style={[styles.cta, busy !== null && styles.disabled]} onPress={openClaw} disabled={busy !== null} accessibilityRole="button">
            {busy === 'openclaw' ? <ActivityIndicator color={styles.ctaText.color} /> : <Text style={styles.ctaText}>{t({ en: 'Connect and sign in', zh: '连接并登录' })}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.back} onPress={back} accessibilityRole="button">
            <Text style={styles.backText}>{t({ en: '← Other ways', zh: '← 其他方式' })}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.footer}>
        {t({ en: 'By continuing you agree to the Agentrix Terms of Service and Privacy Policy.', zh: '继续即表示你同意 Agentrix 服务条款和隐私政策。' })}
      </Text>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 24, paddingTop: 72, paddingBottom: 40, gap: 12 },
    header: { alignItems: 'center', marginBottom: 20, gap: 8 },
    logo: { width: 72, height: 72 },
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
    moreMethod: { minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 12 },
    moreMethodText: { color: c.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 },
    mark: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.bgSecondary, alignItems: 'center', justifyContent: 'center' },
    markText: { color: c.textPrimary, fontSize: 14, fontWeight: '800' },
    spinner: { marginLeft: 8 },
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
    footer: { color: c.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 24 },
  });
