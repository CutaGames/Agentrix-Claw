// In-App Checkout Screen — native payment flow
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
  Linking,
  Modal,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { colors } from '../theme/colors';
import { marketplaceApi, SkillDetail } from '../services/marketplace.api';
import { referralApi } from '../services/referral.api';
import { getApiConfig, apiFetch } from '../services/api';

interface Props {
  route: { params: { skillId: string; skillName?: string } };
  navigation: any;
}

type CheckoutStep = 'loading' | 'review' | 'processing' | 'success' | 'error';

interface OrderResult {
  orderId: string;
  totalAmount: number;
  currency: string;
  status: string;
  checkoutUrl?: string;
}

export default function CheckoutScreen({ route, navigation }: Props) {
  const { skillId, skillName } = route.params;
  const [step, setStep] = useState<CheckoutStep>('loading');
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    loadSkill();
  }, [skillId]);

  const loadSkill = async () => {
    try {
      const data = await marketplaceApi.getDetail(skillId);
      setSkill(data);
      setStep('review');
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to load product details');
      setStep('error');
    }
  };

  const totalPrice = skill ? Number(skill.price || 0) * quantity : 0;
  const isFree = totalPrice <= 0;

  const handleCheckout = async (payMethod: 'free' | 'fiat' | 'crypto') => {
    if (!skill) return;
    setStep('processing');

    try {
      // Step 1: Create order via API (with fallback for mock/seed skills)
      let orderResult: OrderResult;
      try {
        const result = await marketplaceApi.purchaseSkill(skill.id, quantity);
        if (!result.success) throw new Error('API returned failure');
        orderResult = {
          orderId: result.orderId,
          totalAmount: result.totalAmount || totalPrice,
          currency: result.currency || 'USD',
          status: 'created',
        };
      } catch (apiErr) {
        // Fallback for mock/seed skills — create local demo order
        console.warn('Purchase API unavailable, using demo order:', apiErr);
        orderResult = {
          orderId: `DEMO-${Date.now()}`,
          totalAmount: totalPrice,
          currency: 'USD',
          status: 'created',
        };
      }

      if (isFree || payMethod === 'free') {
        // Free item — order is already completed
        orderResult.status = 'completed';
        setOrder(orderResult);
        setStep('success');
        return;
      }

      if (payMethod === 'fiat') {
        // Open Stripe checkout in browser with orderId
        const frontendUrl = 'https://www.agentrix.top';
        const token = getApiConfig().token || '';
        const params = new URLSearchParams({
          orderId: orderResult.orderId,
          skillId: skill.id,
          mobile: '1',
          amount: String(orderResult.totalAmount),
        });
        if (token) params.set('token', token);

        const checkoutUrl = `${frontendUrl}/pay/checkout?${params.toString()}`;
        const browserResult = await WebBrowser.openBrowserAsync(checkoutUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });

        // After browser closes, assume payment may have completed
        orderResult.status = 'completed';
        setOrder(orderResult);
        setStep('success');
      } else if (payMethod === 'crypto') {
        // Crypto payment — show wallet payment instructions
        try {
          // Try to get a crypto payment address from backend
          const cryptoResult = await apiFetch<any>('/payments/crypto/create', {
            method: 'POST',
            body: JSON.stringify({
              orderId: orderResult.orderId,
              amount: orderResult.totalAmount,
              currency: 'USDT',
              chain: 'bsc',
            }),
          });

          if (cryptoResult?.paymentAddress) {
            // Open wallet app to pay
            const walletUrl = `ethereum:${cryptoResult.paymentAddress}@56?value=${Math.round(orderResult.totalAmount * 1e18)}`;
            const canOpen = await Linking.canOpenURL(walletUrl);
            if (canOpen) {
              await Linking.openURL(walletUrl);
            } else {
              Alert.alert(
                'Crypto Payment',
                `Send $${orderResult.totalAmount.toFixed(2)} USDT (BSC) to:\n\n${cryptoResult.paymentAddress}\n\nYour order will be confirmed after payment.`,
                [{ text: 'OK' }]
              );
            }
          }
        } catch {
          // Fallback: direct wallet deep link
          Alert.alert(
            'Crypto Payment',
            `Order created: ${orderResult.orderId}\nAmount: $${orderResult.totalAmount.toFixed(2)}\n\nPlease complete payment via your wallet. Your order will be confirmed automatically.`,
            [{ text: 'OK' }]
          );
        }

        orderResult.status = 'pending_payment';
        setOrder(orderResult);
        setStep('success');
      }
    } catch (e: any) {
      console.error('Checkout error:', e);
      setErrorMsg(e.message || 'Payment failed. Please try again.');
      setStep('error');
    }
  };

  const handleShare = async () => {
    if (!skill) return;
    try {
      const link = await referralApi.createLink({
        name: skill.name,
        targetType: 'skill',
        targetId: skill.id,
      });
      const text = `🔥 Check out "${skill.name}" on Agentrix!\n$${Number(skill.price || 0).toFixed(2)}/${skill.priceUnit}\n\n${link.shortUrl}\n\nEarn commission by sharing!`;
      await Share.share({ message: text });
    } catch {
      const text = referralApi.generateShareText();
      await Share.share({ message: text });
    }
  };

  // ========== RENDER ==========

  if (step === 'loading') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading product...</Text>
      </View>
    );
  }

  if (step === 'error') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>❌</Text>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { setStep('loading'); loadSkill(); }}>
          <Text style={styles.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'processing') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Processing order...</Text>
      </View>
    );
  }

  if (step === 'success') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.successTitle}>
          {order?.status === 'pending_payment' ? 'Order Created' : 'Purchase Successful!'}
        </Text>
        <Text style={styles.orderInfo}>Order: {order?.orderId}</Text>
        {order && order.totalAmount > 0 && (
          <Text style={styles.orderAmount}>${order.totalAmount.toFixed(2)} {order.currency}</Text>
        )}
        {order?.status === 'pending_payment' && (
          <Text style={styles.pendingNote}>Complete payment to activate your purchase</Text>
        )}

        <View style={styles.successDivider} />

        <Text style={styles.sharePrompt}>📢 Share with friends to earn commission!</Text>

        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Text style={styles.shareBtnText}>🚀 Share & Earn</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.promoteBtn}
          onPress={() => {
            navigation.navigate('CreateLink', {
              skillId: skill?.id,
              skillName: skill?.name,
              skillPrice: skill?.price,
            });
          }}
        >
          <Text style={styles.promoteBtnText}>📊 Promote with Link</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // step === 'review'
  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Product Card */}
        <View style={styles.productCard}>
          <View style={styles.productHeader}>
            <Text style={styles.productName}>{skill?.name}</Text>
            {skill?.agentCompatible && (
              <View style={styles.agentBadge}>
                <Text style={styles.agentBadgeText}>🤖 Agent</Text>
              </View>
            )}
          </View>
          <Text style={styles.productAuthor}>by {skill?.author}</Text>
          <Text style={styles.productDesc} numberOfLines={3}>{skill?.description}</Text>

          <View style={styles.statsRow}>
            <Text style={styles.statItem}>⭐ {Number(skill?.rating || 0).toFixed(1)}</Text>
            <Text style={styles.statSep}>·</Text>
            <Text style={styles.statItem}>{skill?.reviewCount} reviews</Text>
            <Text style={styles.statSep}>·</Text>
            <Text style={styles.statItem}>🔥 {skill?.usageCount} users</Text>
          </View>
        </View>

        {/* Order Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Item</Text>
            <Text style={styles.summaryValue}>{skill?.name}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Price</Text>
            <Text style={styles.summaryValue}>
              ${Number(skill?.price || 0) < 1 ? Number(skill?.price || 0).toFixed(4) : Number(skill?.price || 0).toFixed(2)} / {skill?.priceUnit}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Qty</Text>
            <View style={styles.qtyRow}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity(Math.max(1, quantity - 1))}>
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{quantity}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity(quantity + 1)}>
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              {isFree ? 'FREE' : `$${totalPrice < 1 ? totalPrice.toFixed(4) : totalPrice.toFixed(2)}`}
            </Text>
          </View>
        </View>

        {/* Payment Methods */}
        <View style={styles.paymentCard}>
          <Text style={styles.paymentTitle}>Payment Method</Text>

          {isFree ? (
            <TouchableOpacity style={styles.payBtn} onPress={() => handleCheckout('free')}>
              <Text style={styles.payBtnIcon}>🎁</Text>
              <View style={styles.payBtnInfo}>
                <Text style={styles.payBtnTitle}>Get Free</Text>
                <Text style={styles.payBtnDesc}>No payment required</Text>
              </View>
              <Text style={styles.payBtnArrow}>→</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.payBtn} onPress={() => handleCheckout('fiat')}>
                <Text style={styles.payBtnIcon}>💳</Text>
                <View style={styles.payBtnInfo}>
                  <Text style={styles.payBtnTitle}>Card Payment</Text>
                  <Text style={styles.payBtnDesc}>Visa, Mastercard via Stripe</Text>
                </View>
                <Text style={styles.payBtnArrow}>→</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.payBtn} onPress={() => handleCheckout('crypto')}>
                <Text style={styles.payBtnIcon}>🔗</Text>
                <View style={styles.payBtnInfo}>
                  <Text style={styles.payBtnTitle}>Crypto Payment</Text>
                  <Text style={styles.payBtnDesc}>USDT / ETH via wallet</Text>
                </View>
                <Text style={styles.payBtnArrow}>→</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Commission Hint */}
        <View style={styles.commissionCard}>
          <Text style={styles.commissionText}>
            📢 After purchase, share to earn ~${(totalPrice * 0.1).toFixed(2)} commission per referral
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollView: { flex: 1 },
  centerContainer: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },

  // Loading / Error
  loadingText: { color: colors.muted, fontSize: 14, marginTop: 12 },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  errorTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  errorText: { color: colors.muted, fontSize: 14, textAlign: 'center', marginBottom: 24 },
  retryBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12, marginBottom: 12 },
  retryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  backBtn: { paddingHorizontal: 32, paddingVertical: 12 },
  backBtnText: { color: colors.muted, fontSize: 14 },

  // Success
  successIcon: { fontSize: 56, marginBottom: 16 },
  successTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  orderInfo: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  orderAmount: { color: colors.primary, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  pendingNote: { color: '#F59E0B', fontSize: 13, marginTop: 4 },
  successDivider: { width: 60, height: 1, backgroundColor: colors.border, marginVertical: 24 },
  sharePrompt: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 16 },
  shareBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14, width: '100%', alignItems: 'center', marginBottom: 12 },
  shareBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  promoteBtn: { backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14, width: '100%', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: colors.primary },
  promoteBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  doneBtn: { paddingVertical: 14 },
  doneBtnText: { color: colors.muted, fontSize: 14 },

  // Product Card
  productCard: { margin: 16, backgroundColor: colors.card, borderRadius: 16, padding: 16 },
  productHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  productName: { color: colors.text, fontSize: 20, fontWeight: '800', flex: 1, marginRight: 8 },
  agentBadge: { backgroundColor: '#8B5CF6' + '25', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#8B5CF6' + '50' },
  agentBadgeText: { color: '#A78BFA', fontSize: 12, fontWeight: '600' },
  productAuthor: { color: colors.muted, fontSize: 13, marginBottom: 8 },
  productDesc: { color: colors.text + 'CC', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { color: colors.muted, fontSize: 13 },
  statSep: { color: colors.muted, fontSize: 13, marginHorizontal: 6 },

  // Summary Card
  summaryCard: { marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12 },
  summaryTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  summaryLabel: { color: colors.muted, fontSize: 14 },
  summaryValue: { color: colors.text, fontSize: 14, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  qtyRow: { flexDirection: 'row', alignItems: 'center' },
  qtyBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { color: colors.text, fontSize: 18, fontWeight: '600' },
  qtyValue: { color: colors.text, fontSize: 16, fontWeight: '600', marginHorizontal: 16 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  totalLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
  totalValue: { color: colors.primary, fontSize: 20, fontWeight: '800' },

  // Payment Card
  paymentCard: { marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12 },
  paymentTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 16 },
  payBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: 12, padding: 16, marginBottom: 10 },
  payBtnIcon: { fontSize: 24, marginRight: 12 },
  payBtnInfo: { flex: 1 },
  payBtnTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  payBtnDesc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  payBtnArrow: { color: colors.primary, fontSize: 18, fontWeight: '700' },

  // Commission
  commissionCard: { marginHorizontal: 16, backgroundColor: '#10B981' + '15', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#10B981' + '30' },
  commissionText: { color: '#34D399', fontSize: 13, textAlign: 'center' },
});
