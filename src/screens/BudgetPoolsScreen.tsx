import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { commerceApi } from '../services/commerce';
import { BudgetPool } from '../types/commerce';
import { Card } from '../components/Card';
import { ListItem } from '../components/ListItem';
import { colors } from '../theme/colors';

export const BudgetPoolsScreen: React.FC = () => {
  const [pools, setPools] = useState<BudgetPool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await commerceApi.getBudgetPools();
        setPools(data || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Budget Pools</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>
          {loading ? 'Loading...' : `${pools.length} pools`}
        </Text>
      </Card>

      <Card>
        {pools.map((pool) => (
          <ListItem
            key={pool.id}
            title={pool.name}
            subtitle={`${pool.currency} · ${pool.status}`}
            right={<Text style={{ color: colors.primary }}>{pool.funded}/{pool.totalBudget}</Text>}
          />
        ))}
        {!loading && pools.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text style={{ color: colors.muted }}>No budget pools found.</Text>
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
};