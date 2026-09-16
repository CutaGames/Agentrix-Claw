import React from 'react';
import { Pressable, Text, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({ 
  title, 
  onPress, 
  style,
  disabled = false,
}) => {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: disabled ? colors.muted : (pressed ? '#2563EB' : colors.primary),
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        alignItems: 'center',
        opacity: disabled ? 0.6 : 1,
        ...style,
      })}
    >
      <Text style={{ color: 'white', fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
};