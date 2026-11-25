import type { ContrastLevel, M3eThemeElement, ThemeVariant } from '@m3e/web/theme';
import type { M3eButtonElement } from '@m3e/web/button';
import type { M3eSelectionListElement } from '@m3e/web/list';
import type { M3eSwitchElement } from '@m3e/web/switch';
import type { ThemeMode, EffectiveThemeMode, FontMode, ThemeSettings } from './types';
import { exec } from '../bridge/ksu';

const STORAGE_KEY = 'sweetclocker_theme_settings_v3';
const DEFAULT_SEED = '#6750A4';

let activeThemeMode: ThemeMode = 'auto';
let activeThemeVariant: ThemeVariant = 'expressive';
let activeThemeContrast: ContrastLevel = 'standard';
let activeFontMode: FontMode = 'outfit';
let activeSeedColor: string = DEFAULT_SEED;
let isMonetActive = false;
let isReduceEffects = false;

function getThemeElement(): M3eThemeElement | null {
  return document.getElementById('app-theme') as M3eThemeElement | null;
}

export function getSystemThemeMode(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

export function getEffectiveThemeMode(mode: ThemeMode = activeThemeMode): EffectiveThemeMode {
  if (mode === 'auto') {
    return getSystemThemeMode();
  }
  return mode;
}

function loadStoredSettings(): Partial<ThemeSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<ThemeSettings>;
  } catch (err) {
    console.warn('Failed to parse theme settings from localStorage:', err);
    return {};
  }
}

function persistSettings(): void {
  try {
    const settings: ThemeSettings = {
      mode: activeThemeMode,
      variant: activeThemeVariant,
      contrast: activeThemeContrast,
      font: activeFontMode,
      seedColor: activeSeedColor,
      isMonet: isMonetActive,
      reduceEffects: isReduceEffects
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Failed to persist theme settings:', err);
  }
}

function syncMetaThemeColor(): void {
  const meta = document.getElementById('meta-theme-color');
  const themeEl = getThemeElement();
  if (!meta) return;

  if (activeThemeMode === 'amoled') {
    meta.setAttribute('content', '#000000');
    return;
  }

  requestAnimationFrame(() => {
    if (!themeEl) return;
    const bg = getComputedStyle(themeEl).getPropertyValue('--md-sys-color-background').trim();
    if (bg) meta.setAttribute('content', bg);
  });
}

function parseToHex(val: string | null | undefined): string | null {
  if (!val) return null;
  const clean = val.trim();
  if (/^#?[0-9A-Fa-f]{6}$/.test(clean)) {
    return clean.startsWith('#') ? clean : '#' + clean;
  }
  const intVal = parseInt(clean, 10);
  if (!isNaN(intVal) && intVal !== 0) {
    const r = (intVal >> 16) & 255;
    const g = (intVal >> 8) & 255;
    const b = intVal & 255;
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  }
  return null;
}

export async function detectMonetColor(): Promise<string | null> {
  try {
    const cmd = `
echo "aosp:$(settings get secure theme_customization_overlay_packages 2>/dev/null)"
echo "xiaomi:$(getprop persist.sys.theme.accentcolor 2>/dev/null)"
echo "system_accent:$(settings get system accent_color 2>/dev/null)"
echo "secure_accent:$(settings get secure accent_color 2>/dev/null)"
echo "theme_accent:$(settings get system theme_accent_color 2>/dev/null)"
echo "system_accent_col:$(settings get system system_accent_color 2>/dev/null)"
echo "overlay_300:$(cmd overlay lookup android android:color/system_accent1_300 2>/dev/null)"
echo "overlay_600:$(cmd overlay lookup android android:color/system_accent1_600 2>/dev/null)"
`;
    const { errno, stdout } = await exec(cmd, { timeoutMs: 3000 });
    if (errno !== 0 || !stdout) return null;

    const lines = stdout.trim().split('\n');
    const values: Record<string, string> = {};
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length >= 2 && parts[0]) {
        values[parts[0].trim()] = parts.slice(1).join(':').trim();
      }
    }

    let hex: string | null = null;

    if (values['aosp'] && values['aosp'] !== 'null' && values['aosp'].trim()) {
      const systemPaletteMatch = values['aosp'].match(
        /"android\.theme\.customization\.system_palette":"(#[A-Fa-f0-9]{6})"/
      );
      const accentColorMatch = values['aosp'].match(
        /"android\.theme\.customization\.accent_color":"(#[A-Fa-f0-9]{6})"/
      );
      if (systemPaletteMatch?.[1]) {
        hex = systemPaletteMatch[1];
      } else if (accentColorMatch?.[1]) {
        hex = accentColorMatch[1];
      }
    }

    if (!hex) hex = parseToHex(values['xiaomi']);
    if (!hex) hex = parseToHex(values['system_accent']);
    if (!hex) hex = parseToHex(values['secure_accent']);
    if (!hex) hex = parseToHex(values['theme_accent']);
    if (!hex) hex = parseToHex(values['system_accent_col']);

    if (!hex && values['overlay_300']) {
      const match = values['overlay_300'].match(/#([A-Fa-f0-9]{6,8})/);
      if (match?.[1]) {
        hex = match[1].length === 8 ? '#' + match[1].substring(2) : '#' + match[1];
      }
    }
    if (!hex && values['overlay_600']) {
      const match = values['overlay_600'].match(/#([A-Fa-f0-9]{6,8})/);
      if (match?.[1]) {
        hex = match[1].length === 8 ? '#' + match[1].substring(2) : '#' + match[1];
      }
    }

    if (hex) {
      activeSeedColor = hex;
      isMonetActive = true;
      const themeEl = getThemeElement();
      if (themeEl) themeEl.color = hex;
      syncMetaThemeColor();
      updateMonetStatusUI(true, hex);
      persistSettings();
      return hex;
    }
  } catch (err) {
    console.error('Error detecting Monet theme color:', err);
  }

  isMonetActive = false;
  updateMonetStatusUI(false);
  persistSettings();
  return null;
}

function updateMonetStatusUI(active: boolean, hex = ''): void {
  const badge = document.getElementById('monet-indicator');
  const text = document.getElementById('monet-sync-text');
  if (!badge || !text) return;

  if (active) {
    badge.style.setProperty('--m3e-badge-container-color', 'var(--md-sys-color-success)');
    text.innerText = `Monet Sync (${hex.toUpperCase()})`;
  } else {
    badge.style.setProperty('--m3e-badge-container-color', 'var(--md-sys-color-outline)');
    text.innerText = 'Custom Seed';
  }
}

export function syncConnectedButtonGroup(groupId: string, value: string): void {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll<M3eButtonElement>('m3e-button').forEach((btn) => {
    btn.selected = btn.getAttribute('value') === value;
  });
}

export function setThemeMode(mode: ThemeMode): void {
  activeThemeMode = mode;
  const effective = getEffectiveThemeMode(mode);
  const root = document.documentElement;
  const themeEl = getThemeElement();

  root.classList.remove('theme-dark', 'theme-light', 'theme-amoled', 'dark-mode', 'light-mode');

  if (effective === 'amoled') {
    root.classList.add('theme-amoled', 'dark-mode');
    if (themeEl) themeEl.scheme = 'dark';
  } else if (effective === 'light') {
    root.classList.add('theme-light', 'light-mode');
    if (themeEl) themeEl.scheme = 'light';
  } else {
    root.classList.add('theme-dark', 'dark-mode');
    if (themeEl) themeEl.scheme = mode === 'auto' ? 'auto' : 'dark';
  }

  syncConnectedButtonGroup('pref-theme-mode', mode);
  syncMetaThemeColor();
  persistSettings();
}

const VARIANT_LABELS: Record<ThemeVariant, string> = {
  expressive: 'Expressive',
  'tonal-spot': 'Tonal Spot',
  vibrant: 'Vibrant',
  fidelity: 'Fidelity',
  content: 'Content',
  monochrome: 'Monochrome',
  neutral: 'Neutral',
  rainbow: 'Rainbow',
  'fruit-salad': 'Fruit Salad'
};

export function setThemeVariant(variant: ThemeVariant): void {
  activeThemeVariant = variant;
  const themeEl = getThemeElement();
  if (themeEl) {
    themeEl.variant = variant;
    themeEl.setAttribute('variant', variant);
  }

  const valLabel = document.getElementById('pref-theme-variant-val');
  if (valLabel) {
    valLabel.innerText = VARIANT_LABELS[variant] ?? variant;
  }

  const list = document.getElementById('variant-sheet-options') as M3eSelectionListElement | null;
  if (list) {
    list.querySelectorAll<HTMLElement>('m3e-list-option').forEach((opt) => {
      const isMatch = opt.getAttribute('value') === variant;
      (opt as HTMLElement & { selected: boolean }).selected = isMatch;
      opt.toggleAttribute('selected', isMatch);
    });
  }

  syncMetaThemeColor();
  persistSettings();
}

export function setThemeContrast(contrast: ContrastLevel): void {
  activeThemeContrast = contrast;
  const themeEl = getThemeElement();
  if (themeEl) themeEl.contrast = contrast;

  syncConnectedButtonGroup('pref-theme-contrast', contrast);
  persistSettings();
}

export function setFontMode(font: FontMode): void {
  activeFontMode = font;
  const root = document.documentElement;

  if (font === 'system') {
    root.classList.add('system-font');
    root.style.setProperty('--font-family', 'system-ui, -apple-system, Roboto, sans-serif');
  } else {
    root.classList.remove('system-font');
    root.style.setProperty(
      '--font-family',
      "'Outfit', 'Inter', system-ui, -apple-system, Roboto, sans-serif"
    );
  }

  syncConnectedButtonGroup('pref-font-mode', font);
  persistSettings();
}

export function setReduceEffects(reduce: boolean): void {
  isReduceEffects = reduce;
  const root = document.documentElement;
  const themeEl = getThemeElement();

  root.classList.toggle('reduce-effects', reduce);
  if (themeEl) {
    themeEl.motion = reduce ? 'standard' : 'expressive';
  }

  const toggle = document.getElementById('reduce-effects-toggle') as M3eSwitchElement | null;
  if (toggle) toggle.checked = reduce;

  persistSettings();
}

export function setManualSeedColor(hex: string): void {
  activeSeedColor = hex;
  isMonetActive = false;
  const themeEl = getThemeElement();
  if (themeEl) themeEl.color = hex;
  syncMetaThemeColor();
  updateMonetStatusUI(false);
  persistSettings();
}

export async function resetToMonet(): Promise<void> {
  const monet = await detectMonetColor();
  if (!monet) {
    setManualSeedColor(DEFAULT_SEED);
  }
}

export async function initTheme(): Promise<void> {
  const stored = loadStoredSettings();

  let initialReduceEffects = stored.reduceEffects ?? false;
  if (typeof window !== 'undefined' && window.matchMedia) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prefersReducedTransparency = window.matchMedia(
      '(prefers-reduced-transparency: reduce)'
    ).matches;
    if (prefersReducedMotion || prefersReducedTransparency) {
      initialReduceEffects = true;
    }
  }

  setReduceEffects(initialReduceEffects);
  setThemeMode(stored.mode ?? 'auto');
  setThemeVariant(stored.variant ?? 'expressive');
  setThemeContrast(stored.contrast ?? 'standard');
  setFontMode(stored.font ?? 'outfit');

  if (stored.seedColor && !stored.isMonet) {
    setManualSeedColor(stored.seedColor);
  } else {
    const monet = await detectMonetColor();
    if (!monet) {
      setManualSeedColor(DEFAULT_SEED);
    }
  }
}

if (typeof window !== 'undefined' && window.matchMedia) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemSchemeChange = () => {
    if (activeThemeMode === 'auto') {
      setThemeMode('auto');
    }
  };
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleSystemSchemeChange);
  } else if ((mediaQuery as unknown as { addListener?: (cb: () => void) => void }).addListener) {
    (mediaQuery as unknown as { addListener: (cb: () => void) => void }).addListener(
      handleSystemSchemeChange
    );
  }
}
