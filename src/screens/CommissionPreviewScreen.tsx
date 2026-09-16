import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { commerceApi } from '../services/commerce';

export const CommissionPreviewScreen: React.FC = () => {
  const [amount, setAmount] = useState('100');
  const [currency, setCurrency] = useState('USD');
  const [result, setResult] = useState<any>(null);

  const preview = async () => {
    const res = await commerceApi.previewAllocation({
      amount: Number(amount),
      currency,
    });
    setResult(res);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Commission Preview</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>
          Simulate allocation for a transaction.
        </Text>
      </Card>

      <Card>
        <Text style={{ color: colors.muted, marginBottom: 6 }}>Amount</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          style={{
            backgroundColor: colors.cardAlt,
            color: colors.text,
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
        <View style={{ height: 10 }} />
        <Text style={{ color: colors.muted, marginBottom: 6 }}>Currency</Text>
        <TextInput
          value={currency}
          onChangeText={setCurrency}
          style={{
            backgroundColor: colors.cardAlt,
            color: colors.text,
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
        <View style={{ height: 12 }} />
        <PrimaryButton title="Preview" onPress={preview} />
      </Card>

      {result ? (
        <Card>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Result</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>
            Gross: {result.grossAmount} {result.currency}
          </Text>
          <Text style={{ color: colors.muted }}>
            Fees: {result.fees?.totalFees ?? 0}
          </Text>
          <Text style={{ color: colors.muted }}>
            Net: {result.merchantNet ?? result.netAmount}
          </Text>
          <View style={{ height: 8 }} />
          {result.allocations?.map((a: any, idx: number) => (
            <Text key={idx} style={{ color: colors.text }}>
              • {a.role}: {a.amount}
            </Text>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
};