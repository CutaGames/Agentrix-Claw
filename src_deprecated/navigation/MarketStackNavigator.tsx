import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MarketStackParamList } from './types';
import { colors } from '../theme/colors';
import { ClawMarketplaceScreen } from '../screens/market/ClawMarketplaceScreen';
import { ClawSkillDetailScreen } from '../screens/market/ClawSkillDetailScreen';
import { CheckoutScreen } from '../screens/market/CheckoutScreen';
import TaskMarketScreen from '../screens/TaskMarketScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { PostTaskScreen } from '../screens/PostTaskScreen';
import { CreateLinkScreen } from '../screens/CreateLinkScreen';
import { SkillInstallScreen } from '../screens/agent/SkillInstallScreen';

const Stack = createNativeStackNavigator<MarketStackParamList>();

export function MarketStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.textPrimary,
        contentStyle: { backgroundColor: colors.bgPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Marketplace" component={ClawMarketplaceScreen} options={{ title: 'Market' }} />
      <Stack.Screen name="SkillDetail" component={ClawSkillDetailScreen} options={({ route }) => ({ title: route.params.skillName })} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Checkout' }} />
      <Stack.Screen name="TaskMarket" component={TaskMarketScreen} options={{ title: 'Task Market' }} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Task Detail' }} />
      <Stack.Screen name="PostTask" component={PostTaskScreen} options={{ title: 'Post Task' }} />
      <Stack.Screen name="PublishTask" component={PostTaskScreen} options={{ title: 'Post Task' }} />
      <Stack.Screen name="CreateLink" component={CreateLinkScreen} options={{ title: 'Create Link' }} />
      <Stack.Screen name="SkillInstall" component={SkillInstallScreen} options={{ title: 'Install Skill' }} />
    </Stack.Navigator>
  );
}
