import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Dimensions, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { loginAsGuest } from '../../services/auth';
import { themedStyles } from '../../theme/useTheme';

const { width } = Dimensions.get('window');

/**
 * FirstScanScreen — 首启落地页 (2026-05 首启体验优化)。
 *
 * 用户下载 app 打开 → 不再先撞登录/邀请码墙, 而是直达这个"一键试用"落地页:
 *   - 主 CTA「拍一下, 造一个角色」→ 取游客 token → 进 Main → 直接打开扫描器
 *   - 次入口「已有账号? 登录」→ 弹出登录
 *
 * 游客首扫是"本地试用": 看到 AI 角色卡(后端不落库), 点保存时才引导登录。
 * 决策: 邀请码墙已移除; DeploySelect(部署选择)移到 设置→高级, 不挡新用户。
 */
export function FirstScanScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const guestTrialUsed = useAuthStore((s) => s.guestTrialUsed);

  const startGuestTrial = useCallback(async () => {
    try {
      setLoading(true);
      await loginAsGuest();
      // 游客 token 就位后 RootNavigator 会切到 Main。下一帧导航到扫描器。
      setTimeout(() => {
        try {
          navigation.navigate('Main', {
            screen: 'World',
            params: { screen: 'WorldEngineScanner', params: { mode: 'quick' } },
          });
        } catch {
          /* RootNavigator 已切到 Main, World 为默认 tab; 导航失败也能落在 World */
        }
      }, 60);
    } catch (e: any) {
      Alert.alert(
        t({ en: 'Could not start', zh: '无法开始' }),
        e?.message || t({ en: 'Please check your connection and try again.', zh: '请检查网络后重试。' }),
      );
    } finally {
      setLoading(false);
    }
  }, [navigation, t]);

  const goLogin = useCallback(() => {
    navigation.navigate('Auth', { screen: 'Login' });
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.logoCircle}>
          <Image
            source={require('../../../Agentrix Logo/agentrix_logo_square_transparent.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.bigEmoji}>📷✨</Text>
        <Text style={styles.title}>
          {t({ en: 'Turn anything into a battle-ready AI character', zh: '拍一下身边任意物品\n变成会战斗的 AI 角色' })}
        </Text>
        <Text style={styles.subtitle}>
          {t({
            en: 'Point your camera at a toy, a cup, anything — AI gives it a name, stats, skills and a soul in ~30s.',
            zh: '对着玩具、杯子、随手一个东西拍一下，AI 在 30 秒内给它名字、属性、技能和灵魂。',
          })}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.btnDisabled]}
          onPress={startGuestTrial}
          disabled={loading}
          activeOpacity={0.85}
          testID="first-scan-cta"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {guestTrialUsed
                ? t({ en: 'Scan another object', zh: '再扫一个' })
                : t({ en: 'Scan my first object', zh: '拍一下，造个角色' })}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.freeHint}>
          {t({ en: 'Free · no account needed to try', zh: '免费试用 · 无需注册' })}
        </Text>

        <TouchableOpacity style={styles.loginLink} onPress={goLogin} disabled={loading}>
          <Text style={styles.loginLinkText}>
            {t({ en: 'Already have an account? Sign in', zh: '已有账号？登录' })}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>
        {t({
          en: 'By continuing you agree to our Terms & Privacy Policy.',
          zh: '继续即表示同意服务条款和隐私政策。',
        })}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, paddingHorizontal: 28, paddingTop: 90, paddingBottom: 36, justifyContent: 'space-between' },
  hero: { alignItems: 'center' },
  logoCircle: { width: 64, height: 64, marginBottom: 28, opacity: 0.9 },
  logo: { width: 64, height: 64 },
  bigEmoji: { fontSize: 52, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', lineHeight: 34 },
  subtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: 16, lineHeight: 22, paddingHorizontal: 4 },
  actions: { alignItems: 'center' },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 18,
    width: width - 56,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  freeHint: { color: colors.textMuted, fontSize: 13, marginTop: 12 },
  loginLink: { marginTop: 22, padding: 8 },
  loginLinkText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  footer: { textAlign: 'center', fontSize: 11, color: colors.textMuted, lineHeight: 18 },
}));
