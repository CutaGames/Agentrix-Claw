/**
 * PlazaStackNavigator — 🎪 集市 Tab (Sprint A).
 *
 * Reuses existing market/social/predict screens; full wiring of
 * 5-segment content inside `PlazaScreen` is Sprint B2-B6.
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';

import { PlazaScreen } from '../screens/plaza/PlazaScreen';
import {
  PlazaMessagingStub,
  PlazaToyCustomStub,
  PlazaPetsSkinsStub,
  PlazaPetsStub,
  PlazaPlayStub,
} from '../screens/plaza/PlazaPlaceholderScreens';
import { GreetingCardComposeScreen } from '../screens/plaza/GreetingCardComposeScreen';
import { GreetingCardInboxScreen } from '../screens/plaza/GreetingCardInboxScreen';

// Reused screens — keep current imports working
import { FeedScreen } from '../screens/social/FeedScreen';
import { PostDetailScreen } from '../screens/social/PostDetailScreen';
import { UserProfileScreen } from '../screens/social/UserProfileScreen';
import { CreatePostScreen } from '../screens/social/CreatePostScreen';
import { GroupChatScreen } from '../screens/social/GroupChatScreen';
import { DirectMessageScreen } from '../screens/social/DirectMessageScreen';

import { ClawMarketplaceScreen } from '../screens/market/ClawMarketplaceScreen';
import { ClawSkillDetailScreen } from '../screens/market/ClawSkillDetailScreen';
import { CheckoutScreen } from '../screens/market/CheckoutScreen';
import { SkillInstallScreen } from '../screens/agent/SkillInstallScreen';

import TaskMarketScreen from '../screens/TaskMarketScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { PostTaskScreen } from '../screens/PostTaskScreen';

import { PredictScreen } from '../screens/discover/PredictScreen';

import { CreateLinkScreen } from '../screens/CreateLinkScreen';
import { ShareCardScreen } from '../screens/ShareCardScreen';

// Co-Raising placeholders (same component used in Home)
import { CoRaisingInviteScreen } from '../screens/home/CoRaisingInviteScreen';
import { CoRaisingLandingScreen } from '../screens/home/CoRaisingLandingScreen';

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
        component={PlazaScreen}
        options={{ title: t({ en: 'Plaza', zh: '集市' }), headerShown: false }}
      />

      {/* Feed ──────────────────────────────────────────────── */}
      <Stack.Screen
        name="Feed"
        component={FeedScreen}
        options={{ title: t({ en: 'Feed', zh: '广场' }), headerShown: false }}
      />
      <Stack.Screen
        name="PostDetail"
        component={PostDetailScreen}
        options={{ title: t({ en: 'Post', zh: '帖子' }) }}
      />
      <Stack.Screen
        name="ShowcaseDetail"
        component={PostDetailScreen}
        options={{ title: t({ en: 'Showcase', zh: '展示' }) }}
      />
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ title: t({ en: 'Profile', zh: '用户' }) }}
      />
      <Stack.Screen
        name="CreatePost"
        component={CreatePostScreen}
        options={{ title: t({ en: 'Create Post', zh: '发表' }) }}
      />

      {/* Messaging ─────────────────────────────────────────── */}
      <Stack.Screen
        name="Messaging"
        component={PlazaMessagingStub}
        options={{ title: t({ en: 'Messages', zh: '消息' }) }}
      />
      <Stack.Screen
        name="DirectMessage"
        component={DirectMessageScreen}
        options={({ route }) => ({ title: route.params?.userName ?? t({ en: 'Chat', zh: '私信' }) })}
      />
      <Stack.Screen
        name="GroupChat"
        component={GroupChatScreen}
        options={({ route }) => ({ title: route.params?.groupName ?? t({ en: 'Group', zh: '群聊' }) })}
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
        component={PlazaPetsStub}
        options={{ title: t({ en: 'Pet Market', zh: '宠物市场' }) }}
      />
      <Stack.Screen
        name="PetsSkins"
        component={PlazaPetsSkinsStub}
        options={{ title: t({ en: 'Skin Auction', zh: '皮肤拍卖' }) }}
      />
      <Stack.Screen
        name="SkinAuctionDetail"
        component={PlazaPetsSkinsStub}
        options={{ title: t({ en: 'Skin', zh: '皮肤' }) }}
      />
      <Stack.Screen
        name="PetAuctionDetail"
        component={PlazaPetsStub}
        options={{ title: t({ en: 'Pet', zh: '主宠' }) }}
      />

      {/* Play ──────────────────────────────────────────────── */}
      <Stack.Screen
        name="Play"
        component={PlazaPlayStub}
        options={{ title: t({ en: 'Play', zh: '玩乐' }) }}
      />
      <Stack.Screen
        name="Predict"
        component={PredictScreen}
        options={{ title: t({ en: 'Predict', zh: '预测' }) }}
      />

      {/* Co-Raising from Plaza entry ───────────────────────── */}
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

      {/* Greeting cards ────────────────────────────────────── */}
      <Stack.Screen
        name="GreetingCardCompose"
        component={GreetingCardComposeScreen}
        options={{ title: t({ en: 'Greeting Card', zh: '宠物贺卡' }) }}
      />
      <Stack.Screen
        name="GreetingCardInbox"
        component={GreetingCardInboxScreen}
        options={{ title: t({ en: 'Greeting Inbox', zh: '贺卡收件' }) }}
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
        component={PlazaToyCustomStub}
        options={{ title: t({ en: 'Toy Custom', zh: '实体玩偶' }) }}
      />
    </Stack.Navigator>
  );
}
