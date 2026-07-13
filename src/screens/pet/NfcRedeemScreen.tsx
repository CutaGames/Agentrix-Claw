/**
 * NfcRedeemScreen — Sprint 4 Task 4.3
 *
 * NFC blind box / card redemption screen.
 * 1. Shows a "Tap your NFC card" prompt
 * 2. Starts NFC scan on mount
 * 3. On success: shows celebration ("✨ Unlocked XXX!")
 * 4. On error: shows error message with retry button
 * 5. Navigation: accessible from PetHub "NFC 盲盒" tile
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Animated, Easing } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  initNfc,
  startNfcScan,
  stopNfcScan,
  redeemNfcToken,
  NfcRedeemItem,
  NfcError,
  NfcStatus,
} from '../../services/nfc.service';
import { themedStyles } from '../../theme/useTheme';

type ScreenState = 'checking' | 'scanning' | 'redeeming' | 'success' | 'error' | 'unsupported';

/** Animated celebration sparkles for NFC redeem success (Sprint F). */
function SuccessCelebration() {
  const scale = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.loop(
        Animated.timing(rotate, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    ]).start();
  }, [scale, rotate, opacity]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={{ transform: [{ scale }, { rotate: spin }], opacity, marginBottom: 16 }}>
      <Text style={{ fontSize: 72 }}>✨</Text>
    </Animated.View>
  );
}

export function NfcRedeemScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();

  const [state, setState] = useState<ScreenState>('checking');
  const [item, setItem] = useState<NfcRedeemItem | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const startScan = useCallback(async () => {
    setState('checking');
    setErrorMessage('');
    setItem(null);

    // 1. Check NFC availability
    const status: NfcStatus = await initNfc();
    if (status === 'not_supported') {
      setState('unsupported');
      setErrorMessage(t({ en: 'NFC is not supported on this device.', zh: '此设备不支持 NFC。' }));
      return;
    }
    if (status === 'disabled') {
      setState('error');
      setErrorMessage(t({ en: 'NFC is disabled. Please enable NFC in Settings.', zh: 'NFC 已关闭，请在设置中开启 NFC。' }));
      return;
    }

    // 2. Start scanning
    setState('scanning');
    try {
      const token = await startNfcScan();

      // 3. Redeem the token
      setState('redeeming');
      const response = await redeemNfcToken(token);

      if (response.success && response.item) {
        setItem(response.item);
        setState('success');
      } else {
        const errorCode = response.error || 'unknown';
        const messages: Record<string, string> = {
          already_redeemed: t({ en: 'This card has already been redeemed.', zh: '此卡已被兑换过。' }),
          invalid_token: t({ en: 'Invalid NFC card.', zh: '无效的 NFC 卡片。' }),
          expired: t({ en: 'This NFC card has expired.', zh: '此 NFC 卡片已过期。' }),
        };
        setErrorMessage(messages[errorCode] || t({ en: 'Redemption failed.', zh: '兑换失败。' }));
        setState('error');
      }
    } catch (error: any) {
      if (error instanceof NfcError) {
        const messages: Record<string, string> = {
          scan_cancelled: t({ en: 'Scan cancelled.', zh: '扫描已取消。' }),
          no_ndef: t({ en: 'No data found on this tag.', zh: '此标签无数据。' }),
          invalid_uri: t({ en: 'This is not a valid Agentrix NFC card.', zh: '这不是有效的 Agentrix NFC 卡片。' }),
          already_redeemed: t({ en: 'This card has already been redeemed.', zh: '此卡已被兑换过。' }),
          invalid_token: t({ en: 'Invalid NFC card.', zh: '无效的 NFC 卡片。' }),
          expired: t({ en: 'This NFC card has expired.', zh: '此 NFC 卡片已过期。' }),
        };
        setErrorMessage(messages[error.code] || error.message);
      } else {
        setErrorMessage(error?.message || t({ en: 'An error occurred.', zh: '发生错误。' }));
      }
      setState('error');
    }
  }, [t]);

  useEffect(() => {
    startScan();
    return () => {
      stopNfcScan();
    };
  }, [startScan]);

  const handleEquipNow = () => {
    navigation.navigate('Wardrobe');
  };

  const handleBackToHub = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      {/* NFC Icon Area */}
      <View style={styles.iconArea}>
        {state === 'checking' && (
          <>
            <Text style={styles.bigIcon}>📡</Text>
            <ActivityIndicator color={colors.accent} size="large" style={styles.loader} />
            <Text style={styles.statusText}>
              {t({ en: 'Checking NFC...', zh: '检查 NFC...' })}
            </Text>
          </>
        )}

        {state === 'scanning' && (
          <>
            <Text style={styles.bigIcon}>📱</Text>
            <Text style={styles.statusText}>
              {t({ en: 'Tap your NFC card on the back of your phone', zh: '将 NFC 卡片贴近手机背面' })}
            </Text>
            <Text style={styles.hintText}>
              {t({ en: 'Hold still until the scan completes', zh: '保持不动直到扫描完成' })}
            </Text>
            <View style={styles.pulseRing} />
          </>
        )}

        {state === 'redeeming' && (
          <>
            <Text style={styles.bigIcon}>⏳</Text>
            <ActivityIndicator color={colors.accent} size="large" style={styles.loader} />
            <Text style={styles.statusText}>
              {t({ en: 'Redeeming...', zh: '兑换中...' })}
            </Text>
          </>
        )}

        {state === 'success' && item && (
          <>
            <SuccessCelebration />
            <Text style={styles.successTitle}>
              {t({ en: `Unlocked: ${item.name}!`, zh: `解锁了：${item.name}！` })}
            </Text>
            <View style={styles.itemCard}>
              {item.thumbnailUrl ? (
                <Text style={styles.itemThumb}>🖼️</Text>
              ) : (
                <Text style={styles.itemThumb}>
                  {item.type === 'skin' ? '👗' : item.type === 'soul' ? '💫' : '🎁'}
                </Text>
              )}
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemType}>
                {item.type === 'skin'
                  ? t({ en: 'Skin', zh: '皮肤' })
                  : item.type === 'soul'
                    ? t({ en: 'Soul', zh: '灵魂' })
                    : t({ en: 'Item', zh: '物品' })}
              </Text>
            </View>
            <Text style={styles.moodHint}>
              {t({ en: 'Your pet is excited! 🤩', zh: '主宠超开心！🤩' })}
            </Text>
          </>
        )}

        {(state === 'error' || state === 'unsupported') && (
          <>
            <Text style={styles.bigIcon}>{state === 'unsupported' ? '🚫' : '❌'}</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        {state === 'success' && (
          <>
            <Pressable style={styles.primaryBtn} onPress={handleEquipNow}>
              <Text style={styles.primaryBtnText}>
                {t({ en: 'Equip Now', zh: '立即装备' })}
              </Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={handleBackToHub}>
              <Text style={styles.secondaryBtnText}>
                {t({ en: 'Back to Hub', zh: '返回中心' })}
              </Text>
            </Pressable>
          </>
        )}

        {state === 'error' && (
          <>
            <Pressable style={styles.primaryBtn} onPress={startScan}>
              <Text style={styles.primaryBtnText}>
                {t({ en: 'Retry', zh: '重试' })}
              </Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={handleBackToHub}>
              <Text style={styles.secondaryBtnText}>
                {t({ en: 'Back to Hub', zh: '返回中心' })}
              </Text>
            </Pressable>
          </>
        )}

        {state === 'unsupported' && (
          <Pressable style={styles.secondaryBtn} onPress={handleBackToHub}>
            <Text style={styles.secondaryBtnText}>
              {t({ en: 'Back to Hub', zh: '返回中心' })}
            </Text>
          </Pressable>
        )}

        {state === 'scanning' && (
          <Pressable style={styles.secondaryBtn} onPress={() => { stopNfcScan(); handleBackToHub(); }}>
            <Text style={styles.secondaryBtnText}>
              {t({ en: 'Cancel', zh: '取消' })}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigIcon: {
    fontSize: 72,
    marginBottom: 24,
  },
  statusText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
  },
  hintText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  loader: {
    marginTop: 16,
  },
  pulseRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: colors.accent + '40',
    position: 'absolute',
    top: '30%',
  },
  successTitle: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  itemCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent + '30',
    minWidth: 200,
  },
  itemThumb: {
    fontSize: 48,
    marginBottom: 12,
  },
  itemName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  itemType: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  moodHint: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 16,
    opacity: 0.8,
  },
  actions: {
    width: '100%',
    paddingBottom: 32,
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
}));
