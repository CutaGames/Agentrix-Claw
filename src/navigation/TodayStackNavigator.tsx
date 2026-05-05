import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';
import { HomeScreen } from '../screens/HomeScreen';
import { PetCompanionScreen } from '../screens/pet/PetCompanionScreen';
import { PlanApprovalScreen } from '../screens/plan/PlanApprovalScreen';

// P0-W2-1 Today tab — Living Companion entry (PRD mobile-prd-v3 §4.1.1)
export type TodayStackParamList = {
  Today: undefined;
  PetCompanion: undefined;
  PlanApproval: undefined;
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
      <Stack.Screen
        name="PetCompanion"
        component={PetCompanionScreen}
        options={{ title: t({ en: 'Pet Companion', zh: '主宠陪伴' }) }}
      />
      <Stack.Screen
        name="PlanApproval"
        component={PlanApprovalScreen}
        options={{ title: t({ en: 'Approvals', zh: '待审批' }) }}
      />
    </Stack.Navigator>
  );
}
