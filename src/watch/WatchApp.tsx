import React from 'react';
import { StatusBar } from 'react-native';
import { WatchNavigator } from './navigation/WatchNavigator';

/**
 * Agentrix Claw Watch — Entry point.
 * Replaces App.tsx when building for Wear OS.
 */
export default function WatchApp() {
  return (
    <>
      <StatusBar hidden />
      <WatchNavigator />
    </>
  );
}
