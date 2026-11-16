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
      itemHeight: 56,
      overscan: 6,
      onSelectProp: (prop) => {
        openPropEditSheet(prop);
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
  if (filtered !== total) {
    badge.innerText = `${filtered} / ${total} props`;
  } else {
    badge.innerText = `${total} props`;
  }
}

export function openPropEditSheet(prop?: SystemPropItem): void {
  const backdrop = document.getElementById('prop-edit-sheet-backdrop');
  const title = document.getElementById('prop-edit-sheet-title');
  const subtitle = document.getElementById('prop-edit-sheet-subtitle');
  const keyInput = document.getElementById('prop-edit-key') as HTMLInputElement | null;
  const origVal = document.getElementById('prop-edit-orig-val');
  const liveVal = document.getElementById('prop-edit-live-val');
  const valInput = document.getElementById('prop-edit-value') as HTMLInputElement | null;
  const bootSwitch = document.getElementById('prop-edit-boot-switch') as HTMLInputElement | null;
  const resetBtn = document.getElementById('prop-edit-reset-btn');
  const deleteBtn = document.getElementById('prop-edit-delete-btn');
  const metaCard = document.getElementById('prop-edit-meta-card');

  if (!backdrop) return;

  if (prop) {
    activeEditProp = prop;
    if (title) title.innerText = 'Edit Property';
    if (subtitle) subtitle.innerText = prop.key;
    if (metaCard) metaCard.style.display = 'flex';
    if (keyInput) {
      keyInput.value = prop.key;
      keyInput.readOnly = true;
      keyInput.disabled = true;
    }
    if (origVal) origVal.innerText = prop.defaultValue || '(none)';
    if (liveVal) liveVal.innerText = prop.value || '(empty)';
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

  backdrop.style.display = 'flex';
  requestAnimationFrame(() => backdrop.classList.add('active'));

  try {
    history.pushState({ modal: 'prop-edit' }, '');
  } catch (e) {}
}

export function closePropEditSheet(): void {
  const backdrop = document.getElementById('prop-edit-sheet-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    setTimeout(() => {
      backdrop.style.display = 'none';
    }, 250);
  }
}

export function openPropImportDialog(): void {
  const backdrop = document.getElementById('prop-import-dialog-backdrop');
  const fileInput = document.getElementById('prop-import-file-input') as HTMLInputElement | null;
  const fileName = document.getElementById('prop-import-filename');
  const fileNamePill = document.getElementById('prop-import-filename-pill');
  const textarea = document.getElementById('prop-import-paste-textarea') as HTMLTextAreaElement | null;
  const diffContainer = document.getElementById('prop-import-diff-container');
  const diffTbody = document.getElementById('prop-import-diff-tbody');

  if (fileInput) fileInput.value = '';
  if (fileName) fileName.innerText = '';
  if (fileNamePill) fileNamePill.style.display = 'none';
  if (textarea) textarea.value = '';
  if (diffContainer) diffContainer.style.display = 'none';
  if (diffTbody) diffTbody.innerHTML = '';
  parsedImportDiffs = [];

  if (backdrop) {
    backdrop.style.display = 'flex';
    requestAnimationFrame(() => backdrop.classList.add('active'));
    try {
      history.pushState({ modal: 'prop-import' }, '');
    } catch (e) {}
  }
}

export function closePropImportDialog(): void {
  const backdrop = document.getElementById('prop-import-dialog-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    setTimeout(() => {
      backdrop.style.display = 'none';
    }, 250);
  }
}

export function updateImportDiffPreview(rawText: string): void {
  const diffContainer = document.getElementById('prop-import-diff-container');
  const diffTbody = document.getElementById('prop-import-diff-tbody');
  if (!diffContainer || !diffTbody) return;

  const parsed = parsePropsText(rawText);
  const keys = Object.keys(parsed);

  if (keys.length === 0) {
    diffContainer.style.display = 'none';
    diffTbody.innerHTML = '';
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
  diffTbody.innerHTML = parsedImportDiffs
    .map((diff, index) => {
      const tagClass =
        diff.status === 'add'
          ? 'diff-tag diff-tag-new'
          : diff.status === 'modify'
          ? 'diff-tag diff-tag-change'
          : 'diff-tag diff-tag-same';
      const tagLabel = diff.status === 'add' ? 'NEW' : diff.status === 'modify' ? 'MOD' : 'SAME';
      return `
        <tr style="border-bottom: 1px solid var(--md-sys-color-outline-variant);">
          <td style="padding: 6px 8px; vertical-align: middle;">
            <input type="checkbox" class="prop-import-item-chk" data-idx="${index}" ${diff.selected ? 'checked' : ''}>
          </td>
          <td style="padding: 6px 8px; font-family: var(--font-mono); font-weight: 500; word-break: break-all;">
            ${escapeHtml(diff.key)}
            <span class="${tagClass}" style="margin-left: 4px; font-size: 0.65rem; padding: 1px 4px; border-radius: 4px;">${tagLabel}</span>
          </td>
          <td class="diff-before" style="padding: 6px 8px; font-family: var(--font-mono); color: var(--md-sys-color-on-surface-variant); word-break: break-all;">
            ${escapeHtml(diff.currentValue || '(none)')}
          </td>
          <td class="diff-after" style="padding: 6px 8px; font-family: var(--font-mono); color: var(--md-sys-color-primary); font-weight: 600; word-break: break-all;">
            ${escapeHtml(diff.newValue)}
          </td>
        </tr>
      `;
    })
    .join('');

  // Wire individual item checkboxes
  diffTbody.querySelectorAll<HTMLInputElement>('.prop-import-item-chk').forEach((chk) => {
    chk.addEventListener('change', () => {
      const idx = parseInt(chk.getAttribute('data-idx') ?? '-1', 10);
      if (idx >= 0 && parsedImportDiffs[idx]) {
        parsedImportDiffs[idx].selected = chk.checked;
      }
    });
  });
}

export function openPropExportSheet(): void {
  const backdrop = document.getElementById('prop-export-sheet-backdrop');
  if (backdrop) {
    backdrop.style.display = 'flex';
    requestAnimationFrame(() => backdrop.classList.add('active'));
    try {
      history.pushState({ modal: 'prop-export' }, '');
    } catch (e) {}
  }
}

export function closePropExportSheet(): void {
  const backdrop = document.getElementById('prop-export-sheet-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    setTimeout(() => {
      backdrop.style.display = 'none';
    }, 250);
  }
}

export function closePropsSpeedDial(): void {
  const propsFabContainer = document.getElementById('props-fab-container');
  const propsFabScrim = document.getElementById('props-fab-scrim');
  const propsFabTrigger = document.getElementById('props-fab-trigger');

  if (propsFabContainer) propsFabContainer.classList.remove('speed-dial-open');
  if (propsFabScrim) propsFabScrim.classList.remove('visible');
  if (propsFabTrigger) propsFabTrigger.setAttribute('aria-expanded', 'false');
}

export function togglePropsSpeedDial(): void {
  const propsFabContainer = document.getElementById('props-fab-container');
  const propsFabScrim = document.getElementById('props-fab-scrim');
  const propsFabTrigger = document.getElementById('props-fab-trigger');

  if (!propsFabContainer) return;
  const willOpen = !propsFabContainer.classList.contains('speed-dial-open');
  propsFabContainer.classList.toggle('speed-dial-open', willOpen);
  if (propsFabScrim) propsFabScrim.classList.toggle('visible', willOpen);
  if (propsFabTrigger) propsFabTrigger.setAttribute('aria-expanded', String(willOpen));
}

export function setupPropsListeners(): void {
  // Speed Dial FAB Controls
  const propsFabScrim = document.getElementById('props-fab-scrim');
  const propsFabTrigger = document.getElementById('props-fab-trigger');

  if (propsFabTrigger) {
    propsFabTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePropsSpeedDial();
    });
  }

  if (propsFabScrim) {
    propsFabScrim.addEventListener('click', () => {
      closePropsSpeedDial();
    });
  }

  const fabAddProp = document.getElementById('fab-add-prop');
  if (fabAddProp) {
    fabAddProp.addEventListener('click', () => {
      closePropsSpeedDial();
      openPropEditSheet();
    });
  }

  const fabImportProps = document.getElementById('fab-import-props');
  if (fabImportProps) {
    fabImportProps.addEventListener('click', () => {
      closePropsSpeedDial();
      openPropImportDialog();
    });
  }

  const fabExportProps = document.getElementById('fab-export-props');
  if (fabExportProps) {
    fabExportProps.addEventListener('click', () => {
      closePropsSpeedDial();
      openPropExportSheet();
    });
  }

  const handleResetProps = async () => {
    closePropsSpeedDial();
    const confirmed = await showConfirmDialog({
      title: 'Reset All Properties?',
      message: 'This will revert all modified and custom properties back to original system defaults and clear boot overrides.',
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
  };

  const fabResetProps = document.getElementById('fab-reset-props');
  if (fabResetProps) {
    fabResetProps.addEventListener('click', handleResetProps);
  }

  // Legacy/Fallback Action Bar Buttons
  const btnAddProp = document.getElementById('btn-add-prop');
  if (btnAddProp) {
    btnAddProp.addEventListener('click', () => {
      openPropEditSheet();
    });
  }

  const btnImportProps = document.getElementById('btn-import-props');
  if (btnImportProps) {
    btnImportProps.addEventListener('click', () => {
      openPropImportDialog();
    });
  }

  const btnExportProps = document.getElementById('btn-export-props');
  if (btnExportProps) {
    btnExportProps.addEventListener('click', () => {
      openPropExportSheet();
    });
  }

  const btnResetProps = document.getElementById('btn-reset-props');
  if (btnResetProps) {
    btnResetProps.addEventListener('click', handleResetProps);
  }

  // Search input and clear button
  const propSearchInput = document.getElementById('prop-search-input') as HTMLInputElement | null;
  const propSearchClear = document.getElementById('prop-search-clear');
  if (propSearchInput) {
    propSearchInput.addEventListener('input', () => {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        const term = propSearchInput.value;
        if (virtualPropList) {
          virtualPropList.setSearchTerm(term);
          updatePropsCountBadge();
        }
        if (propSearchClear) {
          propSearchClear.style.display = term ? 'block' : 'none';
        }
      }, 150);
    });
  }

  if (propSearchClear && propSearchInput) {
    propSearchClear.addEventListener('click', () => {
      propSearchInput.value = '';
      propSearchClear.style.display = 'none';
      if (virtualPropList) {
        virtualPropList.setSearchTerm('');
        updatePropsCountBadge();
      }
      propSearchInput.focus();
    });
  }

  // Filter chips
  const filterChips = document.querySelectorAll<HTMLElement>('[data-prop-filter]');
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filterChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const mode = (chip.getAttribute('data-prop-filter') || 'all') as 'all' | 'modified' | 'boot';
      if (virtualPropList) {
        virtualPropList.setFilterMode(mode);
        updatePropsCountBadge();
      }
    });
  });

  // Edit sheet listeners
  const editBackdrop = document.getElementById('prop-edit-sheet-backdrop');
  if (editBackdrop) {
    editBackdrop.addEventListener('click', (e) => {
      if (e.target === editBackdrop) closePropEditSheet();
    });
  }

  const editCloseBtn = document.getElementById('prop-edit-sheet-close');
  if (editCloseBtn) {
    editCloseBtn.addEventListener('click', closePropEditSheet);
  }

  const editCancelBtn = document.getElementById('prop-edit-cancel-btn');
  if (editCancelBtn) {
    editCancelBtn.addEventListener('click', closePropEditSheet);
  }

  const savePropBtn = document.getElementById('prop-edit-save-btn');
  if (savePropBtn) {
    savePropBtn.addEventListener('click', async () => {
      const keyInput = document.getElementById('prop-edit-key') as HTMLInputElement | null;
      const valInput = document.getElementById('prop-edit-value') as HTMLInputElement | null;
      const bootSwitch = document.getElementById('prop-edit-boot-switch') as HTMLInputElement | null;

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
  }

  const resetPropBtn = document.getElementById('prop-edit-reset-btn');
  if (resetPropBtn) {
    resetPropBtn.addEventListener('click', async () => {
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
  }

  const deletePropBtn = document.getElementById('prop-edit-delete-btn');
  if (deletePropBtn) {
    deletePropBtn.addEventListener('click', async () => {
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
  }

  // Import dialog listeners
  const importBackdrop = document.getElementById('prop-import-dialog-backdrop');
  if (importBackdrop) {
    importBackdrop.addEventListener('click', (e) => {
      if (e.target === importBackdrop) closePropImportDialog();
    });
  }

  const importCancelBtn = document.getElementById('prop-import-cancel-btn');
  if (importCancelBtn) {
    importCancelBtn.addEventListener('click', closePropImportDialog);
  }

  const importFileInput = document.getElementById('prop-import-file-input') as HTMLInputElement | null;
  const importFilename = document.getElementById('prop-import-filename');
  const importTextarea = document.getElementById('prop-import-paste-textarea') as HTMLTextAreaElement | null;

  if (importFileInput) {
    importFileInput.addEventListener('change', () => {
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
  }

  if (importTextarea) {
    importTextarea.addEventListener('input', () => {
      if (textareaDebounceTimer) clearTimeout(textareaDebounceTimer);
      textareaDebounceTimer = setTimeout(() => {
        updateImportDiffPreview(importTextarea.value);
      }, 200);
    });
  }

  const selectAllChk = document.getElementById('prop-import-select-all') as HTMLInputElement | null;
  if (selectAllChk) {
    selectAllChk.addEventListener('change', () => {
      const checked = selectAllChk.checked;
      parsedImportDiffs.forEach((d) => (d.selected = checked));
      document.querySelectorAll<HTMLInputElement>('.prop-import-item-chk').forEach((chk) => {
        chk.checked = checked;
      });
    });
  }

  const importSubmitBtn = document.getElementById('prop-import-submit-btn');
  if (importSubmitBtn) {
    importSubmitBtn.addEventListener('click', async () => {
      if (parsedImportDiffs.length === 0 && importTextarea && importTextarea.value.trim()) {
        updateImportDiffPreview(importTextarea.value);
      }

      const selectedDiffs = parsedImportDiffs.filter((d) => d.selected !== false);
      if (selectedDiffs.length === 0) {
        toast('No properties selected for import');
        return;
      }

      const applyLiveChk = document.getElementById('prop-import-apply-live') as HTMLInputElement | null;
      const setBootChk = document.getElementById('prop-import-set-boot') as HTMLInputElement | null;
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
  }

  // Export sheet listeners
  const exportBackdrop = document.getElementById('prop-export-sheet-backdrop');
  if (exportBackdrop) {
    exportBackdrop.addEventListener('click', (e) => {
      if (e.target === exportBackdrop) closePropExportSheet();
    });
  }

  const exportCloseBtn = document.getElementById('prop-export-sheet-close');
  if (exportCloseBtn) {
    exportCloseBtn.addEventListener('click', closePropExportSheet);
  }

  const exportCloseBottomBtn = document.getElementById('prop-export-close-btn');
  if (exportCloseBottomBtn) {
    exportCloseBottomBtn.addEventListener('click', closePropExportSheet);
  }

  // Export radio cards selection
  const exportRadioList = document.getElementById('prop-export-radio-list');
  if (exportRadioList) {
    const cards = exportRadioList.querySelectorAll<HTMLElement>('.m3e-radio-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        cards.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
      });
    });
  }

  const getExportScope = (): boolean => {
    const activeCard = document.querySelector<HTMLElement>(
      '#prop-export-radio-list .m3e-radio-card.active'
    );
    return activeCard?.getAttribute('data-export-choice') === 'all';
  };

  const exportDownloadBtn = document.getElementById('prop-export-download-btn');
  if (exportDownloadBtn) {
    exportDownloadBtn.addEventListener('click', () => {
      const includeAll = getExportScope();
      const text = propsEngine.exportProps(includeAll);
      downloadTextFile('sweetclocker_props.prop', text);
      toast('Properties downloaded as .prop file');
      closePropExportSheet();
    });
  }

  const exportCopyBtn = document.getElementById('prop-export-copy-btn');
  if (exportCopyBtn) {
    exportCopyBtn.addEventListener('click', async () => {
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
}
