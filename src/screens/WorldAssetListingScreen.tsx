/**
 * WorldAssetListingScreen — Sprint P-8 P2 (2026-05-22).
 *
 * Lets the owner of a world asset list it on the marketplace.
 * Shows the AI-suggested price as a hint, lets the user choose
 * USD or AXP currency and a final price. Submits via
 * POST /v1/marketplace/world-assets/listing.
 *
 * Receives via navigation params:
 *   { assetId: string, assetName?: string }
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import {
  createMarketplaceListing,
  getSuggestedPrice,
  type SuggestedPriceResponse,
} from '../services/worldEngineApi';

interface RouteParams {
  assetId: string;
  assetName?: string;
}

export default function WorldAssetListingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ p: RouteParams }, 'p'>>();
  const { assetId, assetName } = route.params ?? ({} as RouteParams);

  const [suggested, setSuggested] = useState<SuggestedPriceResponse | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(true);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'AXP'>('USD');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await getSuggestedPrice(assetId);
        if (cancelled) return;
        setSuggested(result);
        setPrice(String(result.suggestedPrice.toFixed(2)));
      } catch (err) {
        // Suggestion failure is non-blocking — user can still type a price.
        console.warn('[WorldAssetListing] suggestion fetch failed:', err);
      } finally {
        if (!cancelled) setLoadingSuggestion(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  const handleSubmit = useCallback(async () => {
    const numericPrice = parseFloat(price);
    if (Number.isNaN(numericPrice) || numericPrice <= 0) {
      Alert.alert('请输入合法价格', '价格必须大于 0');
      return;
    }
    if (currency === 'USD' && numericPrice < 0.5) {
      Alert.alert('价格过低', 'USD 价格不能低于 $0.50');
      return;
    }
    if (currency === 'AXP' && numericPrice < 1) {
      Alert.alert('价格过低', 'AXP 价格不能低于 1');
      return;
    }
    setSubmitting(true);
    try {
      await createMarketplaceListing({ assetId, price: numericPrice, currency });
      Alert.alert(
        '上架成功',
        `${assetName || '资产'} 已挂牌 ${currency === 'USD' ? '$' : ''}${numericPrice}${currency === 'AXP' ? ' AXP' : ''}`,
        [{ text: '确定', onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      Alert.alert('上架失败', err?.message || '请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }, [assetId, assetName, price, currency, navigation]);

  return (
    <View style={styles.container} testID="world-asset-listing">
      <Text style={styles.title}>上架出售</Text>
      {assetName ? <Text style={styles.subtitle}>{assetName}</Text> : null}

      {/* Suggested price card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>AI 推荐定价</Text>
        {loadingSuggestion ? (
          <ActivityIndicator color="#6c5ce7" style={{ marginTop: 8 }} />
        ) : suggested ? (
          <>
            <Text style={styles.cardValue}>${suggested.suggestedPrice.toFixed(2)}</Text>
            {suggested.reasoning ? (
              <Text style={styles.cardHint}>{suggested.reasoning}</Text>
            ) : null}
            {suggested.comparable && suggested.comparable.length > 0 ? (
              <Text style={styles.cardHint}>
                参考同类资产: {suggested.comparable.length} 件
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.cardHint}>暂无 AI 推荐价,自行定价即可</Text>
        )}
      </View>

      {/* Currency picker */}
      <Text style={styles.fieldLabel}>结算货币</Text>
      <View style={styles.currencyRow}>
        <TouchableOpacity
          style={[styles.currencyChip, currency === 'USD' && styles.currencyChipActive]}
          onPress={() => setCurrency('USD')}
        >
          <Text style={[styles.currencyText, currency === 'USD' && styles.currencyTextActive]}>
            USD ($)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.currencyChip, currency === 'AXP' && styles.currencyChipActive]}
          onPress={() => setCurrency('AXP')}
        >
          <Text style={[styles.currencyText, currency === 'AXP' && styles.currencyTextActive]}>
            AXP
          </Text>
        </TouchableOpacity>
      </View>

      {/* Price input */}
      <Text style={styles.fieldLabel}>挂牌价格</Text>
      <View style={styles.priceRow}>
        <Text style={styles.priceCurrencyPrefix}>
          {currency === 'USD' ? '$' : ''}
        </Text>
        <TextInput
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="#666"
          style={styles.priceInput}
        />
        {currency === 'AXP' ? <Text style={styles.priceSuffix}> AXP</Text> : null}
      </View>

      <Text style={styles.feeNote}>
        平台抽成 30%(原始创建者一级出售免抽成,Phase 1 实施中)
      </Text>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
          disabled={submitting}
        >
          <Text style={styles.cancelBtnText}>取消</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={submitting}
          testID="world-asset-listing-submit"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>上架</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 28,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  cardLabel: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 6,
  },
  cardValue: {
    color: '#6c5ce7',
    fontSize: 28,
    fontWeight: '700',
  },
  cardHint: {
    color: '#888',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  fieldLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  currencyRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  currencyChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
  },
  currencyChipActive: {
    backgroundColor: '#6c5ce7',
  },
  currencyText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  currencyTextActive: {
    color: '#fff',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  priceCurrencyPrefix: {
    color: '#888',
    fontSize: 18,
  },
  priceInput: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    paddingVertical: 14,
  },
  priceSuffix: {
    color: '#888',
    fontSize: 14,
  },
  feeNote: {
    color: '#666',
    fontSize: 11,
    marginBottom: 32,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#222',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#aaa',
    fontSize: 14,
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#6c5ce7',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
