import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { commerceApi } from '../services/commerce';
import { SplitPlan } from '../types/commerce';
import { Card } from '../components/Card';
import { ListItem } from '../components/ListItem';
import { colors } from '../theme/colors';

export const SplitPlansScreen: React.FC = () => {
  const [plans, setPlans] = useState<SplitPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await commerceApi.getSplitPlans();
        setPlans(data || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Split Plans</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>
          {loading ? 'Loading...' : `${plans.length} plans`}
        </Text>
      </Card>

      <Card>
        {plans.map((plan) => (
          <ListItem
            key={plan.id}
            title={plan.name}
            subtitle={`${plan.productType} · ${plan.status}`}
            right={<Text style={{ color: colors.primary }}>{(plan.feeConfig?.splitFeeBps || 0) / 100}%</Text>}
          />
        ))}
        {!loading && plans.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text style={{ color: colors.muted }}>No split plans found.</Text>
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
};