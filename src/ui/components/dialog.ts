import type { M3eDialogElement } from '@m3e/web/dialog';
import type { M3eCheckboxElement } from '@m3e/web/checkbox';

const HIDE_WARNING_KEY = 'sweetclocker_hide_gpu_warning';

export function showGpuWarningDialog(): void {
  if (localStorage.getItem(HIDE_WARNING_KEY) === 'true') {
    return;
  }
  const dialog = document.getElementById('gpu-warning-dialog') as M3eDialogElement | null;
  if (dialog) {
    dialog.show();
  }
}

export function hideGpuWarningDialog(): void {
  const dontShowCheckbox = document.getElementById(
    'gpu-dont-show-again-checkbox'
  ) as M3eCheckboxElement | null;
  if (dontShowCheckbox && dontShowCheckbox.checked) {
    localStorage.setItem(HIDE_WARNING_KEY, 'true');
  }
  const dialog = document.getElementById('gpu-warning-dialog') as M3eDialogElement | null;
  if (dialog && dialog.open) {
    dialog.hide('dismiss');
  }
}

export function initGpuWarningDialog(): void {
  const dialog = document.getElementById('gpu-warning-dialog') as M3eDialogElement | null;
  if (dialog) {
    dialog.addEventListener('closed', () => {
      const dontShowCheckbox = document.getElementById(
        'gpu-dont-show-again-checkbox'
      ) as M3eCheckboxElement | null;
      if (dontShowCheckbox && dontShowCheckbox.checked) {
        localStorage.setItem(HIDE_WARNING_KEY, 'true');
      }
    });
  }

  const acknowledgeCheckbox = document.getElementById(
    'gpu-acknowledge-checkbox'
  ) as M3eCheckboxElement | null;
  const gpuGrid = document.getElementById('gpu-tuning-grid');

  if (acknowledgeCheckbox && gpuGrid) {
    acknowledgeCheckbox.addEventListener('change', () => {
      gpuGrid.classList.toggle('gpu-controls-disabled', !acknowledgeCheckbox.checked);
    });
  }
}

// Apply at Boot Prompt Dialog
let applyBootResolve: ((result: boolean | null) => void) | null = null;

export function askApplyBoot(opts: {
  title?: string;
  message: string;
}): Promise<boolean | null> {
  return new Promise((resolve) => {
    applyBootResolve = resolve;

    const dialog = document.getElementById('apply-boot-dialog') as M3eDialogElement | null;
    const titleEl = document.getElementById('apply-boot-dialog-title');
    const msgEl = document.getElementById('apply-boot-dialog-message');

    if (titleEl && opts.title) titleEl.innerText = opts.title;
    if (msgEl) msgEl.innerText = opts.message;

    if (dialog) {
      dialog.show();
    } else {
      resolve(null);
      applyBootResolve = null;
      return;
    }

    try {
      history.pushState({ modal: true }, '');
    } catch (_) {}
  });
}

export function hideApplyBootDialog(result: boolean | null = null): void {
  const dialog = document.getElementById('apply-boot-dialog') as M3eDialogElement | null;
  if (dialog && dialog.open) {
    dialog.hide(result === true ? 'boot' : result === false ? 'now' : 'cancel');
  }

  if (applyBootResolve) {
    const res = applyBootResolve;
    applyBootResolve = null;
    res(result);
  }
}

export function initApplyBootDialog(): void {
  const dialog = document.getElementById('apply-boot-dialog') as M3eDialogElement | null;

  dialog?.addEventListener('closed', () => {
    if (applyBootResolve) {
      const res = applyBootResolve;
      applyBootResolve = null;
      const result =
        dialog.returnValue === 'boot' ? true : dialog.returnValue === 'now' ? false : null;
      res(result);
    }
  });
}
