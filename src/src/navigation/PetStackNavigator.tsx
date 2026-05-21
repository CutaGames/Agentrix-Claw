/**
 * PetStackNavigator — V4 mobile Pet tab (PRD mobile-prd-v4 §2.1 / §4).
 *
 * Hub screen 内部聚合 6 个子页：Companion / Creator / Wardrobe / SoulPicker /
 * Breed / SkinMarketplace。后续 V5 会再加摄像头扫描入口。
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';
import { PetHubScreen } from '../screens/pet/PetHubScreen';
import { PetCreatorScreen } from '../screens/pet/PetCreatorScreen';
import { PetCompanionScreen } from '../screens/pet/PetCompanionScreen';
import { WardrobeScreen } from '../screens/pet/WardrobeScreen';
import { SoulPickerScreen } from '../screens/pet/SoulPickerScreen';
import { BreedScreen } from '../screens/pet/BreedScreen';
import { SkinMarketplaceScreen } from '../screens/pet/SkinMarketplaceScreen';
import { PetTeamScreen } from '../screens/pet/PetTeamScreen';
import { NfcRedeemScreen } from '../screens/pet/NfcRedeemScreen';

export type PetStackParamList = {
  PetHub: undefined;
  PetCreator: undefined;
  PetCompanion: undefined;
  Wardrobe: undefined;
  SoulPicker: undefined;
  Breed: undefined;
  SkinMarketplace: undefined;
  PetTeam: undefined;
  NfcRedeem: undefined;
};

const Stack = createNativeStackNavigator<PetStackParamList>();

export function PetStackNavigator() {
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
        name="PetHub"
        component={PetHubScreen}
        options={{ title: t({ en: 'Pet', zh: '萌宠' }), headerShown: false }}
      />
      <Stack.Screen
        name="PetCreator"
        component={PetCreatorScreen}
        options={{ title: t({ en: 'Create Pet', zh: '生成萌宠' }) }}
      />
      <Stack.Screen
        name="PetCompanion"
        component={PetCompanionScreen}
        options={{ title: t({ en: 'My Pet', zh: '我的萌宠' }) }}
      />
      <Stack.Screen
        name="Wardrobe"
        component={WardrobeScreen}
        options={{ title: t({ en: 'Wardrobe', zh: '衣柜' }) }}
      />
      <Stack.Screen
        name="SoulPicker"
        component={SoulPickerScreen}
        options={{ title: t({ en: 'Soul Picker', zh: '灵魂切换' }) }}
      />
      <Stack.Screen
        name="Breed"
        component={BreedScreen}
        options={{ title: t({ en: 'Breed', zh: '繁殖' }) }}
      />
      <Stack.Screen
        name="SkinMarketplace"
        component={SkinMarketplaceScreen}
        options={{ title: t({ en: 'Skin Market', zh: '皮肤市场' }) }}
      />
      <Stack.Screen
        name="PetTeam"
        component={PetTeamScreen}
        options={{ title: t({ en: 'Pet Team', zh: '萌宠团队' }) }}
      />
      <Stack.Screen
        name="NfcRedeem"
        component={NfcRedeemScreen}
        options={{ title: t({ en: 'NFC Blind Box', zh: 'NFC 盲盒' }) }}
      />
    </Stack.Navigator>
  );
}
