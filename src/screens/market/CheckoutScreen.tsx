/**
 * CheckoutScreen V2 — Smart Checkout (Mobile)
 *
 * Mirrors the web SmartCheckout layout:
 *   ┌─ Order Summary ────────────────────┐
 *   │  icon  ·  name  ·  price           │
 *   ├─ CRYPTO PAYMENT  [BSC TESTNET] ────┤
 *   │  ⚡ QuickPay     — auto-pay        │
 *   │  💳 Wallet Pay   — WalletConnect   │
 *   │  📱 Scan to Pay  — QR code         │
 *   ├──────────── OR ────────────────────┤
 *   │  FIAT PAYMENT                      │
 *   │  ▸ Stripe  (accordion)             │
 *   │  ▸ Transak (accordion)             │
 *   └───────────────────────────────────┘
 *
 * QuickPay: Session-key based auto-payment (ERC-8004) — works with any
 *   connected wallet that has an active session, NOT limited to MPC wallets.
 *   Falls back to a simple one-click approve+pay flow if no session exists.
 *
 * Payment methods open the web checkout in an in-app browser for the actual
 * transaction, keeping the mobile UX clean while reusing the audited web
 * payment infrastructure.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
  Platform,
  Linking,
  Share,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch, getApiConfig } from '../../services/api';
import { marketplaceApi } from '../../services/marketplace.api';
import { getHubSkillDetail } from '../../services/openclawHub.service';
import { useI18n } from '../../stores/i18nStore';
import type { MarketStackParamList } from '../../navigation/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Nav = NativeStackNavigationProp<MarketStackParamList, 'Checkout'>;
type RouteT = RouteProp<MarketStackParamList, 'Checkout'>;

type PaymentMethod =
  | 'quick_pay'
  | 'walletconnect'
  | 'scan'
  | 'stripe'
  | 'stripe_apple'
  | 'stripe_google'
  | 'stripe_card'
  | 'stripe_alipay'
  | 'transak';

interface PayIntentResult {
  payIntentId: string;
  eip681Uri: string;
  amount: string;
  tokenSymbol: string;
  toAddress: string;
  chainId: number;
  expiresAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHECKOUT_BASE = 'https://agentrix.top/pay/checkout';
const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 300_000; // 5 min

// ── Main Component ────────────────────────────────────────────────────────────

export function CheckoutScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { language } = useI18n();
  const { skillId, skillName } = route.params;

  const [paying, setPaying] = useState(false);
  const [activeMethod, setActiveMethod] = useState<PaymentMethod | null>(null);
  const [stripeOpen, setStripeOpen] = useState(false);
  const [transakOpen, setTransakOpen] = useState(false);
  const [scanData, setScanData] = useState<PayIntentResult | null>(null);
  const [scanPolling, setScanPolling] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animated chevrons
  const stripeChevron = useRef(new Animated.Value(0)).current;
  const transakChevron = useRef(new Animated.Value(0)).current;

  // ── Load skill info ──
  const { data: skill } = useQuery<any>({
    queryKey: ['checkout-skill', skillId],
    queryFn: async () => {
      if (skillId.startsWith('clawhub-') || skillId.startsWith('oc-') || skillId.startsWith('s')) {
        const hubSkill = await getHubSkillDetail(skillId);
        if (hubSkill) return hubSkill;
      }
      return marketplaceApi.getDetail(skillId);
    },
    enabled: !!skillId,
  });

  const price = skill?.pricing?.pricePerCall ?? skill?.price ?? 0;
  const currency = skill?.pricing?.currency ?? skill?.priceUnit ?? 'USD';
  const priceUSDT = price > 0 ? `≈ ${price.toFixed(2)} USDT` : language === 'zh' ? '免费' : 'Free';
  const displayPrice = price > 0 ? `$${price.toFixed(2)} ${currency}` : language === 'zh' ? '免费' : 'Free';

  // ── Helpers ──

  const haptic = useCallback(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  }, []);

  const ensureToken = useCallback((): string | null => {
    const { token } = getApiConfig();
    if (!token) {
      Alert.alert('Session Expired', 'Please login again to continue.');
      return null;
    }
    return token;
  }, []);

  const openWebCheckout = useCallback(async (method: string) => {
    const token = ensureToken();
    if (!token) return;
    const url = `${CHECKOUT_BASE}?skillId=${encodeURIComponent(skillId)}&mobileToken=${token}&method=${method}&mobile=1`;
    try {
      await WebBrowser.openBrowserAsync(url, {
        dismissButtonStyle: 'close',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch {
      Alert.alert('Error', 'Could not open payment page.');
    }
  }, [skillId, ensureToken]);

  const createOrder = useCallback(async (paymentMethod: PaymentMethod) => {
    return apiFetch<any>('/unified-marketplace/purchase', {
      method: 'POST',
      body: JSON.stringify({ skillId, quantity: 1, paymentMethod }),
    });
  }, [skillId]);

  // ── Stop QR polling ──
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setScanPolling(false);
  }, []);

  // ── Payment handlers ──

  const handleQuickPay = useCallback(async () => {
    haptic();
    setActiveMethod('quick_pay');
    setPaying(true);
    try {
      const order = await createOrder('quick_pay');
      if (order?.success !== false) {
        // If backend already processed (session key auto-pay), show success in-app
        if (order?.status === 'completed' || order?.status === 'paid') {
          haptic();
          setPaySuccess(true);
          return;
        }
        // If order requires session-key approval, try to complete in-app via polling
        if (order?.payIntentId || order?.orderId) {
          const intentId = order.payIntentId || order.orderId;
          let attempts = 0;
          const maxAttempts = 20;
          const poll = setInterval(async () => {
            attempts++;
            try {
              const status = await apiFetch<any>(`/payments/pay-intent/${intentId}/status`);
              if (status?.status === 'completed' || status?.status === 'paid') {
                clearInterval(poll);
                haptic();
                setPaySuccess(true);
                setPaying(false);
                setActiveMethod(null);
              }
            } catch {}
            if (attempts >= maxAttempts) {
              clearInterval(poll);
              Alert.alert('⏳ Payment Pending', 'Your payment is being processed. You\'ll receive a notification when it completes.');
              setPaying(false);
              setActiveMethod(null);
            }
          }, 3000);
          return;
        }
        // Fallback: open web for session key setup/approval
        if (order?.checkoutUrl) {
          const token = ensureToken();
          if (token) {
            const url = `${order.checkoutUrl}${order.checkoutUrl.includes('?') ? '&' : '?'}mobileToken=${token}`;
            await WebBrowser.openBrowserAsync(url);
          }
        } else {
          await openWebCheckout('quickpay');
        }
      }
    } catch (e: any) {
      Alert.alert('QuickPay Failed', e?.message ?? 'Could not process. Try Wallet Pay instead.');
    } finally {
      setPaying(false);
      setActiveMethod(null);
    }
  }, [haptic, createOrder, ensureToken, openWebCheckout, navigation]);

  const handleScanToPay = useCallback(async () => {
    haptic();
    if (scanData) {
      // Toggle QR off
      stopPolling();
      setScanData(null);
      return;
    }
    setActiveMethod('scan');
    setPaying(true);
    try {
      const result = await apiFetch<PayIntentResult>('/payments/pay-intent', {
        method: 'POST',
        body: JSON.stringify({ skillId, amount: price, currency }),
      });
      if (result?.eip681Uri) {
        setScanData(result);
        // Start polling for payment completion
        setScanPolling(true);
        const startTime = Date.now();
        pollingRef.current = setInterval(async () => {
          if (Date.now() - startTime > POLL_TIMEOUT) {
            stopPolling();
            Alert.alert('Timeout', 'QR payment expired. Please try again.');
            setScanData(null);
            return;
          }
          try {
            const status = await apiFetch<any>(
              `/payments/pay-intent/${result.payIntentId}/status`,
            );
            if (status?.status === 'completed' || status?.status === 'paid') {
              stopPolling();
              setScanData(null);
              haptic();
              setPaySuccess(true);
            }
          } catch { /* keep polling */ }
        }, POLL_INTERVAL);
      } else {
        // Fallback: open web QR flow
        await openWebCheckout('qrcode');
      }
    } catch (e: any) {
      Alert.alert('Scan to Pay', e?.message ?? 'Could not generate QR code. Try another method.');
    } finally {
      setPaying(false);
      setActiveMethod(null);
    }
  }, [haptic, skillId, price, currency, scanData, stopPolling, openWebCheckout]);

  const handleWalletPay = useCallback(async () => {
    haptic();
    setActiveMethod('walletconnect');
    setPaying(true);
    try {
      const order = await createOrder('walletconnect');
      if (order?.walletConnectUri) {
        // Deep-link to wallet app
        const canOpen = await Linking.canOpenURL(order.walletConnectUri);
        if (canOpen) {
          await Linking.openURL(order.walletConnectUri);
        } else {
          // Try common wallet deeplinks
          const deepLinks = [
            { scheme: 'metamask://wc?uri=', name: 'MetaMask' },
            { scheme: 'trust://wc?uri=', name: 'Trust Wallet' },
            { scheme: 'okex://wc?uri=', name: 'OKX Wallet' },
          ];
          let opened = false;
          for (const dl of deepLinks) {
            try {
              const url = `${dl.scheme}${encodeURIComponent(order.walletConnectUri)}`;
              const can = await Linking.canOpenURL(url);
              if (can) {
                await Linking.openURL(url);
                opened = true;
                break;
              }
            } catch {}
          }
          if (!opened) {
            Alert.alert(
              'No Wallet Found',
              'Please install MetaMask, Trust Wallet, or OKX Wallet to pay with crypto.\n\nAlternatively, use Scan to Pay with any existing wallet.',
              [
                { text: 'Use QR Pay', onPress: () => { setPaying(false); setActiveMethod(null); handleScanToPay(); } },
                { text: 'OK' },
              ],
            );
          }
        }
      } else if (order?.eip681Uri) {
        // EIP-681 URI — try to open in wallet
        await Linking.openURL(order.eip681Uri);
      } else if (order?.checkoutUrl) {
        const token = ensureToken();
        if (token) {
          const url = `${order.checkoutUrl}${order.checkoutUrl.includes('?') ? '&' : '?'}mobileToken=${token}`;
          await WebBrowser.openBrowserAsync(url);
        }
      } else {
        await openWebCheckout('wallet');
      }
    } catch (e: any) {
      Alert.alert('Wallet Pay Failed', e?.message ?? 'Could not connect wallet.');
    } finally {
      setPaying(false);
      setActiveMethod(null);
    }
  }, [haptic, createOrder, ensureToken, openWebCheckout, handleScanToPay]);

  const handleStripeMethod = useCallback(async (method: 'stripe_card' | 'stripe_apple' | 'stripe_google' | 'stripe_alipay') => {
    haptic();
    setActiveMethod(method);
    setPaying(true);
    try {
      // Map to web checkout method names
      const webMethodMap: Record<string, string> = {
        stripe_card: 'card',
        stripe_apple: 'apple_pay',
        stripe_google: 'google_pay',
        stripe_alipay: 'alipay',
      };
      await openWebCheckout(webMethodMap[method] ?? 'stripe');
    } finally {
      setPaying(false);
      setActiveMethod(null);
    }
  }, [haptic, openWebCheckout]);

  const handleTransak = useCallback(async () => {
    haptic();
    setActiveMethod('transak');
    setPaying(true);
    try {
      await openWebCheckout('transak');
    } finally {
      setPaying(false);
      setActiveMethod(null);
    }
  }, [haptic, openWebCheckout]);

  // ── Accordion toggle ──
  const toggleStripe = useCallback(() => {
    const toVal = stripeOpen ? 0 : 1;
    setStripeOpen(!stripeOpen);
    haptic();
    Animated.spring(stripeChevron, { toValue: toVal, useNativeDriver: true, speed: 20 }).start();
  }, [stripeOpen, stripeChevron, haptic]);

  const toggleTransak = useCallback(() => {
    const toVal = transakOpen ? 0 : 1;
    setTransakOpen(!transakOpen);
    haptic();
    Animated.spring(transakChevron, { toValue: toVal, useNativeDriver: true, speed: 20 }).start();
  }, [transakOpen, transakChevron, haptic]);

  // Cleanup polling on unmount
  React.useEffect(() => () => { stopPolling(); }, [stopPolling]);

  // ── Render helpers ──

  const renderCryptoCard = (
    icon: string,
    title: string,
    subtitle: string,
    rightText: string,
    onPress: () => void,
    method: PaymentMethod,
    accentColor: string,
  ) => {
    const isActive = activeMethod === method && paying;
    return (
      <TouchableOpacity
        key={method}
        style={[styles.methodCard, isActive && { borderColor: accentColor, backgroundColor: accentColor + '12' }]}
        onPress={onPress}
        disabled={paying && activeMethod !== method}
        activeOpacity={0.7}
      >
        <View style={[styles.methodIconWrap, { backgroundColor: accentColor + '18' }]}>
          <Text style={styles.methodIcon}>{icon}</Text>
        </View>
        <View style={styles.methodInfo}>
          <Text style={styles.methodTitle}>{title}</Text>
          <Text style={styles.methodSub}>{subtitle}</Text>
        </View>
        {isActive ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : (
          <Text style={[styles.methodPrice, { color: accentColor }]}>{rightText}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderStripeItem = (
    icon: string,
    title: string,
    desc: string,
    method: 'stripe_card' | 'stripe_apple' | 'stripe_google' | 'stripe_alipay',
    recommended = false,
  ) => (
    <TouchableOpacity
      key={method}
      style={styles.fiatItem}
      onPress={() => handleStripeMethod(method)}
      disabled={paying}
      activeOpacity={0.7}
    >
      <Text style={styles.fiatItemIcon}>{icon}</Text>
      <View style={styles.fiatItemInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.fiatItemTitle}>{title}</Text>
          {recommended && (
            <View style={styles.recommendBadge}>
              <Text style={styles.recommendText}>RECOMMENDED</Text>
            </View>
          )}
        </View>
        <Text style={styles.fiatItemDesc}>{desc}</Text>
      </View>
      {activeMethod === method && paying ? (
        <ActivityIndicator size="small" color={colors.success} />
      ) : (
        <Text style={styles.chevronRight}>›</Text>
      )}
    </TouchableOpacity>
  );

  // ── Share after payment ──
  const handleShareAfterPay = useCallback(() => {
    const isResource = skill?.category === 'resources';
    const displayName = skillName || skill?.displayName || skill?.name || 'Skill';
    try {
      navigation.navigate('ShareCard', {
        shareUrl: `https://agentrix.top/skill/${skillId}?ref=purchase`,
        title: displayName,
        userName: 'Agentrix User',
        subtitle: isResource
          ? (language === 'zh' ? '刚刚在 Agentrix Marketplace 完成购买' : 'Just purchased on Agentrix Marketplace')
          : (language === 'zh' ? '刚刚在 Agentrix Marketplace 解锁' : 'Just unlocked on Agentrix Marketplace'),
        headerEmoji: skill?.icon || (isResource ? '📦' : '⚡'),
        categoryLabel: isResource ? (language === 'zh' ? '资源' : 'RESOURCE') : (language === 'zh' ? '技能' : 'SKILL'),
        priceLabel: skill?.price ? `$${Number(skill.price).toFixed(2)} / ${skill?.priceUnit || 'USD'}` : (language === 'zh' ? '已购买' : 'Paid'),
        statsLabel: isResource
          ? (language === 'zh' ? '已可分享给你的团队' : 'Ready to share with your team')
          : (language === 'zh' ? '已可安装并推广' : 'Ready to install and promote'),
        description: skill?.description || undefined,
        tags: skill?.tags || [],
        ctaLabel: isResource
          ? (language === 'zh' ? '扫码查看这次购买' : 'Scan to view this purchase')
          : (language === 'zh' ? '扫码查看这个技能' : 'Scan to explore this skill'),
        accentFrom: isResource ? '#0F766E' : '#2563EB',
        accentTo: isResource ? '#14B8A6' : '#7C3AED',
      });
    } catch {
      Share.share({
        message: `I just purchased "${displayName}" on Agentrix Claw! 🎉\nhttps://agentrix.top/skill/${skillId}`,
      });
    }
  }, [language, navigation, skill, skillId, skillName]);

  // ── Payment Success View ──
  if (paySuccess) {
    return (
      <View style={styles.successContainer}>
        <Text style={styles.successEmoji}>🎉</Text>
        <Text style={styles.successTitle}>Payment Complete!</Text>
        <Text style={styles.successSub}>
          You now have access to {skillName || skill?.displayName || skill?.name || 'this skill'}
        </Text>
        <View style={styles.successActions}>
          <TouchableOpacity style={styles.sharePayBtn} onPress={handleShareAfterPay}>
            <Text style={styles.sharePayBtnText}>🔗 Share with Friends</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sharePosterBtn} onPress={handleShareAfterPay}>
            <Text style={styles.sharePosterBtnText}>📸 Share Poster</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.successDoneBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.successDoneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Chevron rotation interpolation
  const stripeRotate = stripeChevron.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });
  const transakRotate = transakChevron.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Checkout</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* ── Order Summary ── */}
      <View style={styles.orderCard}>
        <View style={styles.orderTop}>
          <Text style={styles.orderLabel}>Total Amount</Text>
          <Text style={styles.orderPrice}>{displayPrice}</Text>
        </View>
        <View style={styles.orderSkillPill}>
          <Text style={styles.orderIcon}>{skill?.icon || '⚡'}</Text>
          <Text style={styles.orderName} numberOfLines={1}>
            {skillName || skill?.displayName || skill?.name || 'Skill'}
          </Text>
        </View>
      </View>

      {/* ── CRYPTO PAYMENT Section ── */}
      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionIcon}>🔗</Text>
          <Text style={styles.sectionTitle}>CRYPTO PAYMENT</Text>
          {__DEV__ && (
            <View style={styles.testnetBadge}>
              <Text style={styles.testnetText}>BSC TESTNET</Text>
            </View>
          )}
        </View>

        <View style={styles.sectionBody}>
          {renderCryptoCard(
            '⚡', 'QuickPay', 'One-click · Session key auto-pay',
            priceUSDT, handleQuickPay, 'quick_pay', '#6366f1',
          )}
          {renderCryptoCard(
            '💳', 'Wallet Pay', 'WalletConnect · Manual approval',
            priceUSDT, handleWalletPay, 'walletconnect', '#475569',
          )}
          {renderCryptoCard(
            '📱', 'Scan to Pay', 'QR code · Any mobile wallet',
            priceUSDT, handleScanToPay, 'scan', '#10b981',
          )}
        </View>

        {/* ── QR Code (Scan to Pay expanded) ── */}
        {scanData && (
          <View style={styles.qrWrap}>
            <View style={styles.qrCard}>
              <Text style={styles.qrTitle}>Scan with your wallet</Text>
              <View style={styles.qrCodeContainer}>
                <QRCode
                  value={scanData.eip681Uri}
                  size={200}
                  backgroundColor="#ffffff"
                  color="#000000"
                />
              </View>
              <Text style={styles.qrAmount}>
                {scanData.amount} {scanData.tokenSymbol}
              </Text>
              <Text style={styles.qrChain}>Chain ID: {scanData.chainId}</Text>
              {scanPolling && (
                <View style={styles.pollingRow}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={styles.pollingText}>Waiting for payment…</Text>
                </View>
              )}
              <Text style={styles.qrAddress} numberOfLines={1} selectable>
                To: {scanData.toAddress}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ── OR Divider ── */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* ── FIAT PAYMENT Section ── */}
      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionIcon}>💵</Text>
          <Text style={styles.sectionTitle}>FIAT PAYMENT</Text>
        </View>

        <View style={styles.sectionBody}>
          {/* ── Stripe Accordion ── */}
          <TouchableOpacity style={styles.accordionHeader} onPress={toggleStripe} activeOpacity={0.7}>
            <Animated.Text style={[styles.accordionChevron, { transform: [{ rotate: stripeRotate }] }]}>
              ›
            </Animated.Text>
            <Text style={styles.accordionTitle}>Pay via Stripe</Text>
            <View style={styles.secureBadge}>
              <Text style={styles.secureText}>🔒 Secured</Text>
            </View>
          </TouchableOpacity>

          {stripeOpen && (
            <View style={styles.accordionBody}>
              {Platform.OS === 'ios' && renderStripeItem(
                '🍎', 'Apple Pay', 'No extra fee · Instant', 'stripe_apple', true,
              )}
              {Platform.OS === 'android' && renderStripeItem(
                '🟢', 'Google Pay', 'Fast checkout · No extra fee', 'stripe_google', true,
              )}
              {renderStripeItem(
                '💳', 'Credit / Debit Card', 'Visa · MasterCard · AmEx', 'stripe_card',
                Platform.OS === 'web', // recommended on web
              )}
              {renderStripeItem(
                '🔵', 'Alipay', 'May include FX fee', 'stripe_alipay',
              )}
              <Text style={styles.stripeFee}>Processing fee: ~2.9% + $0.30 · Secured by Stripe</Text>
            </View>
          )}

          {/* ── Transak Accordion ── */}
          <TouchableOpacity style={[styles.accordionHeader, { marginTop: 8 }]} onPress={toggleTransak} activeOpacity={0.7}>
            <Animated.Text style={[styles.accordionChevron, { transform: [{ rotate: transakRotate }] }]}>
              ›
            </Animated.Text>
            <Text style={styles.accordionTitle}>Buy Crypto with Fiat</Text>
          </TouchableOpacity>

          {transakOpen && (
            <View style={styles.accordionBody}>
              <TouchableOpacity style={styles.fiatItem} onPress={handleTransak} disabled={paying} activeOpacity={0.7}>
                <Text style={styles.fiatItemIcon}>🌐</Text>
                <View style={styles.fiatItemInfo}>
                  <Text style={styles.fiatItemTitle}>Transak</Text>
                  <Text style={styles.fiatItemDesc}>Card / Bank → Crypto → Pay · Global coverage</Text>
                </View>
                {activeMethod === 'transak' && paying ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={styles.chevronRight}>›</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.stripeFee}>Fee: ~3.5% · Min: $10 · Multiple payment channels</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Cancel ── */}
      <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 48 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  closeBtn: { fontSize: 20, color: colors.textMuted, padding: 4 },

  // Order Summary
  orderCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  orderTop: { alignItems: 'center', marginBottom: 12 },
  orderLabel: { fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  orderPrice: { fontSize: 28, fontWeight: '900', color: colors.accent, marginTop: 4 },
  orderSkillPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 6,
  },
  orderIcon: { fontSize: 16 },
  orderName: { fontSize: 13, color: colors.textSecondary, maxWidth: 200 },

  // Section wrapper
  sectionWrap: { marginBottom: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionIcon: { fontSize: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionBody: { gap: 8 },

  // BSC TESTNET badge
  testnetBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  testnetText: { fontSize: 9, fontWeight: '800', color: '#b45309', letterSpacing: 0.5 },

  // Crypto method cards
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1.2,
    borderColor: colors.border,
  },
  methodIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodIcon: { fontSize: 20 },
  methodInfo: { flex: 1 },
  methodTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  methodSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  methodPrice: { fontSize: 12, fontWeight: '700' },

  // QR code view
  qrWrap: { marginTop: 12, alignItems: 'center' },
  qrCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 300,
  },
  qrTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 16 },
  qrCodeContainer: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  qrAmount: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginTop: 16 },
  qrChain: { fontSize: 11, color: '#64748b', marginTop: 4 },
  pollingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  pollingText: { fontSize: 12, color: '#6366f1' },
  qrAddress: { fontSize: 10, color: '#94a3b8', marginTop: 8, maxWidth: 250 },

  // OR divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, paddingHorizontal: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginHorizontal: 12 },

  // Accordion
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accordionChevron: { fontSize: 18, fontWeight: '700', color: colors.textMuted },
  accordionTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  accordionBody: { marginTop: 6, marginLeft: 12, gap: 6 },

  secureBadge: {
    backgroundColor: colors.success + '18',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  secureText: { fontSize: 10, fontWeight: '700', color: colors.success },

  // Fiat items
  fiatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fiatItemIcon: { fontSize: 22 },
  fiatItemInfo: { flex: 1 },
  fiatItemTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  fiatItemDesc: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  chevronRight: { fontSize: 18, color: colors.textMuted },

  recommendBadge: {
    backgroundColor: colors.accent + '20',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  recommendText: { fontSize: 8, fontWeight: '800', color: colors.accent, letterSpacing: 0.3 },

  stripeFee: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 8,
  },

  // Cancel
  cancelBtn: { alignItems: 'center', padding: 16, marginTop: 8 },
  cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },

  // Payment Success
  successContainer: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  successEmoji: { fontSize: 64 },
  successTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  successSub: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  successActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  sharePayBtn: {
    backgroundColor: colors.primary + '18',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.primary + '44',
  },
  sharePayBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  sharePosterBtn: {
    backgroundColor: '#f97316' + '18',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#f97316' + '44',
  },
  sharePosterBtnText: { color: '#fb923c', fontWeight: '700', fontSize: 14 },
  successDoneBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingHorizontal: 48,
    paddingVertical: 16,
    marginTop: 12,
  },
  successDoneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
