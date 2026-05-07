import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';
import { HomeScreen } from '../screens/HomeScreen';
import { PetCompanionScreen } from '../screens/pet/PetCompanionScreen';
import { WardrobeScreen } from '../screens/pet/WardrobeScreen';
import { SkinMarketplaceScreen } from '../screens/pet/SkinMarketplaceScreen';
import { BreedScreen } from '../screens/pet/BreedScreen';
import SoulPickerScreen from '../screens/pet/SoulPickerScreen';
import { PlanApprovalScreen } from '../screens/plan/PlanApprovalScreen';

// P0-W2-1 Today tab — Living Companion entry (PRD mobile-prd-v3 §4.1.1)
export type TodayStackParamList = {
  Today: undefined;
  PetCompanion: undefined;
  Wardrobe: undefined;
  SkinMarketplace: undefined;
  Breed: undefined;
  SoulPicker: undefined;
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
        name="Wardrobe"
        component={WardrobeScreen}
        options={{ title: t({ en: 'Wardrobe', zh: '主宠衣柜' }) }}
      />
      <Stack.Screen
        name="SkinMarketplace"
        component={SkinMarketplaceScreen}
        options={{ title: t({ en: 'Skin Marketplace', zh: '皮肤市场' }) }}
      />
      <Stack.Screen
        name="Breed"
        component={BreedScreen}
        options={{ title: t({ en: 'Breed Pet', zh: '双图繁殖' }) }}
      />
      <Stack.Screen
        name="SoulPicker"
        component={SoulPickerScreen}
        options={{ title: t({ en: 'Switch Soul', zh: '切换灵魂' }) }}
      />
      <Stack.Screen
        name="PlanApproval"
        component={PlanApprovalScreen}
        options={{ title: t({ en: 'Approvals', zh: '待审批' }) }}
      />
    </Stack.Navigator>
  );
}
