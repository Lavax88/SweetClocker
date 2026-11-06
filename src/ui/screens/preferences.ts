import {
  setThemeMode,
  setFontMode,
  setNavBarStyle,
  setReduceEffects,
  setManualSeedColor,
  resetToMonet
} from '../../theme/theme';
import type { ThemeMode, FontMode, NavBarStyle } from '../../theme/types';
import { setBypassMode } from '../../telemetry/sampler';
import { toast } from '../../bridge/ksu';

export function initPreferencesScreen(): void {
  // Theme Mode buttons
  const modeSegments = document.querySelectorAll<HTMLElement>('[data-theme-mode]');
  modeSegments.forEach((seg) => {
    seg.addEventListener('click', () => {
      const mode = seg.getAttribute('data-theme-mode') as ThemeMode;
      if (mode) {
        setThemeMode(mode);
        const label = mode === 'auto' ? 'Auto (System)' : mode.toUpperCase();
        toast(`Theme mode set to ${label}`);
      }
    });
  });

  // Font Mode buttons
  const fontSegments = document.querySelectorAll<HTMLElement>('[data-font-mode]');
  fontSegments.forEach((seg) => {
    seg.addEventListener('click', () => {
      const mode = seg.getAttribute('data-font-mode') as FontMode;
      if (mode) {
        setFontMode(mode);
        toast(`Font family set to ${mode === 'system' ? 'System Font' : 'Outfit (Default)'}`);
      }
    });
  });

  // Navigation Bar Style buttons
  const navSegments = document.querySelectorAll<HTMLElement>('[data-nav-style]');
  navSegments.forEach((seg) => {
    seg.addEventListener('click', () => {
      const style = seg.getAttribute('data-nav-style') as NavBarStyle;
      if (style) {
        setNavBarStyle(style);
        toast(`Navigation bar set to ${style === 'floating' ? 'Floating' : 'Default'}`);
      }
    });
  });

  // Reduce Effects toggle
  const reduceToggle = document.getElementById('reduce-effects-toggle') as HTMLInputElement | null;
  if (reduceToggle) {
    reduceToggle.addEventListener('change', (e) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      setReduceEffects(isChecked);
      toast(`Effects ${isChecked ? 'reduced (blur disabled)' : 'enabled'}`);
    });
  }

  // Accent Color dots
  const colorDots = document.querySelectorAll<HTMLElement>('.color-dot:not(#custom-color-indicator)');
  colorDots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const hex = dot.getAttribute('data-color');
      if (hex) {
        setManualSeedColor(hex);
        toast('Theme accent updated');
      }
    });
  });

  const picker = document.getElementById('custom-color-picker') as HTMLInputElement | null;
  const pickerIndicator = document.getElementById('custom-color-indicator');

  if (picker && pickerIndicator) {
    const onColorChange = (e: Event) => {
      const val = (e.target as HTMLInputElement).value;
      setManualSeedColor(val);
    };
    picker.addEventListener('input', onColorChange);
    picker.addEventListener('change', onColorChange);

    pickerIndicator.addEventListener('click', (e) => {
      if (e.target === pickerIndicator) {
        picker.click();
      }
    });
  }

  const resetMonetBtn = document.getElementById('reset-monet-btn');
  if (resetMonetBtn) {
    resetMonetBtn.addEventListener('click', async () => {
      await resetToMonet();
    });
  }

  // Force Bypass buttons
  const bypassOff = document.getElementById('bypass-off-btn');
  const bypassOn = document.getElementById('bypass-on-btn');

  if (bypassOff && bypassOn) {
    bypassOff.addEventListener('click', async () => {
      const ok = await setBypassMode(false);
      if (ok) {
        bypassOff.classList.add('active');
        bypassOn.classList.remove('active');
        toast('Force bypass disabled');
      }
    });

    bypassOn.addEventListener('click', async () => {
      const ok = await setBypassMode(true);
      if (ok) {
        bypassOn.classList.add('active');
        bypassOff.classList.remove('active');
        toast('Force bypass enabled');
      }
    });
  }
}
