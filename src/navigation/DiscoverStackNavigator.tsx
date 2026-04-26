import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DiscoverStackParamList } from './types';
import { colors } from '../theme/colors';
import { DiscoverScreen } from '../screens/discover/DiscoverScreen';
import { PredictScreen } from '../screens/discover/PredictScreen';
// Market screens
import { ClawMarketplaceScreen } from '../screens/market/ClawMarketplaceScreen';
import { ClawSkillDetailScreen } from '../screens/market/ClawSkillDetailScreen';
import { CheckoutScreen } from '../screens/market/CheckoutScreen';
import TaskMarketScreen from '../screens/TaskMarketScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { PostTaskScreen } from '../screens/PostTaskScreen';
import { CreateLinkScreen } from '../screens/CreateLinkScreen';
import { SkillInstallScreen } from '../screens/agent/SkillInstallScreen';
import { ShareCardScreen } from '../screens/ShareCardScreen';
// Social screens
import { FeedScreen } from '../screens/social/FeedScreen';
import { PostDetailScreen } from '../screens/social/PostDetailScreen';
import { UserProfileScreen } from '../screens/social/UserProfileScreen';
import { SocialListenerScreen } from '../screens/social/SocialListenerScreen';
import { useI18n } from '../stores/i18nStore';

const Stack = createNativeStackNavigator<DiscoverStackParamList>();

export function DiscoverStackNavigator() {
  const { t } = useI18n();

  return (
    <Stack.Navigator id={undefined}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.textPrimary,
        contentStyle: { backgroundColor: colors.bgPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="DiscoverHome" component={DiscoverScreen} options={{ title: t({ en: 'Discover', zh: '发现' }) }} />
      <Stack.Screen name="Predict" component={PredictScreen} options={{ title: t({ en: '🎯 Predict', zh: '🎯 预测' }) }} />
      {/* Market screens */}
      <Stack.Screen name="Marketplace" component={ClawMarketplaceScreen} options={{ title: t({ en: 'Skill Market', zh: '技能市场' }) }} />
      <Stack.Screen name="SkillDetail" component={ClawSkillDetailScreen} options={({ route }) => ({ title: route.params.skillName })} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: t({ en: 'Checkout', zh: '结算' }) }} />
      <Stack.Screen name="TaskMarket" component={TaskMarketScreen} options={{ title: t({ en: 'Task Market', zh: '任务市场' }) }} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: t({ en: 'Task Detail', zh: '任务详情' }) }} />
      <Stack.Screen name="PostTask" component={PostTaskScreen} options={{ title: t({ en: 'Post Task', zh: '发布任务' }) }} />
      <Stack.Screen name="PublishTask" component={PostTaskScreen} options={{ title: t({ en: 'Post Task', zh: '发布任务' }) }} />
      <Stack.Screen name="CreateLink" component={CreateLinkScreen} options={{ title: t({ en: 'Create Link', zh: '创建链接' }) }} />
      <Stack.Screen name="SkillInstall" component={SkillInstallScreen} options={{ title: t({ en: 'Install Skill', zh: '安装技能' }) }} />
      <Stack.Screen name="ShareCard" component={ShareCardScreen} options={{ title: t({ en: 'Share', zh: '分享' }) }} />
      {/* Social screens */}
      <Stack.Screen name="Feed" component={FeedScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} options={{ title: t({ en: 'Showcase', zh: '展示' }) }} />
      <Stack.Screen name="ShowcaseDetail" component={PostDetailScreen} options={{ title: t({ en: 'Showcase', zh: '展示' }) }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: t({ en: 'Profile', zh: '用户' }) }} />
      <Stack.Screen name="SocialListener" component={SocialListenerScreen} options={{ title: t({ en: 'Social Bridge', zh: '社交桥' }) }} />
    </Stack.Navigator>
  );
}
