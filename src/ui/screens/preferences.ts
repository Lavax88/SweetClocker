import type { ContrastLevel, ThemeVariant } from '@m3e/web/theme';
import type { M3eButtonElement } from '@m3e/web/button';
import type { M3eBottomSheetElement } from '@m3e/web/bottom-sheet';
import type { M3eSelectionListElement } from '@m3e/web/list';
import type { M3eSwitchElement } from '@m3e/web/switch';
import {
  setThemeMode,
  setThemeVariant,
  setThemeContrast,
  setFontMode,
  setReduceEffects
} from '../../theme/theme';
import type { ThemeMode, FontMode } from '../../theme/types';
import { setBypassMode } from '../../telemetry/sampler';
import { toast } from '../../bridge/ksu';

function bindConnectedGroup(groupId: string, onSelect: (value: string) => void): void {
  const group = document.getElementById(groupId);
  if (!group) return;

  group.addEventListener('change', (event) => {
    const btn = event.target as M3eButtonElement | null;
    if (!btn || btn.tagName !== 'M3E-BUTTON') return;

    // Prevent deselecting the active button in a single-select connected group
    if (!btn.selected) {
      btn.selected = true;
      return;
    }

    const val = btn.getAttribute('value');
    if (val !== null) {
      onSelect(val);
    }
  });
}

export function initPreferencesScreen(): void {
  // Theme Mode connected button group
  bindConnectedGroup('pref-theme-mode', (val) => {
    const mode = val as ThemeMode;
    setThemeMode(mode);
    const label = mode === 'auto' ? 'Auto (System)' : mode.toUpperCase();
    toast(`Theme mode set to ${label}`);
  });

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

  // Contrast Level connected button group
  bindConnectedGroup('pref-theme-contrast', (val) => {
    const contrast = val as ContrastLevel;
    setThemeContrast(contrast);
    toast(`Contrast set to ${contrast}`);
  });

  // Font Family connected button group
  bindConnectedGroup('pref-font-mode', (val) => {
    const mode = val as FontMode;
    setFontMode(mode);
    toast(`Font family set to ${mode === 'system' ? 'System Font' : 'Outfit (Default)'}`);
  });

  // Reduce Visual Effects switch
  const reduceToggle = document.getElementById('reduce-effects-toggle') as M3eSwitchElement | null;
  if (reduceToggle) {
    reduceToggle.addEventListener('change', () => {
      setReduceEffects(reduceToggle.checked);
      toast(`Effects ${reduceToggle.checked ? 'reduced (standard motion)' : 'expressive'}`);
    });
  }

  // Force Bypass Override connected button group
  bindConnectedGroup('pref-bypass-mode', async (val) => {
    const enabled = val === 'true';
    const ok = await setBypassMode(enabled);
    if (ok) {
      toast(`Force bypass ${enabled ? 'enabled' : 'disabled'}`);
    }
  });
}
