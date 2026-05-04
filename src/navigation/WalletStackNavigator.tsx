import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';
import { AssetsScreen } from '../screens/AssetsScreen';

// P0-W2-1 Wallet tab — financial center (PRD mobile-prd-v3 §4.1.4)
export type WalletStackParamList = {
  Wallet: undefined;
};

const Stack = createNativeStackNavigator<WalletStackParamList>();

export function WalletStackNavigator() {
  const { t } = useI18n();
  return (
    <Stack.Navigator
      id={undefined}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgPrimary },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="Wallet"
        component={AssetsScreen}
        options={{ title: t({ en: 'Wallet', zh: '钱包' }) }}
      />
    </Stack.Navigator>
  );
}
