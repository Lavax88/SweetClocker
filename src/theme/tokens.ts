import type { ThemeMode, EffectiveThemeMode } from './types';

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hexStr: string): HslColor {
  let hex = hexStr.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }

  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function applyThemeTokens(colorHex: string, mode: ThemeMode | EffectiveThemeMode): void {
  const { h, s } = hexToHsl(colorHex);
  const root = document.documentElement;

  root.style.setProperty('--theme-h', String(h));
  root.style.setProperty('--theme-s', `${s}%`);

  const isLight = mode === 'light';

  const primaryHex = hslToHex(h, s, isLight ? 40 : 80);
  const onPrimaryHex = isLight ? '#ffffff' : hslToHex(h, s, 20);
  const primaryContainerHex = hslToHex(h, s, isLight ? 90 : 30);
  const onPrimaryContainerHex = hslToHex(h, s, isLight ? 10 : 90);

  const secondaryHex = hslToHex(h, 15, isLight ? 40 : 80);
  const onSecondaryHex = isLight ? '#ffffff' : hslToHex(h, 15, 20);
  const secondaryContainerHex = hslToHex(h, 15, isLight ? 90 : 30);
  const onSecondaryContainerHex = hslToHex(h, 15, isLight ? 90 : 90);

  const bgHex = hslToHex(h, 12, isLight ? 96 : 10);
  const onBgHex = hslToHex(h, 10, isLight ? 10 : 90);

  const surfaceHex = hslToHex(h, 10, isLight ? 92 : 13);
  const onSurfaceHex = hslToHex(h, 8, isLight ? 10 : 90);
  const surfaceVarHex = hslToHex(h, 10, isLight ? 86 : 20);
  const onSurfaceVarHex = hslToHex(h, 8, isLight ? 30 : 80);

  const outlineHex = hslToHex(h, 8, isLight ? 50 : 45);
  const outlineVarHex = hslToHex(h, 8, isLight ? 80 : 30);

  root.style.setProperty('--theme-color-primary', primaryHex);
  root.style.setProperty('--theme-color-on-primary', onPrimaryHex);
  root.style.setProperty('--theme-color-primary-container', primaryContainerHex);
  root.style.setProperty('--theme-color-on-primary-container', onPrimaryContainerHex);

  root.style.setProperty('--theme-color-secondary', secondaryHex);
  root.style.setProperty('--theme-color-on-secondary', onSecondaryHex);
  root.style.setProperty('--theme-color-secondary-container', secondaryContainerHex);
  root.style.setProperty('--theme-color-on-secondary-container', onSecondaryContainerHex);

  root.style.setProperty('--theme-color-background', bgHex);
  root.style.setProperty('--theme-color-on-background', onBgHex);

  root.style.setProperty('--theme-color-surface', surfaceHex);
  root.style.setProperty('--theme-color-on-surface', onSurfaceHex);
  root.style.setProperty('--theme-color-surface-variant', surfaceVarHex);
  root.style.setProperty('--theme-color-on-surface-variant', onSurfaceVarHex);

  root.style.setProperty('--theme-color-outline', outlineHex);
  root.style.setProperty('--theme-color-outline-variant', outlineVarHex);
}
