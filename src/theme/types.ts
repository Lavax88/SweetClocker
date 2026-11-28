import type { ContrastLevel, ThemeVariant } from '@m3e/web/theme';

export type ThemeMode = 'auto' | 'dark' | 'light';
export type EffectiveThemeMode = 'dark' | 'light';
export type FontMode = 'outfit' | 'system';

export interface ThemeSettings {
  mode: ThemeMode;
  variant: ThemeVariant;
  contrast: ContrastLevel;
  font: FontMode;
  seedColor: string;
  isMonet: boolean;
  reduceEffects: boolean;
}
