import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';
import { HomeScreen } from '../screens/HomeScreen';

// P0-W2-1 Today tab — Living Companion entry (PRD mobile-prd-v3 §4.1.1)
// Currently hosts HomeScreen as the "Today" landing; future iterations will add
// pet companion card, focus tasks, and quick actions.
export type TodayStackParamList = {
  Today: undefined;
};

const Stack = createNativeStackNavigator<TodayStackParamList>();

export function TodayStackNavigator() {
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
        name="Today"
        component={HomeScreen}
        options={{ title: t({ en: 'Today', zh: '今日' }) }}
      />
    </Stack.Navigator>
  );
}
