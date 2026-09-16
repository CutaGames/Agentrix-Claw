/**
 * SkinCheckoutModal — Sprint 1 Task 1.5 (AXP payment for skins).
 *
 * A bottom-sheet style modal that shows skin purchase options:
 *   - USD price (existing flow via installSkin)
 *   - AXP price with discount (calls POST /v1/axp/spend then installSkin)
 *
 * Usage:
 *   <SkinCheckoutModal
 *     visible={showCheckout}
 *     skin={selectedSkin}
 *     onClose={() => setShowCheckout(false)}
 *     onSuccess={() => { ... }}
 *   />
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { SkinListItem } from '../../services/marketSkins.api';
import { fetchAxpBalance, spendAxp } from '../../services/axp.api';
import { installSkin } from '../../services/petSkinMarketplace.api';
import { themedStyles } from '../../theme/useTheme';

interface SkinCheckoutModalProps {
  visible: boolean;
  skin: SkinListItem | null;
  onClose: () => void;
  onSuccess?: () => void;
}

function computeAxpPrice(skin: SkinListItem): number | null {
  if (!skin.axpAccepted || skin.priceUsd == null) return null;
  // 1 AXP ≈ $0.01 → priceUsd * 100 = base AXP cost
  const baseAxp = Math.round(skin.priceUsd * 100);
  const discounted = Math.round(baseAxp * (1 - skin.axpDiscountPercent / 100));
  return discounted;
}

export function SkinCheckoutModal({ visible, skin, onClose, onSuccess }: SkinCheckoutModalProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [paymentMethod, setPaymentMethod] = useState<'usd' | 'axp'>('usd');

  const balanceQuery = useQuery({
    queryKey: ['axp-balance'],
    queryFn: fetchAxpBalance,
    enabled: visible,
    staleTime: 10_000,
  });

  const purchaseMut = useMutation({
    mutationFn: async () => {
      if (!skin) throw new Error('No skin selected');

      if (paymentMethod === 'axp') {
        const axpPrice = computeAxpPrice(skin);
        if (axpPrice == null) throw new Error('AXP not accepted for this skin');

        // Step 1: Spend AXP
        await spendAxp({
          source: 'skin_purchase',
          amount: axpPrice,
          ref_id: skin.id,
          note: `Purchase skin: ${skin.displayName}`,
          metadata: { skinId: skin.id, listingId: skin.listingId },
        });

        // Step 2: Install/claim the skin (backend validates AXP spend)
        const result = await installSkin(skin.id, { payment_method: 'axp' });
        if (result.ok === false) throw new Error(result.error || 'Install failed');
        return result;
      } else {
        // USD payment — existing flow
        const result = await installSkin(skin.id, { payment_method: 'usd' });
        if (result.ok === false) throw new Error(result.error || 'Install failed');
        return result;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['axp-balance'] });
      queryClient.invalidateQueries({ queryKey: ['market-skins'] });
      queryClient.invalidateQueries({ queryKey: ['me-quota'] });
      Alert.alert(
        t({ en: 'Purchase Complete', zh: '购买成功' }),
        t({
          en: `${skin?.displayName} has been added to your wardrobe.`,
          zh: `${skin?.displayName} 已添加到你的衣柜。`,
        }),
      );
      onSuccess?.();
      onClose();
    },
    onError: (e: any) => {
      Alert.alert(
        t({ en: 'Purchase Failed', zh: '购买失败' }),
        e?.message ?? t({ en: 'Unknown error', zh: '未知错误' }),
      );
    },
  });

  if (!skin) return null;

  const axpPrice = computeAxpPrice(skin);
  const balance = balanceQuery.data?.balance ?? 0;
  const canAffordAxp = axpPrice != null && balance >= axpPrice;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View />
      </Pressable>
      <View style={styles.sheet}>
        {/* Header */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>
            {t({ en: 'Purchase Skin', zh: '购买皮肤' })}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Skin info */}
        <View style={styles.skinInfo}>
          <Text style={styles.skinName}>{skin.displayName}</Text>
          <Text style={styles.skinMeta}>
            {skin.format.toUpperCase()} · Clan {skin.clan} · by {skin.creatorUsername}
          </Text>
        </View>

        {/* Payment options */}
        <View style={styles.paymentSection}>
          <Text style={styles.sectionLabel}>
            {t({ en: 'Payment Method', zh: '支付方式' })}
          </Text>

          {/* USD option */}
          <TouchableOpacity
            style={[styles.paymentOption, paymentMethod === 'usd' && styles.paymentOptionActive]}
            onPress={() => setPaymentMethod('usd')}
          >
            <View style={styles.paymentRadio}>
              {paymentMethod === 'usd' && <View style={styles.paymentRadioInner} />}
            </View>
            <View style={styles.paymentInfo}>
              <Text style={styles.paymentLabel}>
                💵 {t({ en: 'Pay with USD', zh: '美元支付' })}
              </Text>
              <Text style={styles.paymentPrice}>
                ${skin.priceUsd?.toFixed(2) ?? '0.00'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* AXP option */}
          {axpPrice != null && (
            <TouchableOpacity
              style={[
                styles.paymentOption,
                paymentMethod === 'axp' && styles.paymentOptionActive,
                !canAffordAxp && styles.paymentOptionDisabled,
              ]}
              onPress={() => canAffordAxp && setPaymentMethod('axp')}
              disabled={!canAffordAxp}
            >
              <View style={styles.paymentRadio}>
                {paymentMethod === 'axp' && <View style={styles.paymentRadioInner} />}
              </View>
              <View style={styles.paymentInfo}>
                <View style={styles.axpLabelRow}>
                  <Text style={styles.paymentLabel}>
                    💎 {t({ en: 'Pay with AXP', zh: 'AXP 支付' })}
                  </Text>
                  {skin.axpDiscountPercent > 0 && (
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountText}>-{skin.axpDiscountPercent}%</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.paymentPrice}>{axpPrice} AXP</Text>
                <Text style={[styles.balanceText, !canAffordAxp && styles.balanceInsufficient]}>
                  {t({ en: 'Balance', zh: '余额' })}: {balance} AXP
                  {!canAffordAxp && ` (${t({ en: 'insufficient', zh: '不足' })})`}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Purchase button */}
        <TouchableOpacity
          style={[styles.purchaseBtn, purchaseMut.isPending && styles.purchaseBtnDisabled]}
          onPress={() => purchaseMut.mutate()}
          disabled={purchaseMut.isPending}
        >
          {purchaseMut.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.purchaseBtnText}>
              {paymentMethod === 'axp'
                ? t({ en: `Pay ${axpPrice} AXP`, zh: `支付 ${axpPrice} AXP` })
                : t({ en: `Pay $${skin.priceUsd?.toFixed(2) ?? '0.00'}`, zh: `支付 $${skin.priceUsd?.toFixed(2) ?? '0.00'}` })}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.bgPrimary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 34,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  closeBtn: { fontSize: 20, color: colors.textMuted, padding: 4 },
  skinInfo: { marginBottom: 20 },
  skinName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  skinMeta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  paymentSection: { marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 10 },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: 10,
  },
  paymentOptionActive: { borderColor: colors.accent, backgroundColor: `${colors.accent}10` },
  paymentOptionDisabled: { opacity: 0.5 },
  paymentRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  paymentRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  paymentInfo: { flex: 1 },
  axpLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paymentLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  paymentPrice: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginTop: 4 },
  balanceText: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  balanceInsufficient: { color: colors.error },
  discountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#7C3AED',
  },
  discountText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  purchaseBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  purchaseBtnDisabled: { opacity: 0.6 },
  purchaseBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
}));
