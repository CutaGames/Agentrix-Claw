import React from 'react';
import { View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

export const Card: React.FC<{ style?: ViewStyle; children: React.ReactNode }> = ({ style, children }) => {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
        ...style,
      }}
    >
      {children}
    </View>
  );
};