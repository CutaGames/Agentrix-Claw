import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';
import { AssetsScreen } from '../screens/AssetsScreen';
import { WalletDashboardScreen } from '../screens/wallet/WalletDashboardScreen';
import { PayMpcDemoScreen } from '../screens/wallet/PayMpcDemoScreen';

// P0-W2-1 Wallet tab — financial center (PRD mobile-prd-v3 §4.1.4)
export type WalletStackParamList = {
  Wallet: undefined;
  Assets: undefined;
  PayMpcDemo: undefined;
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
        component={WalletDashboardScreen}
        options={{ title: t({ en: 'Wallet', zh: '钱包' }) }}
      />
      <Stack.Screen
        name="Assets"
        component={AssetsScreen}
        options={{ title: t({ en: 'Assets', zh: '资产' }) }}
      />
      <Stack.Screen
        name="PayMpcDemo"
        component={PayMpcDemoScreen}
        options={{ title: t({ en: 'Pay (BSC)', zh: 'BSC 支付' }) }}
      />
    </Stack.Navigator>
  );
}
