import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { MainTabNavigator } from './MainTabNavigator';
import { AgentDrawerContent } from '../components/AgentDrawerContent';
import { colors } from '../theme/colors';

const Drawer = createDrawerNavigator();

export function DrawerNavigator() {
  return (
    <Drawer.Navigator
      id={undefined}
      drawerContent={(props) => <AgentDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: {
          width: '80%',
          backgroundColor: colors.bgPrimary,
        },
        overlayColor: 'rgba(0, 0, 0, 0.5)',
        swipeEdgeWidth: 30,
        swipeMinDistance: 10,
      }}
    >
      <Drawer.Screen name="MainTabs" component={MainTabNavigator} />
    </Drawer.Navigator>
  );
}
