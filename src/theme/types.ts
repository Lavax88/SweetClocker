export type ThemeMode = 'auto' | 'dark' | 'light' | 'amoled';
export type EffectiveThemeMode = 'dark' | 'light' | 'amoled';
export type FontMode = 'outfit' | 'system';

export interface ThemeSettings {
  mode: ThemeMode;
  font: FontMode;
  seedColor: string;
  isMonet: boolean;
  reduceEffects: boolean;
}
