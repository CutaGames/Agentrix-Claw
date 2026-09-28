/**
 * systemAppearance — feeds the OS light / dark preference into the theme
 * store for "跟随系统" (D11). React Native side only; the store itself
 * (`colors.ts`) stays free of react-native imports.
 */
import { Appearance } from 'react-native';
import { setSystemColorScheme } from './colors';

export function bootSystemAppearance(): () => void {
  setSystemColorScheme(Appearance.getColorScheme());
  const subscription = Appearance.addChangeListener(({ colorScheme }) => setSystemColorScheme(colorScheme));
  return () => subscription.remove();
}
