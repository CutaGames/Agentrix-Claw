/**
 * WorldStackNavigator — 🌍 World Tab (P-9 Companion Redesign T2.1).
 *
 * Hosts the World Engine主战场 + the "create digital character" flows
 * that used to live in the deleted HomeStack drawer. Spec R3, R11.7.
 *
 * Screens (all already shipped, only re-mounted here):
 *   - WorldRoot                    (NEW: WorldHubScreen, this commit)
 *   - WorldEngineScannerScreen     (Phase 1 v5)
 *   - WorldAssetInventoryScreen    (Phase 1 v5)
 *   - WorldBattleArenaScreen       (Phase 1 v5)
 *   - WorldBattlePickerScreen      (Phase 1 v5)
 *   - WorldDungeonExplorerScreen   (Phase 1 v5)
 *   - WorldAssetListingScreen      (Phase 1 v5)
 *   - ReconstructionProgressScreen (Phase 1 v5)
 *   - PetCreatorScreen             (moved from HomeStack/PetStack)
 *   - CameraScanScreen             (moved from PetStack — "Photo→3D Pet")
 *   - WorldAssetMarketplaceScreen  (NEW stub; Phase 2 fills in)
 */
import React from 'react';
import { View, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';

import { WorldHubScreen } from '../screens/world/WorldHubScreen';
import WorldFeedScreen from '../screens/world/WorldFeedScreen';
import WorldCharacterCardScreen from '../screens/world/WorldCharacterCardScreen';
import WorldEngineScannerScreen from '../screens/WorldEngineScannerScreen';
import WorldAssetInventoryScreen from '../screens/WorldAssetInventoryScreen';
import ReconstructionProgressScreen from '../screens/ReconstructionProgressScreen';
import WorldAssetListingScreen from '../screens/WorldAssetListingScreen';
import WorldBattlePickerScreen from '../screens/WorldBattlePickerScreen';
import WorldBattleArenaScreen from '../screens/WorldBattleArenaScreen';
import WorldInteractiveBattleScreen from '../screens/world/WorldInteractiveBattleScreen';
import WorldUgcRuleSetsScreen from '../screens/world/WorldUgcRuleSetsScreen';
import WorldDungeonExplorerScreen from '../screens/WorldDungeonExplorerScreen';
import { PetCreatorScreen } from '../screens/pet/PetCreatorScreen';
import { CameraScanScreen } from '../screens/pet/CameraScanScreen';

export type WorldStackParamList = {
  WorldRoot: undefined;
  WorldFeed: undefined;
  WorldCharacterCard: {
    assetId?: string;
    card?: import('../services/worldEngineApi').CharacterCard;
    generationStatus?: import('../services/worldEngineApi').GenerationStatus;
    jobId?: string;
  };
  WorldEngineScanner: { mode?: 'quick' | 'detail' | 'room' } | undefined;
  WorldAssetInventory: undefined;
  WorldBattleArena: { challengerAssetId?: string; defenderAssetId?: string } | undefined;
  WorldInteractiveBattle: { challengerAssetId: string; defenderAssetId: string };
  WorldBattlePicker: undefined;
  WorldDungeonExplorer: { shareCode?: string };
  WorldUgcRuleSets: undefined;
  ReconstructionProgress: {
    jobId: string;
    estimatedSeconds?: number;
    scanMode?: 'quick' | 'detail' | 'room';
  };
  WorldAssetListing: { assetId: string; assetName?: string };
  WorldAssetMarketplace: undefined;
  PetCreator: undefined;
  PetCameraScan: undefined;
};

const Stack = createNativeStackNavigator<WorldStackParamList>();

/**
 * Phase 1 marketplace stub — full screen lands in Phase 2 once moderation
 * + pricing flow are settled. Click-through to existing WorldAssetListing
 * for now is enough.
 */
function WorldAssetMarketplaceScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary, padding: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 48, marginBottom: 16 }}>🛒</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>
        World Asset Marketplace
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
        Phase 2 — coming soon. List or browse user-generated 3D assets.
      </Text>
    </View>
  );
}

export function WorldStackNavigator() {
  const { t } = useI18n();
  return (
    <Stack.Navigator
      id={undefined}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgPrimary },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: colors.bgPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="WorldRoot"
        component={WorldHubScreen}
        options={{ title: t({ en: 'World', zh: '世界' }), headerShown: false }}
      />
      <Stack.Screen
        name="WorldFeed"
        component={WorldFeedScreen}
        options={{ title: t({ en: 'My World', zh: '我的世界' }), headerShown: false }}
      />
      <Stack.Screen
        name="WorldCharacterCard"
        component={WorldCharacterCardScreen}
        options={{ title: t({ en: 'Your Character', zh: '你的角色' }), headerShown: false }}
      />
      <Stack.Screen
        name="WorldEngineScanner"
        component={WorldEngineScannerScreen}
        options={{ title: t({ en: 'World Scanner', zh: '世界扫描' }), headerShown: false }}
      />
      <Stack.Screen
        name="WorldAssetInventory"
        component={WorldAssetInventoryScreen}
        options={{ title: t({ en: 'World Assets', zh: '世界资产' }), headerShown: false }}
      />
      <Stack.Screen
        name="WorldBattleArena"
        component={WorldBattleArenaScreen}
        options={{ title: t({ en: 'Battle', zh: '战斗' }), headerShown: false }}
      />
      <Stack.Screen
        name="WorldInteractiveBattle"
        component={WorldInteractiveBattleScreen}
        options={{ title: t({ en: 'Battle', zh: '决策对战' }), headerShown: false }}
      />
      <Stack.Screen
        name="WorldBattlePicker"
        component={WorldBattlePickerScreen}
        options={{ title: t({ en: 'Battle Picker', zh: '选择对战' }), headerShown: false }}
      />
      <Stack.Screen
        name="WorldDungeonExplorer"
        component={WorldDungeonExplorerScreen}
        options={{ title: t({ en: 'Dungeon', zh: '副本' }), headerShown: false }}
      />
      <Stack.Screen
        name="WorldUgcRuleSets"
        component={WorldUgcRuleSetsScreen}
        options={{ title: t({ en: 'Game Modes', zh: '我的玩法' }), headerShown: false }}
      />
      <Stack.Screen
        name="ReconstructionProgress"
        component={ReconstructionProgressScreen}
        options={{ title: t({ en: 'Generating', zh: '生成中' }), headerShown: false }}
      />
      <Stack.Screen
        name="WorldAssetListing"
        component={WorldAssetListingScreen}
        options={{ title: t({ en: 'List for Sale', zh: '上架出售' }), headerShown: false }}
      />
      <Stack.Screen
        name="WorldAssetMarketplace"
        component={WorldAssetMarketplaceScreen}
        options={{ title: t({ en: 'Marketplace', zh: '世界资产市场' }) }}
      />
      <Stack.Screen
        name="PetCreator"
        component={PetCreatorScreen}
        options={{ title: t({ en: 'Create Pet', zh: '文字创生' }) }}
      />
      <Stack.Screen
        name="PetCameraScan"
        component={CameraScanScreen}
        options={{ title: t({ en: 'Photo → 3D Pet', zh: '拍照创生' }) }}
      />
    </Stack.Navigator>
  );
}
