import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import {
  validateInvitationCode,
  redeemInvitationCode,
  checkInvitationStatus,
} from '../../services/invitation.service';

export function InvitationGateScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const { t, language } = useI18n();
  const setInvitationValid = useAuthStore((s) => s.setInvitationValid);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  // On mount, check if the user already has a valid invitation
  useEffect(() => {
    checkExistingInvitation();
  }, []);

  async function checkExistingInvitation() {
    try {
      const { hasInvitation } = await checkInvitationStatus();
      if (hasInvitation) {
        setInvitationValid();
      }
    } catch {
      // Not yet invited — show the gate
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit() {
    const trimmed = code.trim();
    if (trimmed.length < 3) {
      Alert.alert(t({ en: 'Invalid Code', zh: '无效邀请码' }), t({ en: 'Please enter a valid invitation code.', zh: '请输入有效的邀请码。' }));
      return;
    }

    setLoading(true);
    try {
      // Step 1: Validate
      const validation = await validateInvitationCode(trimmed);
      if (!validation.valid) {
        Alert.alert(t({ en: 'Invalid Code', zh: '无效邀请码' }), validation.message);
        return;
      }

      // Step 2: Redeem
      const result = await redeemInvitationCode(trimmed);
      if (result.success) {
        setInvitationValid();
      } else {
        Alert.alert(t({ en: 'Error', zh: '错误' }), result.message);
      }
    } catch (err: any) {
      Alert.alert(t({ en: 'Error', zh: '错误' }), err.message || t({ en: 'Failed to redeem invitation code', zh: '兑换邀请码失败' }));
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearAuth();
  }

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.checkingText}>{t({ en: 'Checking invitation status...', zh: '正在检查邀请状态...' })}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Logo area */}
        <Text style={styles.logo}>🤖</Text>
        <Text style={styles.title}>{t({ en: 'Welcome to Agentrix-Claw', zh: '欢迎来到 Agentrix-Claw' })}</Text>
        <Text style={styles.subtitle}>
          {t({ en: "Agentrix-Claw is currently in private beta.\nEnter your invitation code to get started.", zh: 'Agentrix-Claw 目前处于私测阶段。\n请输入邀请码以开始使用。' })}
        </Text>

        {/* Code input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="AX-XXXXXX"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            editable={!loading}
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
              <Text style={styles.submitBtnText}>{t({ en: 'Activate', zh: '激活' })}</Text>
          )}
        </TouchableOpacity>

        {/* Info */}
        <Text style={styles.info}>
          {t({ en: "Don't have a code? Follow us on social media for invitation code giveaways.", zh: '没有邀请码？关注我们的社交媒体获取邀请码。' })}
        </Text>

        {/* Logout link */}
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>{t({ en: 'Sign out', zh: '退出登录' })}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkingText: {
    color: colors.textMuted,
    marginTop: 16,
    fontSize: 14,
  },
  content: {
    width: '85%',
    maxWidth: 360,
    alignItems: 'center',
  },
  logo: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 16,
  },
  input: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    letterSpacing: 2,
  },
  submitBtn: {
    width: '100%',
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  info: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  logoutBtn: {
    paddingVertical: 8,
  },
  logoutText: {
    color: colors.textMuted,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
