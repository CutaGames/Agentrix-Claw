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
import { WorldAssetDetailScreen } from '../screens/world/WorldAssetDetailScreen';
import { WorldMarketplaceScreen } from '../screens/world/WorldMarketplaceScreen';
import WorldBattlePickerScreen from '../screens/WorldBattlePickerScreen';
import WorldBattleArenaScreen from '../screens/WorldBattleArenaScreen';
import WorldInteractiveBattleScreen from '../screens/world/WorldInteractiveBattleScreen';
import WorldUgcRuleSetsScreen from '../screens/world/WorldUgcRuleSetsScreen';
import WorldDungeonExplorerScreen from '../screens/WorldDungeonExplorerScreen';
import { PetCreatorScreen } from '../screens/pet/PetCreatorScreen';
import { CameraScanScreen } from '../screens/pet/CameraScanScreen';
// Aeon(永曜城)— 实时多人共建世界(Phase 1)
import AeonMapScreen from '../screens/aeon/AeonMapScreen';
import AeonSceneScreen from '../screens/aeon/AeonSceneScreen';
// Aeon Phase 4 — 共建建造
import AeonBuildScreen from '../screens/aeon/AeonBuildScreen';
// Aeon 玩法循环 — 任务广场 + 世界动态(2026-06-01)
import AeonTasksScreen from '../screens/aeon/AeonTasksScreen';
import AeonNewsScreen from '../screens/aeon/AeonNewsScreen';

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
  WorldInteractiveBattle: {
    challengerAssetId: string;
    defenderAssetId: string;
    training?: boolean;
    /** UGC 玩法分享码 + 名称(用"我的玩法"开打时透传)。 */
    ruleSetShareCode?: string;
    ruleSetName?: string;
    /** Real identity for the combatant header (avoids the hardcoded 🦊/👹). */
    challengerName?: string;
    challengerPortraitUrl?: string | null;
    defenderName?: string;
    defenderPortraitUrl?: string | null;
  };
  WorldBattlePicker: { ruleSetShareCode?: string; ruleSetName?: string; preselectChallengerId?: string } | undefined;
  WorldDungeonExplorer: { shareCode?: string };
  WorldUgcRuleSets: undefined;
  ReconstructionProgress: {
    jobId: string;
    estimatedSeconds?: number;
    scanMode?: 'quick' | 'detail' | 'room';
  };
  WorldAssetListing: { assetId: string; assetName?: string };
  WorldAssetDetail: { assetId: string; assetName?: string };
  WorldAssetMarketplace: undefined;
  PetCreator: undefined;
  PetCameraScan: undefined;
  // Aeon(永曜城)Phase 1
  AeonMap: undefined;
  AeonScene: { plotId: string; displayName?: string };
  // Aeon Phase 4
  AeonBuild: { plotId: string; displayName?: string };
  // Aeon 玩法循环
  AeonTasks: undefined;
  AeonNews: undefined;
};

const Stack = createNativeStackNavigator<WorldStackParamList>();

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
        name="WorldAssetDetail"
        component={WorldAssetDetailScreen}
        options={{ title: t({ en: 'Asset Detail', zh: '资产详情' }), headerShown: false }}
      />
      <Stack.Screen
        name="WorldAssetMarketplace"
        component={WorldMarketplaceScreen}
        options={{ title: t({ en: 'Marketplace', zh: '世界资产市场' }), headerShown: false }}
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
      <Stack.Screen
        name="AeonMap"
        component={AeonMapScreen}
        options={{ title: t({ en: 'Aeon', zh: 'Aeon · 永曜城' }), headerShown: false }}
      />
      <Stack.Screen
        name="AeonScene"
        component={AeonSceneScreen}
        options={{ title: t({ en: 'World', zh: '世界' }), headerShown: false }}
      />
      <Stack.Screen
        name="AeonBuild"
        component={AeonBuildScreen}
        options={{ title: t({ en: 'Build', zh: '建造' }), headerShown: false }}
      />
      <Stack.Screen
        name="AeonTasks"
        component={AeonTasksScreen}
        options={{ title: t({ en: 'Tasks', zh: '任务广场' }), headerShown: false }}
      />
      <Stack.Screen
        name="AeonNews"
        component={AeonNewsScreen}
        options={{ title: t({ en: 'World News', zh: '世界动态' }), headerShown: false }}
      />
    </Stack.Navigator>
  );
}
