import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import type { MarketStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MarketStackParamList, 'Checkout'>;
type RouteT = RouteProp<MarketStackParamList, 'Checkout'>;

export function CheckoutScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { skillId, skillName } = route.params;
  const [paying, setPaying] = useState(false);

  const { data: skill } = useQuery({
    queryKey: ['skill', skillId],
    queryFn: () => apiFetch<any>(`/skills/${skillId}`),
    enabled: !!skillId,
  });

  const handlePay = async (method: 'stripe' | 'x402' | 'transak') => {
    setPaying(true);
    try {
      const order = await apiFetch<any>('/skills/purchase', {
        method: 'POST',
        body: JSON.stringify({ skillId, paymentMethod: method }),
      });
      if (order?.checkoutUrl) {
        Alert.alert('Payment', 'Redirecting to payment...');
      } else if (order?.success) {
        Alert.alert('✅ Success!', 'Skill purchased and ready to install!');
        navigation.goBack();
      }
    } catch (e: any) {
      Alert.alert('Payment Failed', e?.message || 'Could not process payment');
    } finally {
      setPaying(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Checkout</Text>

      {/* Order Summary */}
      <View style={styles.orderCard}>
        <Text style={styles.orderIcon}>{skill?.icon || '⚡'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderName}>{skillName || skill?.name}</Text>
          <Text style={styles.orderMeta}>One-time purchase</Text>
        </View>
        <Text style={styles.orderPrice}>${skill?.price || '—'}</Text>
      </View>

      {/* Payment Methods */}
      <Text style={styles.sectionTitle}>Choose Payment Method</Text>

      <TouchableOpacity style={styles.payBtn} onPress={() => handlePay('stripe')} disabled={paying}>
        <Text style={styles.payBtnEmoji}>💳</Text>
        <View>
          <Text style={styles.payBtnTitle}>Credit / Debit Card</Text>
          <Text style={styles.payBtnSub}>Visa, Mastercard, etc.</Text>
        </View>
        {paying ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.arrow}>›</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.payBtn} onPress={() => handlePay('transak')} disabled={paying}>
        <Text style={styles.payBtnEmoji}>🏦</Text>
        <View>
          <Text style={styles.payBtnTitle}>Bank / Crypto (Transak)</Text>
          <Text style={styles.payBtnSub}>Pay with crypto or bank transfer</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.payBtn} onPress={() => handlePay('x402')} disabled={paying}>
        <Text style={styles.payBtnEmoji}>⚡</Text>
        <View>
          <Text style={styles.payBtnTitle}>X402 (Agent Payment)</Text>
          <Text style={styles.payBtnSub}>Instant crypto, agent-native</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  orderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
  orderIcon: { fontSize: 32 },
  orderName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  orderMeta: { fontSize: 12, color: colors.textMuted },
  orderPrice: { fontSize: 20, fontWeight: '800', color: colors.accent },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  payBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
  payBtnEmoji: { fontSize: 28 },
  payBtnTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  payBtnSub: { fontSize: 12, color: colors.textMuted },
  arrow: { fontSize: 22, color: colors.textMuted, marginLeft: 'auto' },
  cancelBtn: { alignItems: 'center', padding: 14 },
  cancelBtnText: { color: colors.textMuted, fontSize: 14 },
});
