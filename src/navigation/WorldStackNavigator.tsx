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
// World Creation & Feed (统一创作流) — task 3.3:全屏竖向分页创作流(类抖音)
import CreationFeedScreen from '../screens/world/CreationFeedScreen';
// World Creation & Feed (统一创作器) — task 4.4:单一动作创作流(描述→生成→选址→发布)
import CreationCreatorScreen from '../screens/world/CreationCreatorScreen';
// World Creation & Feed — task 5.3/5.4 体验宿主、8.3 详情、7.3/9.4 我的世界、6.x 统一地图
import CreationExperienceScreen from '../screens/world/CreationExperienceScreen';
import CreationDetailScreen from '../screens/world/CreationDetailScreen';
import MyWorldScreen from '../screens/world/MyWorldScreen';
import UnifiedWorldMapScreen from '../screens/world/UnifiedWorldMapScreen';
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
// AI World Creation Platform (v6) — shared World_Map outer layer (Task 10.3)
import WorldMapScreen from '../screens/WorldMapScreen';
// AI World Creation Platform (v6) — creation/economy/experience surfaces (mobile UI)
import LandPlotsScreen from '../screens/world/LandPlotsScreen';
import PlotCreatorScreen from '../screens/world/PlotCreatorScreen';
import PlotExperienceScreen from '../screens/world/PlotExperienceScreen';
import CreationTaskStatusScreen from '../screens/world/CreationTaskStatusScreen';
import WorldCreationMarketplaceScreen from '../screens/world/WorldCreationMarketplaceScreen';
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
import AeonMarketScreen from '../screens/aeon/AeonMarketScreen';
import AeonPlotVisitScreen from '../screens/aeon/AeonPlotVisitScreen';
import AeonCompanyScreen from '../screens/aeon/AeonCompanyScreen';
// Aeon 社交场所 — 全服公共广场 + 实时群聊(2026-06-01)
import AeonPlazaScreen from '../screens/aeon/AeonPlazaScreen';
// Aeon 社交场所 Step 2 — 现场活动/脱口秀直播厅(2026-06-02)
import AeonLiveStageScreen from '../screens/aeon/AeonLiveStageScreen';
// Aeon 社交场所 Step 3 — 活动排期/预约(2026-06-02)
import AeonEventsScreen from '../screens/aeon/AeonEventsScreen';
// 连接器/插件库 — agent 能力扩展 + 玩法A(派 agent 办真事)(2026-06-02)
import ConnectorHubScreen from '../screens/aeon/ConnectorHubScreen';
// 商家店铺(地块 POI 接 marketplace 商品)(2026-06-03)
import AeonStoreScreen from '../screens/aeon/AeonStoreScreen';
// 分享海报(复用 skill/商品同款海报屏)
import { ShareCardScreen } from '../screens/ShareCardScreen';
import type { ShareCardRouteParams } from './types';

export type WorldStackParamList = {
  WorldRoot: undefined;
  WorldFeed: undefined;
  /** 分享海报(创作流分享走精美海报 + 有效链接,与 skill/商品一致)。 */
  ShareCard: ShareCardRouteParams;
  /** World Creation & Feed — 统一创作流(类抖音全屏竖向分页)(task 3.3,需求 5.1/5.2)。 */
  CreationFeed: undefined;
  /** World Creation & Feed — 统一创作器(单一动作:描述→生成→选址→发布)(task 4.4,需求 2.1/2.2/2.9)。 */
  CreationCreator: { type?: import('../../shared/types/creation').CreationType } | undefined;
  /** World Creation & Feed — 统一体验宿主(玩/买/看/聊)(task 5.3,需求 6.1–6.5)。 */
  CreationExperience: { creationId: string; type?: import('../../shared/types/creation').CreationType; title?: string };
  /** World Creation & Feed — 创作详情/留言/分享(task 8.3,需求 8.1–8.4)。 */
  CreationDetail: { creationId: string; title?: string };
  /** World Creation & Feed — 我的世界(我的创作 + Agent 代付额度)(task 7.3/9.4,需求 10.4/13.4)。 */
  MyWorld: undefined;
  /** World Creation & Feed — 统一世界地图(标记=Creation)(task 6.x,需求 4.1/4.7)。 */
  UnifiedWorldMap: undefined;
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
    /** 训练难度(副本房间据 BOSS/怪数传入)。 */
    difficulty?: 'easy' | 'normal' | 'hard';
    /** 副本房间 id(从副本进战斗时透传,用于战后标记清场)。 */
    dungeonRoomId?: string;
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
  /** AI World Creation Platform (v6) — shared World_Map outer layer (Task 10.3). */
  WorldMap: undefined;
  /** v6 — Land_Economy: acquire / list scarce plots (R2). */
  LandPlots: undefined;
  /** v6 — Plot creator (prompt-drive / co-edit / hand-build) (R3). */
  PlotCreator: { plotId: string; substrateTier: import('../../shared/types/world-creation').SubstrateTier; title?: string };
  /** v6 — Plot inner-experience host (enter / checkout) (R1.4/R15). */
  PlotExperience: { plotId: string; title?: string };
  /** v6 — Creation_Task status / retry (R8). */
  CreationTaskStatus: { taskId: string };
  /** v6 — Plot experience Marketplace (browse / purchase) (R11). */
  WorldCreationMarketplace: undefined;
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
  AeonScene: { plotId: string; displayName?: string; roomId?: string };
  // Aeon Phase 4
  AeonBuild: { plotId: string; displayName?: string };
  // Aeon 玩法循环
  AeonTasks: undefined;
  AeonNews: undefined;
  AeonMarket: undefined;
  AeonPlotVisit: { plotId: string; displayName?: string; ownerUserId?: string; ownerName?: string };
  AeonCompany: undefined;
  // Aeon 社交场所 — 全服公共广场
  AeonPlaza: undefined;
  // Aeon 社交场所 Step 2 — 现场活动/脱口秀直播厅
  AeonLiveStage: { roomId?: string; title?: string } | undefined;
  // Aeon 社交场所 Step 3 — 活动排期/预约
  AeonEvents: undefined;
  // 连接器/插件库
  ConnectorHub: undefined;
  // 商家店铺(地块 POI 接 marketplace 商品)
  AeonStore: { merchantUserId: string; storeName?: string; plotId?: string };
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
        name="CreationFeed"
        component={CreationFeedScreen}
        options={{ title: t({ en: 'Feed', zh: '创作流' }), headerShown: false }}
      />
      <Stack.Screen
        name="CreationCreator"
        component={CreationCreatorScreen}
        options={{ title: t({ en: 'New Creation', zh: '新建创作' }), headerShown: false }}
      />
      <Stack.Screen
        name="CreationExperience"
        component={CreationExperienceScreen}
        options={{ title: t({ en: 'Experience', zh: '体验' }), headerShown: false }}
      />
      <Stack.Screen
        name="ShareCard"
        component={ShareCardScreen}
        options={{ title: t({ en: 'Share', zh: '分享' }) }}
      />
      <Stack.Screen
        name="CreationDetail"
        component={CreationDetailScreen}
        options={{ title: t({ en: 'Detail', zh: '详情' }), headerShown: false }}
      />
      <Stack.Screen
        name="MyWorld"
        component={MyWorldScreen}
        options={{ title: t({ en: 'My World', zh: '我的世界' }), headerShown: false }}
      />
      <Stack.Screen
        name="UnifiedWorldMap"
        component={UnifiedWorldMapScreen}
        options={{ title: t({ en: 'World Map', zh: '世界地图' }), headerShown: false }}
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
        name="WorldMap"
        component={WorldMapScreen}
        options={{ title: t({ en: 'World Map', zh: '世界地图' }), headerShown: false }}
      />
      <Stack.Screen
        name="LandPlots"
        component={LandPlotsScreen}
        options={{ title: t({ en: 'Plots', zh: '地块' }), headerShown: false }}
      />
      <Stack.Screen
        name="PlotCreator"
        component={PlotCreatorScreen}
        options={{ title: t({ en: 'Plot Creator', zh: 'Plot 创作器' }), headerShown: false }}
      />
      <Stack.Screen
        name="PlotExperience"
        component={PlotExperienceScreen}
        options={{ title: t({ en: 'Experience', zh: '体验' }), headerShown: false }}
      />
      <Stack.Screen
        name="CreationTaskStatus"
        component={CreationTaskStatusScreen}
        options={{ title: t({ en: 'Creation Task', zh: '创作任务' }), headerShown: false }}
      />
      <Stack.Screen
        name="WorldCreationMarketplace"
        component={WorldCreationMarketplaceScreen}
        options={{ title: t({ en: 'Plot Market', zh: 'Plot 体验市场' }), headerShown: false }}
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
      <Stack.Screen
        name="AeonMarket"
        component={AeonMarketScreen}
        options={{ title: t({ en: 'Market', zh: '市场街区' }), headerShown: false }}
      />
      <Stack.Screen
        name="AeonPlotVisit"
        component={AeonPlotVisitScreen}
        options={{ title: t({ en: 'Visit', zh: '拜访领地' }), headerShown: false }}
      />
      <Stack.Screen
        name="AeonCompany"
        component={AeonCompanyScreen}
        options={{ title: t({ en: 'Company', zh: '公司运营' }), headerShown: false }}
      />
      <Stack.Screen
        name="AeonPlaza"
        component={AeonPlazaScreen}
        options={{ title: t({ en: 'Public Plaza', zh: '公共广场' }), headerShown: false }}
      />
      <Stack.Screen
        name="AeonLiveStage"
        component={AeonLiveStageScreen}
        options={{ title: t({ en: 'Live Stage', zh: '直播厅' }), headerShown: false }}
      />
      <Stack.Screen
        name="AeonEvents"
        component={AeonEventsScreen}
        options={{ title: t({ en: 'Events', zh: '活动现场' }), headerShown: false }}
      />
      <Stack.Screen
        name="ConnectorHub"
        component={ConnectorHubScreen}
        options={{ title: t({ en: 'Connectors', zh: '连接器' }), headerShown: false }}
      />
      <Stack.Screen
        name="AeonStore"
        component={AeonStoreScreen}
        options={{ title: t({ en: 'Store', zh: '店铺' }), headerShown: false }}
      />
    </Stack.Navigator>
  );
}
