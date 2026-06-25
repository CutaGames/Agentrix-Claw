import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SocialStackParamList } from './types';
import { colors } from '../theme/colors';
import { FeedScreen } from '../screens/social/FeedScreen';
import { PostDetailScreen } from '../screens/social/PostDetailScreen';
import { UserProfileScreen } from '../screens/social/UserProfileScreen';
import { CreatePostScreen } from '../screens/social/CreatePostScreen';

const Stack = createNativeStackNavigator<SocialStackParamList>();

export function SocialStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.textPrimary,
        contentStyle: { backgroundColor: colors.bgPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Feed" component={FeedScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} options={{ title: 'Post' }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="CreatePost" component={CreatePostScreen} options={{ title: 'New Post', presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
