import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MeStackParamList } from './types';
import { colors } from '../theme/colors';
import { ProfileScreen } from '../screens/me/ProfileScreen';
import { ReferralDashboardScreen } from '../screens/me/ReferralDashboardScreen';
import { ClawSettingsScreen } from '../screens/me/ClawSettingsScreen';
import { CompanionSettingsScreen } from '../screens/me/CompanionSettingsScreen';
import { ApiKeysScreen } from '../screens/me/ApiKeysScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { MySkillsScreen } from '../screens/me/MySkillsScreen';
import { MyOrdersScreen } from '../screens/me/MyOrdersScreen';
import { NotificationCenterScreen } from '../screens/notifications/NotificationCenterScreen';
import { ShareCardScreen } from '../screens/ShareCardScreen';
import { WalletConnectScreen } from '../screens/WalletConnectScreen';
import { WalletBackupScreen } from '../screens/me/WalletBackupScreen';
import { WalletSetupScreen } from '../screens/me/WalletSetupScreen';
import { SocialListenerScreen } from '../screens/social/SocialListenerScreen';
import { ScanScreen } from '../screens/me/ScanScreen';
import { LocalAiModelScreen } from '../screens/me/LocalAiModelScreen';
import { WearableHubScreen } from '../screens/agent/WearableHubScreen';
import { SubscribePlanScreen } from '../screens/me/SubscribePlanScreen';
import { AxpCenterScreen } from '../screens/me/AxpCenterScreen';
import { AxpRewardShopScreen } from '../screens/me/AxpRewardShopScreen';
import { ToyBindingScreen } from '../screens/me/ToyBindingScreen';
// P-9 Q1 — re-home orphaned pet screens (T6.7). These exist as components
// but were not mounted in any navigator after the legacy PetStack was
// deleted, so PetDetailSheet navigation to them crashed at runtime.
import { WardrobeScreen } from '../screens/pet/WardrobeScreen';
import { SoulPickerScreen } from '../screens/pet/SoulPickerScreen';
import { BreedScreen } from '../screens/pet/BreedScreen';
import { PetPlaygroundScreen } from '../screens/pet/PetPlaygroundScreen';
import { SkinMarketplaceScreen } from '../screens/pet/SkinMarketplaceScreen';
import { MemoryManagementScreen } from '../screens/agent/MemoryManagementScreen';
import { useI18n } from '../stores/i18nStore';

const Stack = createNativeStackNavigator<MeStackParamList>();

export function MeStackNavigator() {
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
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: t({ en: 'Me', zh: '我的' }) }} />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: t({ en: 'Scan & Create', zh: '扫描与生成' }) }} />
      <Stack.Screen name="ReferralDashboard" component={ReferralDashboardScreen} options={{ title: t({ en: 'Referrals & Earnings', zh: '推广与收益' }) }} />
      <Stack.Screen name="Settings" component={ClawSettingsScreen} options={{ title: t({ en: 'Settings', zh: '设置' }) }} />
      <Stack.Screen name="CompanionSettings" component={CompanionSettingsScreen} options={{ title: t({ en: 'Companion Settings', zh: '陪伴设置' }) }} />
      <Stack.Screen name="ApiKeys" component={ApiKeysScreen} options={{ title: t({ en: 'AI Providers', zh: 'AI 厂商与订阅' }) }} />
      <Stack.Screen name="Account" component={AccountScreen} options={{ title: t({ en: 'Account', zh: '账户' }) }} />
      <Stack.Screen name="MySkills" component={MySkillsScreen} options={{ title: t({ en: 'My Skills', zh: '我的技能' }) }} />
      <Stack.Screen name="MyOrders" component={MyOrdersScreen} options={{ title: t({ en: 'My Orders', zh: '我的订单' }) }} />
      <Stack.Screen name="WalletConnect" component={WalletConnectScreen} options={{ title: t({ en: 'Wallet', zh: '钱包' }) }} />
      <Stack.Screen name="WalletSetup" component={WalletSetupScreen} options={{ title: t({ en: 'Wallet Setup', zh: '钱包设置' }) }} />
      <Stack.Screen name="WalletBackup" component={WalletBackupScreen} options={{ title: t({ en: 'Wallet Backup', zh: '钱包备份' }) }} />
      <Stack.Screen name="NotificationCenter" component={NotificationCenterScreen} options={{ title: t({ en: 'Notifications', zh: '通知' }) }} />
      <Stack.Screen name="ShareCard" component={ShareCardScreen} options={{ title: t({ en: 'Share', zh: '分享' }) }} />
      <Stack.Screen name="SocialListener" component={SocialListenerScreen} options={{ title: t({ en: 'Social Listener', zh: '社交监听' }) }} />
      <Stack.Screen name="LocalAiModel" component={LocalAiModelScreen} options={{ title: t({ en: 'Local AI Model', zh: '本地 AI 模型' }) }} />
      <Stack.Screen name="WearableHub" component={WearableHubScreen} options={{ title: t({ en: 'Wearable Devices', zh: '可穿戴设备' }) }} />
      <Stack.Screen name="Subscribe" component={SubscribePlanScreen} options={{ title: t({ en: 'Subscribe', zh: '订阅' }) }} />
      <Stack.Screen name="AxpCenter" component={AxpCenterScreen} options={{ title: t({ en: 'AXP Center', zh: 'AXP 中心' }) }} />
      <Stack.Screen name="AxpRewardShop" component={AxpRewardShopScreen} options={{ title: t({ en: 'Redeem Shop', zh: '兑换中心' }) }} />
      <Stack.Screen name="ToyBinding" component={ToyBindingScreen} options={{ title: t({ en: 'Devices', zh: '设备管理' }) }} />

      {/* P-9 Q1 — re-homed pet screens (reachable from PetDetailSheet action grid) */}
      <Stack.Screen name="PetWardrobe" component={WardrobeScreen} options={{ title: t({ en: 'Wardrobe', zh: '衣柜' }) }} />
      <Stack.Screen name="SoulPicker" component={SoulPickerScreen} options={{ title: t({ en: 'Soul', zh: '灵魂' }) }} />
      <Stack.Screen name="PetBreed" component={BreedScreen} options={{ title: t({ en: 'Breed', zh: '繁育' }) }} />
      <Stack.Screen name="PetPlayground" component={PetPlaygroundScreen} options={{ title: t({ en: 'Playground', zh: '玩乐' }) }} />
      <Stack.Screen name="PetSkinMarketplace" component={SkinMarketplaceScreen} options={{ title: t({ en: 'Skin Market', zh: '皮肤市场' }) }} />
      <Stack.Screen name="MemoryManagement" component={MemoryManagementScreen} options={{ title: t({ en: 'Memory', zh: '记忆' }) }} />
    </Stack.Navigator>
  );
}
