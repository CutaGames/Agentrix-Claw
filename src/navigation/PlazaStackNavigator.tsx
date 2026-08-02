
/**
 * PlazaStackNavigator — 🎪 集市 Tab.
 *
 * 单层交易市场:根屏 `MarketplaceScreen` 同屏切换 5 段
 * (赛事预测 / OpenClaw技能 / 任务 / 宠物 / 资源与商品),其余为各段的
 * 二级详情/结算屏。
 *
 * 下线说明 (agentrix-marketplace-tab-refactor task 10):
 *   广场(Feed/Messaging/GreetingCard) 与 玩乐(Play/Predict/PredictionMarket/
 *   EventsCenter/PhotoMimic/CoRaising) 已整体下线 —— 移除其集市内入口与路由。
 *   相关深链别名在 legacyRouteTable 改为导向 MarketplaceRoot。
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';

import { MarketplaceScreen } from '../screens/market/MarketplaceScreen';
import { PetAuctionScreen } from '../screens/plaza/PetAuctionScreen';
import { ToyCustomInquiryScreen } from '../screens/plaza/ToyCustomInquiryScreen';
import { SkinAuctionScreen } from '../screens/plaza/SkinAuctionScreen';

import { ClawMarketplaceScreen } from '../screens/market/ClawMarketplaceScreen';
import { ClawSkillDetailScreen } from '../screens/market/ClawSkillDetailScreen';
import { CheckoutScreen } from '../screens/market/CheckoutScreen';
import { SkillInstallScreen } from '../screens/agent/SkillInstallScreen';

import TaskMarketScreen from '../screens/TaskMarketScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { PostTaskScreen } from '../screens/PostTaskScreen';

import { CreateLinkScreen } from '../screens/CreateLinkScreen';
import { ShareCardScreen } from '../screens/ShareCardScreen';

import type { PlazaStackParamList } from './types';

const Stack = createNativeStackNavigator<PlazaStackParamList>();

export function PlazaStackNavigator() {
  const { t } = useI18n();
  return (
    <Stack.Navigator
      id={undefined}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.textPrimary,
        contentStyle: { backgroundColor: colors.bgPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="PlazaRoot"
        component={MarketplaceScreen}
        options={{ title: t({ en: 'Marketplace', zh: '集市' }), headerShown: false }}
      />

      {/* Skills ────────────────────────────────────────────── */}
      <Stack.Screen
        name="Skills"
        component={ClawMarketplaceScreen}
        options={{ title: t({ en: 'Skill Market', zh: '技能市场' }) }}
      />
      <Stack.Screen
        name="SkillDetail"
        component={ClawSkillDetailScreen}
        options={({ route }) => ({ title: route.params.skillName })}
      />
      <Stack.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{ title: t({ en: 'Checkout', zh: '结算' }) }}
      />
      <Stack.Screen
        name="SkillInstall"
        component={SkillInstallScreen}
        options={{ title: t({ en: 'Install', zh: '安装技能' }) }}
      />

      {/* Tasks ─────────────────────────────────────────────── */}
      <Stack.Screen
        name="Tasks"
        component={TaskMarketScreen}
        options={{ title: t({ en: 'Task Market', zh: '任务市场' }) }}
      />
      <Stack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{ title: t({ en: 'Task', zh: '任务详情' }) }}
      />
      <Stack.Screen
        name="PostTask"
        component={PostTaskScreen}
        options={{ title: t({ en: 'Post Task', zh: '发布任务' }) }}
      />

      {/* Pets market ───────────────────────────────────────── */}
      <Stack.Screen
        name="Pets"
        component={PetAuctionScreen}
        options={{ title: t({ en: 'Pet Auction', zh: '主宠拍卖' }) }}
      />
      <Stack.Screen
        name="PetsSkins"
        component={SkinAuctionScreen}
        options={{ title: t({ en: 'Skin Auction', zh: '皮肤拍卖' }) }}
      />
      <Stack.Screen
        name="SkinAuctionDetail"
        component={SkinAuctionScreen}
        options={{ title: t({ en: 'Skin', zh: '皮肤' }) }}
      />
      <Stack.Screen
        name="PetAuctionDetail"
        component={PetAuctionScreen}
        options={{ title: t({ en: 'Pet', zh: '主宠' }) }}
      />

      {/* Share card ────────────────────────────────────────── */}
      <Stack.Screen
        name="ShareCard"
        component={ShareCardScreen}
        options={{ title: t({ en: 'Share', zh: '分享' }) }}
      />
      <Stack.Screen
        name="CreateLink"
        component={CreateLinkScreen}
        options={{ title: t({ en: 'Create Link', zh: '创建链接' }) }}
      />

      {/* Toy custom ────────────────────────────────────────── */}
      <Stack.Screen
        name="ToyCustom"
        component={ToyCustomInquiryScreen}
        options={{ title: t({ en: 'Toy Custom', zh: '实体玩偶' }) }}
      />
    </Stack.Navigator>
  );
}
