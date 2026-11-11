import type { ThemeMode, EffectiveThemeMode, FontMode, NavBarStyle, ThemeSettings } from './types';
import { applyThemeTokens } from './tokens';
import { exec } from '../bridge/ksu';

const STORAGE_KEY = 'sweetclocker_theme_settings_v2';
const DEFAULT_SEED = '#6750A4';

let activeThemeMode: ThemeMode = 'auto';
let activeFontMode: FontMode = 'outfit';
let activeNavBarStyle: NavBarStyle = 'floating';
let activeSeedColor: string = DEFAULT_SEED;
let isMonetActive = false;
let isReduceEffects = false;

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
      font: activeFontMode,
      seedColor: activeSeedColor,
      isMonet: isMonetActive,
      reduceEffects: isReduceEffects,
      navStyle: activeNavBarStyle
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Failed to persist theme settings:', err);
  }
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

    // 1. AOSP Monet JSON
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

    // 2. Xiaomi Accent Color
    if (!hex) hex = parseToHex(values['xiaomi']);

    // 3. Custom ROM settings
    if (!hex) hex = parseToHex(values['system_accent']);
    if (!hex) hex = parseToHex(values['secure_accent']);
    if (!hex) hex = parseToHex(values['theme_accent']);
    if (!hex) hex = parseToHex(values['system_accent_col']);

    // 4. Direct overlay lookup
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
      applyThemeTokens(hex, getEffectiveThemeMode(activeThemeMode));
      updateMonetStatusUI(true, hex);
      updateColorSelectionUI(hex, true);
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
  const indicator = document.getElementById('monet-indicator');
  const text = document.getElementById('monet-sync-text');
  if (!indicator || !text) return;

  if (active) {
    indicator.className = 'status-indicator success';
    text.innerText = `Synchronized (${hex.toUpperCase()})`;
  } else {
    indicator.className = 'status-indicator';
    text.innerText = 'Custom / Inactive';
  }
}

export function setThemeMode(mode: ThemeMode): void {
  activeThemeMode = mode;
  const effective = getEffectiveThemeMode(mode);
  const root = document.documentElement;

  root.classList.remove('theme-dark', 'theme-light', 'theme-amoled', 'dark-mode', 'light-mode');

  if (effective === 'amoled') {
    root.classList.add('theme-amoled', 'dark-mode');
  } else if (effective === 'light') {
    root.classList.add('theme-light', 'light-mode');
  } else {
    root.classList.add('theme-dark', 'dark-mode');
  }

  applyThemeTokens(activeSeedColor, effective);

  // Update segments UI
  const segments = document.querySelectorAll('[data-theme-mode]');
  segments.forEach((seg) => {
    if (seg.getAttribute('data-theme-mode') === mode) {
      seg.classList.add('active');
    } else {
      seg.classList.remove('active');
    }
  });

  persistSettings();
}

export function setFontMode(font: FontMode): void {
  activeFontMode = font;
  const root = document.documentElement;

  if (font === 'system') {
    root.style.setProperty('--font-family', 'system-ui, -apple-system, Roboto, sans-serif');
  } else {
    root.style.setProperty(
      '--font-family',
      "'Outfit', 'Inter', system-ui, -apple-system, Roboto, sans-serif"
    );
  }

  const segments = document.querySelectorAll('[data-font-mode]');
  segments.forEach((seg) => {
    if (seg.getAttribute('data-font-mode') === font) {
      seg.classList.add('active');
    } else {
      seg.classList.remove('active');
    }
  });

  persistSettings();
}

export function setNavBarStyle(style: NavBarStyle): void {
  activeNavBarStyle = style;
  const root = document.documentElement;
  const nav = document.querySelector<HTMLElement>('.bottom-nav');

  if (nav) {
    nav.classList.add('nav-switching');
    setTimeout(() => {
      nav.classList.remove('nav-switching');
    }, 450);
  }

  if (style === 'floating') {
    root.classList.add('nav-floating');
  } else {
    root.classList.remove('nav-floating');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nav-style-changed', { detail: style }));
  }

  const segments = document.querySelectorAll('[data-nav-style]');
  segments.forEach((seg) => {
    if (seg.getAttribute('data-nav-style') === style) {
      seg.classList.add('active');
    } else {
      seg.classList.remove('active');
    }
  });

  persistSettings();
}

export function getNavBarStyle(): NavBarStyle {
  return activeNavBarStyle;
}

export function setReduceEffects(reduce: boolean): void {
  isReduceEffects = reduce;
  const root = document.documentElement;

  if (reduce) {
    root.classList.add('reduce-effects');
  } else {
    root.classList.remove('reduce-effects');
  }

  const toggle = document.getElementById('reduce-effects-toggle') as HTMLInputElement | null;
  if (toggle) toggle.checked = reduce;

  persistSettings();
}

export function updateColorSelectionUI(selectedHex: string, isMonet = false): void {
  const allDots = document.querySelectorAll<HTMLElement>('.color-dot');
  const customIndicator = document.getElementById('custom-color-indicator');
  const picker = document.getElementById('custom-color-picker') as HTMLInputElement | null;

  allDots.forEach((dot) => dot.classList.remove('active'));

  if (isMonet) {
    return;
  }

  let matchedPreset = false;
  const normalizedSelected = selectedHex.toLowerCase();

  allDots.forEach((dot) => {
    if (dot.id === 'custom-color-indicator') return;
    const dotColor = (dot.getAttribute('data-color') ?? '').toLowerCase();
    if (dotColor === normalizedSelected) {
      dot.classList.add('active');
      matchedPreset = true;
    }
  });

  if (customIndicator) {
    customIndicator.style.backgroundColor = selectedHex;
    if (picker) picker.value = selectedHex;
    if (!matchedPreset) {
      customIndicator.classList.add('active');
    }
  }
}

export function setManualSeedColor(hex: string): void {
  activeSeedColor = hex;
  isMonetActive = false;
  applyThemeTokens(hex, getEffectiveThemeMode(activeThemeMode));
  updateMonetStatusUI(false);
  updateColorSelectionUI(hex, false);
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

  // Accessibility checks: prefers-reduced-transparency or prefers-reduced-motion
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

  // Set theme mode (default to 'auto')
  const mode = stored.mode ?? 'auto';
  setThemeMode(mode);

  // Set font mode
  const font = stored.font ?? 'outfit';
  setFontMode(font);

  // Set navigation bar style (default to 'floating')
  const navStyle = stored.navStyle ?? 'floating';
  setNavBarStyle(navStyle);

  // Set seed / monet
  if (stored.seedColor && !stored.isMonet) {
    setManualSeedColor(stored.seedColor);
  } else {
    const monet = await detectMonetColor();
    if (!monet) {
      setManualSeedColor(DEFAULT_SEED);
    }
  }
}

// Live listener for system dark/light mode changes when mode is 'auto'
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
