// 未激活身份页面
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../Card';
import { PrimaryButton } from '../PrimaryButton';
import { colors } from '../../theme/colors';
import { IdentityType } from '../../types/identity';

interface Props {
  identity: IdentityType;
  isPending: boolean;
  onActivate: () => void;
}

const identityConfig = {
  merchant: {
    icon: '🏪',
    title: 'Merchant',
    features: [
      '✓ Manage commission plans',
      '✓ Generate payment links / QR codes',
      '✓ View settlement ledger',
      '✓ Analytics & reports',
    ],
  },
  developer: {
    icon: '💻',
    title: 'Developer',
    features: [
      '✓ Accept orders & earn',
      '✓ Manage budget pools & milestones',
      '✓ Publish Skills to marketplace',
      '✓ Participate in task market',
    ],
  },
};

export const LockedIdentityContent: React.FC<Props> = ({ 
  identity, 
  isPending, 
  onActivate 
}) => {
  const config = identityConfig[identity as keyof typeof identityConfig];

  if (!config) return null;

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <View style={styles.lockContainer}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.title}>{config.title} — Not Activated</Text>
        </View>

        {isPending ? (
          <View style={styles.pendingContainer}>
            <Text style={styles.pendingIcon}>⏳</Text>
            <Text style={styles.pendingTitle}>Under Review</Text>
            <Text style={styles.pendingDesc}>
              Your {config.title} application is being reviewed. Expected 1-2 business days.
            </Text>
            <Text style={styles.pendingTip}>
              Once approved, both App and Web will be activated.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Activate {config.title} to unlock:
            </Text>
            <View style={styles.featureList}>
              {config.features.map((feature, index) => (
                <Text key={index} style={styles.feature}>{feature}</Text>
              ))}
            </View>
            <PrimaryButton 
              title="Apply to Activate" 
              onPress={onActivate}
            />
            <Text style={styles.syncTip}>
              Applied on Web? App syncs automatically
            </Text>
          </>
        )}
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  card: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  lockContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  featureList: {
    alignSelf: 'stretch',
    marginBottom: 24,
  },
  feature: {
    color: colors.text,
    fontSize: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  syncTip: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
  },
  // 审核中状态
  pendingContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  pendingIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  pendingTitle: {
    color: '#f59e0b',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  pendingDesc: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  pendingTip: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
  },
});
