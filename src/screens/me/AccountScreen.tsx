import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import type { MeStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MeStackParamList>;

export function AccountScreen() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<Nav>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email || '—'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Agentrix ID</Text>
        <Text style={styles.value}>{user?.agentrixId || '—'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Wallet</Text>
        <Text style={styles.value}>{user?.walletAddress || '—'}</Text>
      </View>
      <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('WalletBackup')}>
        <Text style={styles.actionLabel}>🔐 MPC Wallet Backup</Text>
        <Text style={styles.actionChevron}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
  card: { backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, gap: 4, borderWidth: 1, borderColor: colors.border },
  label: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 15, color: colors.textPrimary },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  actionLabel: { fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
  actionChevron: { fontSize: 20, color: colors.textMuted },
});
