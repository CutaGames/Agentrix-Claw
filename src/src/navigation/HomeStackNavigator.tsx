/**
 * HomeStackNavigator — 🏠 家 Tab (Sprint A).
 *
 * Home is the Pet-as-Agent dashboard. The root HomeScreen hosts the pet
 * status bar + summon CTA + drawer grid. Drawer entries map to existing
 * screens (no UI rewrite in Sprint A), but registered here so that
 * navigation + deep-link compatibility works.
 *
 * Mapping table (Sprint A):
 *   PetCompanion  → PetCompanionScreen (existing)
 *   PetSkills     → AgentToolsScreen (existing) — will become skill-slot UI in B
 *   PetTasks      → AgentToolsScreen (placeholder; proper in Plaza · Tasks)
 *   PetWallet     → AgentAccountScreen (existing)
 *   PetWalletBalance → AgentBalanceScreen (existing)
 *   PetMemory     → MemoryManagementScreen (existing)
 *   PetMemoryDreaming → DreamingDashboardScreen (existing)
 *   PetMemoryLogs → AgentLogsScreen (existing)
 *   PetPlay       → PetPlaygroundScreen (existing)
 *   PetWardrobe   → WardrobeScreen (existing)
 *   PetSoul       → SoulPickerScreen (existing)
 *   PetBreed      → BreedScreen (existing)
 *   PetIdentity   → AgentPermissionsScreen (placeholder for ERC-8004; real in Sprint B)
 *   PetCreator    → PetCreatorScreen (existing)
 *   PetPermissions→ AgentPermissionsScreen (existing)
 *   PetSpace      → AgentSpaceScreen (existing)
 *   PetTeam       → PetTeamScreen (existing)
 *   PetWorkflow   → WorkflowListScreen (existing)
 *   PetWorkflowDetail → WorkflowDetailScreen (existing)
 *   CoRaising*    → new placeholder screens in src/screens/home/
 *   PlanApproval  → PlanApprovalScreen (existing)
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';

import { HomeScreen } from '../screens/home/HomeScreen';
import { CoRaisingInviteScreen } from '../screens/home/CoRaisingInviteScreen';
import { CoRaisingLandingScreen } from '../screens/home/CoRaisingLandingScreen';
import { CoRaisingActivityScreen } from '../screens/home/CoRaisingActivityScreen';

import { PetCompanionScreen } from '../screens/pet/PetCompanionScreen';
import { PetCreatorScreen } from '../screens/pet/PetCreatorScreen';
import { CameraScanScreen } from '../screens/pet/CameraScanScreen';
import { WardrobeScreen } from '../screens/pet/WardrobeScreen';
import { SoulPickerScreen } from '../screens/pet/SoulPickerScreen';
import { BreedScreen } from '../screens/pet/BreedScreen';
import { PetTeamScreen } from '../screens/pet/PetTeamScreen';
import { PetPlaygroundScreen } from '../screens/pet/PetPlaygroundScreen';
import { NftMintScreen } from '../screens/pet/NftMintScreen';

import { AgentAccountScreen } from '../screens/agent/AgentAccountScreen';
import { AgentBalanceScreen } from '../screens/agent/AgentBalanceScreen';
import { AgentPermissionsScreen } from '../screens/agent/AgentPermissionsScreen';
import { AgentToolsScreen } from '../screens/agent/AgentToolsScreen';
import { AgentSpaceScreen } from '../screens/agent/AgentSpaceScreen';
import { MemoryManagementScreen } from '../screens/agent/MemoryManagementScreen';
import { DreamingDashboardScreen } from '../screens/agent/DreamingDashboardScreen';
import { AgentLogsScreen } from '../screens/agent/AgentLogsScreen';
import { WorkflowListScreen } from '../screens/agent/WorkflowListScreen';
import { WorkflowDetailScreen } from '../screens/agent/WorkflowDetailScreen';

import { PlanApprovalScreen } from '../screens/plan/PlanApprovalScreen';

import type { HomeStackParamList } from './types';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStackNavigator() {
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
        name="HomeRoot"
        component={HomeScreen}
        options={{ title: t({ en: 'Home', zh: '家' }), headerShown: false }}
      />

      {/* Pet drawer — 10 primary entries ───────────────────── */}
      <Stack.Screen
        name="PetCompanion"
        component={PetCompanionScreen}
        options={{ title: t({ en: 'My Pet', zh: '我的主宠' }) }}
      />
      <Stack.Screen
        name="PetSkills"
        component={AgentToolsScreen}
        options={{ title: t({ en: 'Skill Slots', zh: '技能栏' }) }}
      />
      <Stack.Screen
        name="PetTasks"
        component={AgentToolsScreen}
        options={{ title: t({ en: 'Tasks', zh: '接单' }) }}
      />
      <Stack.Screen
        name="PetWallet"
        component={AgentAccountScreen}
        options={{ title: t({ en: 'Pet Wallet', zh: '主宠钱包' }) }}
      />
      <Stack.Screen
        name="PetWalletBalance"
        component={AgentBalanceScreen}
        options={{ title: t({ en: 'Balance', zh: '余额' }) }}
      />
      <Stack.Screen
        name="PetMemory"
        component={MemoryManagementScreen}
        options={{ title: t({ en: 'Memory', zh: '记忆' }) }}
      />
      <Stack.Screen
        name="PetMemoryDreaming"
        component={DreamingDashboardScreen}
        options={{ title: t({ en: 'Dreaming', zh: '梦境' }) }}
      />
      <Stack.Screen
        name="PetMemoryLogs"
        component={AgentLogsScreen}
        options={{ title: t({ en: 'Activity Logs', zh: '活动日志' }) }}
      />
      <Stack.Screen
        name="PetPlay"
        component={PetPlaygroundScreen}
        options={{ title: t({ en: 'Play', zh: '玩乐' }) }}
      />
      <Stack.Screen
        name="PetWardrobe"
        component={WardrobeScreen}
        options={{ title: t({ en: 'Wardrobe', zh: '衣柜' }) }}
      />
      <Stack.Screen
        name="PetSoul"
        component={SoulPickerScreen}
        options={{ title: t({ en: 'Soul', zh: '灵魂' }) }}
      />
      <Stack.Screen
        name="PetBreed"
        component={BreedScreen}
        options={{ title: t({ en: 'Breed', zh: '繁育' }) }}
      />
      <Stack.Screen
        name="PetIdentity"
        component={AgentPermissionsScreen}
        options={{ title: t({ en: 'Identity', zh: '身份 (ERC-8004)' }) }}
      />
      <Stack.Screen
        name="PetCreator"
        component={PetCreatorScreen}
        options={{ title: t({ en: 'Create Pet', zh: '文字创生' }) }}
      />
      <Stack.Screen
        name="PetCameraScan"
        component={CameraScanScreen}
        options={{ title: t({ en: 'Photo → 3D Pet', zh: '📷 拍照创生' }) }}
      />
      <Stack.Screen
        name="PetPermissions"
        component={AgentPermissionsScreen}
        options={{ title: t({ en: 'Permissions', zh: '权限' }) }}
      />
      <Stack.Screen
        name="PetSpace"
        component={AgentSpaceScreen}
        options={{ title: t({ en: 'Pet Space', zh: '协作空间' }) }}
      />
      <Stack.Screen
        name="PetTeam"
        component={PetTeamScreen}
        options={{ title: t({ en: 'Pet Team', zh: '主宠团队' }) }}
      />
      <Stack.Screen
        name="PetWorkflow"
        component={WorkflowListScreen}
        options={{ title: t({ en: 'Workflows', zh: '工作流' }) }}
      />
      <Stack.Screen
        name="PetWorkflowDetail"
        component={WorkflowDetailScreen}
        options={{ title: t({ en: 'Workflow', zh: '工作流' }) }}
      />

      {/* Co-Raising (Sprint A placeholder, Sprint C real impl) ── */}
      <Stack.Screen
        name="NftMint"
        component={NftMintScreen}
        options={{ title: t({ en: 'NFT Mint', zh: 'NFT 铸造' }) }}
      />
      <Stack.Screen
        name="CoRaisingInvite"
        component={CoRaisingInviteScreen}
        options={{ title: t({ en: 'Invite friends', zh: '邀请朋友' }) }}
      />
      <Stack.Screen
        name="CoRaisingLanding"
        component={CoRaisingLandingScreen}
        options={{ title: t({ en: 'Join co-raising', zh: '加入共养' }) }}
      />
      <Stack.Screen
        name="CoRaisingActivity"
        component={CoRaisingActivityScreen}
        options={{ title: t({ en: 'Co-raising activity', zh: '共养活动' }) }}
      />

      {/* Approvals (reused) ──────────────────────────────────── */}
      <Stack.Screen
        name="PlanApproval"
        component={PlanApprovalScreen}
        options={{ title: t({ en: 'Approvals', zh: '待审批' }) }}
      />
    </Stack.Navigator>
  );
}
