import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { commerceApi } from '../services/commerce';
import { Settlement } from '../types/commerce';
import { Card } from '../components/Card';
import { ListItem } from '../components/ListItem';
import { colors } from '../theme/colors';

export const SettlementsScreen: React.FC = () => {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await commerceApi.getSettlements();
        setSettlements(data || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Settlements</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>
          {loading ? 'Loading...' : `${settlements.length} settlements`}
        </Text>
      </Card>

      <Card>
        {settlements.map((s) => (
          <ListItem
            key={s.id}
            title={`Order ${s.orderId || 'N/A'}`}
            subtitle={`${s.currency} · ${s.status}`}
            right={<Text style={{ color: colors.primary }}>{s.totalAmount}</Text>}
          />
        ))}
        {!loading && settlements.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text style={{ color: colors.muted }}>No settlements found.</Text>
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
};