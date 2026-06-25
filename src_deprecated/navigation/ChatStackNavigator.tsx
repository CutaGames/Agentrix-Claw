import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChatStackParamList } from './types';
import { colors } from '../theme/colors';
import { ChatListScreen } from '../screens/social/ChatListScreen';
import { DirectMessageScreen } from '../screens/social/DirectMessageScreen';
import { GroupChatScreen } from '../screens/social/GroupChatScreen';

const Stack = createNativeStackNavigator<ChatStackParamList>();

export function ChatStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.textPrimary,
        contentStyle: { backgroundColor: colors.bgPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="ChatList" component={ChatListScreen} options={{ title: 'Chats' }} />
      <Stack.Screen name="DirectMessage" component={DirectMessageScreen} options={({ route }) => ({ title: route.params.userName })} />
      <Stack.Screen name="GroupChat" component={GroupChatScreen} options={({ route }) => ({ title: route.params.groupName })} />
    </Stack.Navigator>
  );
}
