import type { M3eBottomSheetElement } from '@m3e/web/bottom-sheet';
import type { M3eDialogElement } from '@m3e/web/dialog';
import type { M3eFabMenuElement } from '@m3e/web/fab-menu';
import type { M3eFilterChipSetElement } from '@m3e/web/chips';
import type { M3eSelectionListElement } from '@m3e/web/list';
import type { M3eCheckboxElement } from '@m3e/web/checkbox';
import type { M3eSwitchElement } from '@m3e/web/switch';
import { propsEngine, parsePropsText } from '../../telemetry/propsEngine';
import type { SystemPropItem, PropImportDiffItem } from '../../telemetry/types';
import { VirtualPropList } from '../components/virtualPropList';
import { toast } from '../../bridge/ksu';
import { escapeHtml } from '../../utils/escape';
import { showConfirmDialog } from '../components/confirmDialog';

let virtualPropList: VirtualPropList | null = null;
let currentPropsList: SystemPropItem[] = [];
let activeEditProp: SystemPropItem | null = null;
let parsedImportDiffs: PropImportDiffItem[] = [];
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let textareaDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function renderPropsView(forceRefresh = false): Promise<void> {
  const container = document.getElementById('props-list-container');
  if (!container) return;

  if (!virtualPropList) {
    virtualPropList = new VirtualPropList({
      container,
      itemHeight: 68,
      overscan: 6,
      onSelectProp: (prop) => {
        openPropEditSheet(prop);
      },
      onResetProp: async (prop) => {
        toast(`Resetting ${prop.key}...`);
        const ok = await propsEngine.resetProp(prop.key);
        if (ok) {
          toast(`Property ${prop.key} reset to default!`);
          await renderPropsView(false);
        } else {
          toast(`Failed to reset ${prop.key}`);
        }
      }
    });
  }

  try {
    const state = await propsEngine.fetchProps(forceRefresh);
    currentPropsList = state.props;
    virtualPropList.setProps(currentPropsList);
    updatePropsCountBadge();
  } catch (err) {
    console.error('Failed to load system properties:', err);
    toast('Failed to load system properties');
  }
}

export function updatePropsCountBadge(): void {
  const badge = document.getElementById('props-count-badge');
  if (!badge || !virtualPropList) return;
  const filtered = virtualPropList.getFilteredCount();
  const total = virtualPropList.getTotalCount();
  badge.innerText = filtered !== total ? `${filtered} / ${total} props` : `${total} props`;
}

export function openPropEditSheet(prop?: SystemPropItem): void {
  const sheet = document.getElementById('prop-edit-sheet') as M3eBottomSheetElement | null;
  const title = document.getElementById('prop-edit-sheet-title');
  const subtitle = document.getElementById('prop-edit-sheet-subtitle');
  const keyInput = document.getElementById('prop-edit-key') as HTMLInputElement | null;
  const origVal = document.getElementById('prop-edit-orig-val');
  const liveVal = document.getElementById('prop-edit-live-val');
  const valInput = document.getElementById('prop-edit-value') as HTMLInputElement | null;
  const bootSwitch = document.getElementById('prop-edit-boot-switch') as M3eSwitchElement | null;
  const resetBtn = document.getElementById('prop-edit-reset-btn');
  const deleteBtn = document.getElementById('prop-edit-delete-btn');
  const metaCard = document.getElementById('prop-edit-meta-card');

  if (!sheet) return;

  if (prop) {
    activeEditProp = prop;
    if (title) title.innerText = 'Edit Property';
    if (subtitle) subtitle.innerText = prop.key;
    if (metaCard) metaCard.style.display = '';
    if (keyInput) {
      keyInput.value = prop.key;
      keyInput.readOnly = true;
      keyInput.disabled = true;
    }
    if (origVal) origVal.innerText = prop.defaultValue || '(none)';
    if (liveVal) liveVal.innerText = `Live: ${prop.value || '(empty)'}`;
    if (valInput) valInput.value = prop.customValue !== null ? prop.customValue : prop.value;
    if (bootSwitch) bootSwitch.checked = prop.applyBoot;

    if (resetBtn) {
      resetBtn.style.display = prop.isModified || prop.applyBoot ? 'inline-flex' : 'none';
    }
    if (deleteBtn) {
      deleteBtn.style.display = prop.isCustom ? 'inline-flex' : 'none';
    }
  } else {
    activeEditProp = null;
    if (title) title.innerText = 'Add Property';
    if (subtitle) subtitle.innerText = 'Create custom system property';
    if (metaCard) metaCard.style.display = 'none';
    if (keyInput) {
      keyInput.value = '';
      keyInput.readOnly = false;
      keyInput.disabled = false;
    }
    if (origVal) origVal.innerText = '(new)';
    if (liveVal) liveVal.innerText = '(none)';
    if (valInput) valInput.value = '';
    if (bootSwitch) bootSwitch.checked = true;

    if (resetBtn) resetBtn.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = 'none';
  }

  sheet.show(0);

  try {
    history.pushState({ modal: 'prop-edit' }, '');
  } catch (_) {}
}

export function closePropEditSheet(): void {
  const sheet = document.getElementById('prop-edit-sheet') as M3eBottomSheetElement | null;
  if (sheet && sheet.open) sheet.hide();
}

export function openPropImportDialog(): void {
  const dialog = document.getElementById('prop-import-dialog') as M3eDialogElement | null;
  const fileInput = document.getElementById('prop-import-file-input') as HTMLInputElement | null;
  const fileName = document.getElementById('prop-import-filename');
  const fileNamePill = document.getElementById('prop-import-filename-pill');
  const textarea = document.getElementById('prop-import-paste-textarea') as HTMLTextAreaElement | null;
  const diffContainer = document.getElementById('prop-import-diff-container');
  const diffList = document.getElementById('prop-import-diff-list');

  if (fileInput) fileInput.value = '';
  if (fileName) fileName.innerText = '';
  if (fileNamePill) fileNamePill.style.display = 'none';
  if (textarea) textarea.value = '';
  if (diffContainer) diffContainer.style.display = 'none';
  if (diffList) diffList.innerHTML = '';
  parsedImportDiffs = [];

  if (dialog) {
    dialog.show();
    try {
      history.pushState({ modal: 'prop-import' }, '');
    } catch (_) {}
  }
}

export function closePropImportDialog(): void {
  const dialog = document.getElementById('prop-import-dialog') as M3eDialogElement | null;
  if (dialog && dialog.open) dialog.hide('cancel');
}

export function updateImportDiffPreview(rawText: string): void {
  const diffContainer = document.getElementById('prop-import-diff-container');
  const diffList = document.getElementById('prop-import-diff-list');
  if (!diffContainer || !diffList) return;

  const parsed = parsePropsText(rawText);
  const keys = Object.keys(parsed);

  if (keys.length === 0) {
    diffContainer.style.display = 'none';
    diffList.innerHTML = '';
    parsedImportDiffs = [];
    return;
  }

  const countBadge = document.getElementById('prop-import-count-badge');
  if (countBadge) countBadge.innerText = `${keys.length} items`;

  const currentMap = new Map<string, string>();
  for (const item of currentPropsList) {
    currentMap.set(item.key, item.value);
  }

  parsedImportDiffs = keys.map((key) => {
    const currentVal = currentMap.get(key) ?? '';
    const newVal = parsed[key] ?? '';
    const status: 'add' | 'modify' | 'unchanged' = !currentMap.has(key)
      ? 'add'
      : currentVal !== newVal
        ? 'modify'
        : 'unchanged';

    return {
      key,
      currentValue: currentVal,
      newValue: newVal,
      selected: true,
      status
    };
  });

  diffContainer.style.display = 'block';
  diffList.innerHTML = parsedImportDiffs
    .map((diff, index) => {
      const tagClass =
        diff.status === 'add'
          ? 'm3e-tag-custom'
          : diff.status === 'modify'
            ? 'm3e-tag-modified'
            : 'm3e-tag-ro';
      const tagLabel = diff.status === 'add' ? 'NEW' : diff.status === 'modify' ? 'MOD' : 'SAME';
      return `
        <m3e-list-item>
          <m3e-checkbox slot="leading" class="prop-import-item-chk" data-idx="${index}" ${diff.selected ? 'checked' : ''}></m3e-checkbox>
          <span class="mono-input">${escapeHtml(diff.key)}</span>
          <span slot="supporting-text" class="mono-input">${escapeHtml(diff.currentValue || '(none)')} → ${escapeHtml(diff.newValue)}</span>
          <m3e-badge slot="trailing" size="large" class="${tagClass}">${tagLabel}</m3e-badge>
        </m3e-list-item>
      `;
    })
    .join('');

  diffList.querySelectorAll<M3eCheckboxElement>('.prop-import-item-chk').forEach((chk) => {
    chk.addEventListener('change', () => {
      const idx = parseInt(chk.getAttribute('data-idx') ?? '-1', 10);
      if (idx >= 0 && parsedImportDiffs[idx]) {
        parsedImportDiffs[idx].selected = chk.checked;
      }
    });
  });
}

export function openPropExportSheet(): void {
  const sheet = document.getElementById('prop-export-sheet') as M3eBottomSheetElement | null;
  if (sheet) {
    sheet.show(0);
    try {
      history.pushState({ modal: 'prop-export' }, '');
    } catch (_) {}
  }
}

export function closePropExportSheet(): void {
  const sheet = document.getElementById('prop-export-sheet') as M3eBottomSheetElement | null;
  if (sheet && sheet.open) sheet.hide();
}

export function closePropsSpeedDial(): void {
  const menu = document.getElementById('props-fab-menu') as M3eFabMenuElement | null;
  if (menu && menu.isOpen) {
    menu.hide(false);
  }
}

export function setupPropsListeners(): void {
  const fabAddProp = document.getElementById('fab-add-prop');
  fabAddProp?.addEventListener('click', () => {
    closePropsSpeedDial();
    openPropEditSheet();
  });

  const fabImportProps = document.getElementById('fab-import-props');
  fabImportProps?.addEventListener('click', () => {
    closePropsSpeedDial();
    openPropImportDialog();
  });

  const fabExportProps = document.getElementById('fab-export-props');
  fabExportProps?.addEventListener('click', () => {
    closePropsSpeedDial();
    openPropExportSheet();
  });

  const fabResetProps = document.getElementById('fab-reset-props');
  fabResetProps?.addEventListener('click', async () => {
    closePropsSpeedDial();
    const confirmed = await showConfirmDialog({
      title: 'Reset All Properties?',
      message:
        'This will revert all modified and custom properties back to original system defaults and clear boot overrides.',
      confirmLabel: 'Reset All',
      cancelLabel: 'Cancel',
      isDanger: true
    });
    if (!confirmed) return;

    toast('Resetting all properties to defaults...');
    const ok = await propsEngine.resetAllProps();
    if (ok) {
      toast('All properties reset to original defaults!');
      await renderPropsView(false);
    } else {
      toast('Failed to reset all properties');
    }
  });

  // Search bar
  const propSearchBar = document.getElementById('prop-search-bar');
  const propSearchInput = document.getElementById('prop-search-input') as HTMLInputElement | null;
  if (propSearchInput) {
    propSearchInput.addEventListener('input', () => {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        if (virtualPropList) {
          virtualPropList.setSearchTerm(propSearchInput.value);
          updatePropsCountBadge();
        }
      }, 150);
    });
  }

  propSearchBar?.addEventListener('clear', () => {
    if (virtualPropList) {
      virtualPropList.setSearchTerm('');
      updatePropsCountBadge();
    }
  });

  // Filter chips
  const filterChipSet = document.getElementById('prop-filter-chips') as M3eFilterChipSetElement | null;
  filterChipSet?.addEventListener('change', () => {
    const val = filterChipSet.value;
    const mode = ((Array.isArray(val) ? val[0] : val) || 'all') as 'all' | 'modified' | 'boot';
    if (virtualPropList) {
      virtualPropList.setFilterMode(mode);
      updatePropsCountBadge();
    }
  });

  // Edit sheet listeners
  document.getElementById('prop-edit-cancel-btn')?.addEventListener('click', closePropEditSheet);

  document.getElementById('prop-edit-save-btn')?.addEventListener('click', async () => {
    const keyInput = document.getElementById('prop-edit-key') as HTMLInputElement | null;
    const valInput = document.getElementById('prop-edit-value') as HTMLInputElement | null;
    const bootSwitch = document.getElementById('prop-edit-boot-switch') as M3eSwitchElement | null;

    const key = keyInput?.value.trim() ?? '';
    const val = valInput?.value.trim() ?? '';
    const boot = bootSwitch?.checked ?? false;

    if (!key) {
      toast('Property key cannot be empty');
      return;
    }

    toast(`Applying ${key}...`);
    const ok = await propsEngine.applyProp(key, val, boot);
    if (ok) {
      toast(`Property ${key} saved & applied!`);
      closePropEditSheet();
      await renderPropsView(false);
    } else {
      toast(`Failed to apply property ${key}`);
    }
  });

  document.getElementById('prop-edit-reset-btn')?.addEventListener('click', async () => {
    if (!activeEditProp) return;
    const key = activeEditProp.key;
    toast(`Resetting ${key}...`);
    const ok = await propsEngine.resetProp(key);
    if (ok) {
      toast(`Property ${key} reset to default!`);
      closePropEditSheet();
      await renderPropsView(false);
    } else {
      toast(`Failed to reset ${key}`);
    }
  });

  document.getElementById('prop-edit-delete-btn')?.addEventListener('click', async () => {
    if (!activeEditProp) return;
    const key = activeEditProp.key;
    toast(`Deleting custom property ${key}...`);
    const ok = await propsEngine.resetProp(key);
    if (ok) {
      toast(`Custom property ${key} deleted!`);
      closePropEditSheet();
      await renderPropsView(false);
    } else {
      toast(`Failed to delete ${key}`);
    }
  });

  // Import dialog listeners
  document.getElementById('prop-import-cancel-btn')?.addEventListener('click', closePropImportDialog);

  const importFileInput = document.getElementById('prop-import-file-input') as HTMLInputElement | null;
  document.getElementById('prop-import-choose-btn')?.addEventListener('click', () => {
    importFileInput?.click();
  });

  const importFilename = document.getElementById('prop-import-filename');
  const importTextarea = document.getElementById('prop-import-paste-textarea') as HTMLTextAreaElement | null;

  importFileInput?.addEventListener('change', () => {
    const file = importFileInput.files?.[0];
    if (file) {
      if (importFilename) importFilename.innerText = file.name;
      const filenamePill = document.getElementById('prop-import-filename-pill');
      if (filenamePill) filenamePill.style.display = 'inline-flex';
      const reader = new FileReader();
      reader.onload = () => {
        const text = (reader.result as string) || '';
        if (importTextarea) importTextarea.value = text;
        updateImportDiffPreview(text);
      };
      reader.readAsText(file);
    }
  });

  importTextarea?.addEventListener('input', () => {
    if (textareaDebounceTimer) clearTimeout(textareaDebounceTimer);
    textareaDebounceTimer = setTimeout(() => {
      updateImportDiffPreview(importTextarea.value);
    }, 200);
  });

  const selectAllChk = document.getElementById('prop-import-select-all') as M3eCheckboxElement | null;
  selectAllChk?.addEventListener('change', () => {
    const checked = selectAllChk.checked;
    parsedImportDiffs.forEach((d) => (d.selected = checked));
    document.querySelectorAll<M3eCheckboxElement>('.prop-import-item-chk').forEach((chk) => {
      chk.checked = checked;
    });
  });

  document.getElementById('prop-import-submit-btn')?.addEventListener('click', async () => {
    if (parsedImportDiffs.length === 0 && importTextarea && importTextarea.value.trim()) {
      updateImportDiffPreview(importTextarea.value);
    }

    const selectedDiffs = parsedImportDiffs.filter((d) => d.selected !== false);
    if (selectedDiffs.length === 0) {
      toast('No properties selected for import');
      return;
    }

    const applyLiveChk = document.getElementById('prop-import-apply-live') as M3eSwitchElement | null;
    const setBootChk = document.getElementById('prop-import-set-boot') as M3eSwitchElement | null;
    const applyLive = applyLiveChk?.checked ?? true;
    const setBoot = setBootChk?.checked ?? true;

    toast(`Importing ${selectedDiffs.length} properties...`);
    const ok = await propsEngine.importProps(selectedDiffs, setBoot, applyLive);
    if (ok) {
      toast(`Successfully imported ${selectedDiffs.length} properties!`);
      closePropImportDialog();
      await renderPropsView(false);
    } else {
      toast('Failed to import properties');
    }
  });

  // Export sheet listeners
  document.getElementById('prop-export-close-btn')?.addEventListener('click', closePropExportSheet);

  const getExportScope = (): boolean => {
    const list = document.getElementById('prop-export-radio-list') as M3eSelectionListElement | null;
    const val = list?.value;
    return (Array.isArray(val) ? val[0] : val) === 'all';
  };

  document.getElementById('prop-export-download-btn')?.addEventListener('click', () => {
    const includeAll = getExportScope();
    const text = propsEngine.exportProps(includeAll);
    downloadTextFile('sweetclocker_props.prop', text);
    toast('Properties downloaded as .prop file');
    closePropExportSheet();
  });

  document.getElementById('prop-export-copy-btn')?.addEventListener('click', async () => {
    const includeAll = getExportScope();
    const text = propsEngine.exportProps(includeAll);
    try {
      await navigator.clipboard.writeText(text);
      toast('Properties copied to clipboard!');
      closePropExportSheet();
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      toast('Failed to copy to clipboard');
    }
  });
}
