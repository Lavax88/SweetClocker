import type { ContrastLevel, ThemeVariant } from '@m3e/web/theme';
import type { M3eSegmentedButtonElement } from '@m3e/web/segmented-button';
import type { M3eBottomSheetElement } from '@m3e/web/bottom-sheet';
import type { M3eSelectionListElement } from '@m3e/web/list';
import type { M3eSwitchElement } from '@m3e/web/switch';
import {
  setThemeMode,
  setThemeVariant,
  setThemeContrast,
  setFontMode,
  setReduceEffects,
  setManualSeedColor,
  resetToMonet
} from '../../theme/theme';
import type { ThemeMode, FontMode } from '../../theme/types';
import { setBypassMode } from '../../telemetry/sampler';
import { toast } from '../../bridge/ksu';

export function initPreferencesScreen(): void {
  // Theme Mode segmented button
  const modeSeg = document.getElementById('pref-theme-mode') as M3eSegmentedButtonElement | null;
  if (modeSeg) {
    modeSeg.addEventListener('change', () => {
      const val = modeSeg.value;
      const mode = (Array.isArray(val) ? val[0] : val) as ThemeMode | undefined;
      if (mode) {
        setThemeMode(mode);
        const label = mode === 'auto' ? 'Auto (System)' : mode.toUpperCase();
        toast(`Theme mode set to ${label}`);
      }
    });
  }

  // Palette Variant bottom sheet picker
  const variantTrigger = document.getElementById('pref-theme-variant-trigger');
  const variantSheet = document.getElementById('variant-sheet') as M3eBottomSheetElement | null;
  const variantList = document.getElementById('variant-sheet-options') as M3eSelectionListElement | null;

  variantTrigger?.addEventListener('click', () => {
    if (variantSheet) {
      variantSheet.show(0);
      try {
        history.pushState({ modal: 'variant-sheet' }, '');
      } catch (_) {}
    }
  });

  variantList?.addEventListener('change', () => {
    const raw = variantList.value;
    const variant = (Array.isArray(raw) ? raw[0] : raw) as ThemeVariant | undefined;
    if (variant) {
      setThemeVariant(variant);
      variantSheet?.hide();
      toast(`Palette variant set to ${variant}`);
    }
  });

  // Contrast Level segmented button
  const contrastSeg = document.getElementById('pref-theme-contrast') as M3eSegmentedButtonElement | null;
  if (contrastSeg) {
    contrastSeg.addEventListener('change', () => {
      const val = contrastSeg.value;
      const contrast = (Array.isArray(val) ? val[0] : val) as ContrastLevel | undefined;
      if (contrast) {
        setThemeContrast(contrast);
        toast(`Contrast set to ${contrast}`);
      }
    });
  }

  // Font Family segmented button
  const fontSeg = document.getElementById('pref-font-mode') as M3eSegmentedButtonElement | null;
  if (fontSeg) {
    fontSeg.addEventListener('change', () => {
      const val = fontSeg.value;
      const mode = (Array.isArray(val) ? val[0] : val) as FontMode | undefined;
      if (mode) {
        setFontMode(mode);
        toast(`Font family set to ${mode === 'system' ? 'System Font' : 'Outfit (Default)'}`);
      }
    });
  }

  // Reduce Visual Effects switch
  const reduceToggle = document.getElementById('reduce-effects-toggle') as M3eSwitchElement | null;
  if (reduceToggle) {
    reduceToggle.addEventListener('change', () => {
      setReduceEffects(reduceToggle.checked);
      toast(`Effects ${reduceToggle.checked ? 'reduced (standard motion)' : 'expressive'}`);
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
  }

  const resetMonetBtn = document.getElementById('reset-monet-btn');
  if (resetMonetBtn) {
    resetMonetBtn.addEventListener('click', async () => {
      await resetToMonet();
      toast('Synced with system Monet');
    });
  }

  // Force Bypass Override segmented button
  const bypassSeg = document.getElementById('pref-bypass-mode') as M3eSegmentedButtonElement | null;
  if (bypassSeg) {
    bypassSeg.addEventListener('change', async () => {
      const val = bypassSeg.value;
      const enabled = (Array.isArray(val) ? val[0] : val) === 'true';
      const ok = await setBypassMode(enabled);
      if (ok) {
        toast(`Force bypass ${enabled ? 'enabled' : 'disabled'}`);
      }
    });
  }
}
