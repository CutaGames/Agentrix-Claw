/**
 * AeonStoreScreen — 商家店铺(地块 POI 接 marketplace 商品)。
 *
 * 从地图/拜访页点商家地块的「🛒 进店」进来:拉该商家(merchantUserId)在 marketplace 的在售商品,
 * 货架展示。点商品 → 详情 + "下单购买"(走真实 /orders 订单流程,创建订单后提示)。
 *
 * 这把"游戏里的店铺"和"真实 marketplace 商品"打通:商家入驻地块 = 把自己的真实商品摆上货架,
 * 到访者可直接下单。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image, Alert,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { listMerchantProducts, createProductOrder, formatPrice, type ProductSummary } from '../../services/productApi';
import type { WorldStackParamList } from '../../navigation/WorldStackNavigator';
import { themedStyles } from '../../theme/useTheme';

type Rt = RouteProp<WorldStackParamList, 'AeonStore'>;

export default function AeonStoreScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<Rt>();
  const { merchantUserId, storeName } = route.params;
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);

  const load = useCallback(async () => {
    try {
      setProducts(await listMerchantProducts(merchantUserId));
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [merchantUserId]);

  useEffect(() => { void load(); }, [load]);

  const placeOrder = useCallback(async (p: ProductSummary) => {
    try {
      setOrdering(true);
      const order = await createProductOrder(p);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('下单成功', `订单已创建(${formatPrice(p)})。可在「我的订单」查看与支付。`, [{ text: '好的' }]);
      return order;
    } catch (e: any) {
      Alert.alert('下单失败', e?.message || '请稍后再试');
    } finally {
      setOrdering(false);
    }
  }, []);

  const onProduct = useCallback(
    (p: ProductSummary) => {
      Alert.alert(
        p.name,
        `${p.description || ''}\n\n价格:${formatPrice(p)}`,
        [
          { text: '关闭', style: 'cancel' },
          { text: '🛒 下单购买', onPress: () => void placeOrder(p) },
        ],
      );
    },
    [placeOrder],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹ 返回</Text></TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>🏪 {storeName || '店铺'}</Text>
        <View style={{ minWidth: 56 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : products.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyText}>这家店还没有上架商品。商家可在「商家后台/创建商品」上货,这里就会显示。</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingVertical: 12, gap: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => onProduct(item)} activeOpacity={0.8} disabled={ordering}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.cardImg} resizeMode="cover" />
              ) : (
                <View style={[styles.cardImg, styles.cardImgPlaceholder]}><Text style={{ fontSize: 28 }}>📦</Text></View>
              )}
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.cardPrice}>{formatPrice(item)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  back: { minWidth: 56 }, backText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  card: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', maxWidth: '48%' },
  cardImg: { width: '100%', height: 120, backgroundColor: colors.bgSecondary },
  cardImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardName: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', paddingHorizontal: 10, paddingTop: 8 },
  cardPrice: { color: colors.accent, fontSize: 14, fontWeight: '800', paddingHorizontal: 10, paddingTop: 2, paddingBottom: 10 },
}));
