import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import SoulPickerScreen from '../screens/pet/SoulPickerScreen';

export function PetSoulE2EApp() {
  return (
    <SafeAreaView style={styles.root}>
      <SoulPickerScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b0b13',
  },
});