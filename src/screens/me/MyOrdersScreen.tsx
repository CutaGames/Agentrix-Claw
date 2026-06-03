import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';

const STATUS_COLOR: Record<string, string> = {
  completed: colors.success,
  pending: colors.warning,
  failed: colors.error,
  processing: colors.info,
};

export function MyOrdersScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => apiFetch<any>('/user/orders'),
  });
  const orders = data?.items || data?.data || data || [];

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o: any) => o.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No orders yet.</Text>}
          renderItem={({ item: order }: { item: any }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderId}>#{order.id?.slice(-8)}</Text>
                <Text style={styles.orderItem}>{order.skillName || order.item?.name || 'Order'}</Text>
              </View>
              <View style={styles.orderRight}>
                <Text style={[styles.orderStatus, { color: STATUS_COLOR[order.status] || colors.textMuted }]}>
                  {order.status}
                </Text>
                <Text style={styles.orderAmount}>${order.amount || '—'}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  orderId: { fontSize: 11, color: colors.textMuted, fontFamily: 'monospace' },
  orderItem: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  orderRight: { alignItems: 'flex-end', gap: 4 },
  orderStatus: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  orderAmount: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: 14, marginTop: 40 },
});
