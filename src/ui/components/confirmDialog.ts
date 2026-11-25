import type { M3eDialogElement } from '@m3e/web/dialog';
import type { M3eButtonElement } from '@m3e/web/button';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
}

let activeResolver: ((confirmed: boolean) => void) | null = null;
let isInitialized = false;

export function showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    initConfirmDialog();

    const dialog = document.getElementById('m3-confirm-dialog') as M3eDialogElement | null;
    const titleEl = document.getElementById('m3-confirm-dialog-title');
    const messageEl = document.getElementById('m3-confirm-dialog-message');
    const confirmBtn = document.getElementById(
      'm3-confirm-dialog-confirm-btn'
    ) as M3eButtonElement | null;
    const cancelBtn = document.getElementById(
      'm3-confirm-dialog-cancel-btn'
    ) as M3eButtonElement | null;

    if (!dialog || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
      resolve(window.confirm(`${options.title}\n\n${options.message}`));
      return;
    }

    titleEl.innerText = options.title;
    messageEl.innerText = options.message;
    const confirmAction = confirmBtn.querySelector<HTMLElement>('m3e-dialog-action');
    if (confirmAction) confirmAction.innerText = options.confirmLabel || 'Confirm';
    const cancelAction = cancelBtn.querySelector<HTMLElement>('m3e-dialog-action');
    if (cancelAction) cancelAction.innerText = options.cancelLabel || 'Cancel';

    confirmBtn.classList.toggle('danger-filled-btn', Boolean(options.isDanger));

    activeResolver = resolve;
    dialog.show();
  });
}

export function initConfirmDialog(): void {
  if (isInitialized) return;
  isInitialized = true;

  const dialog = document.getElementById('m3-confirm-dialog') as M3eDialogElement | null;

  dialog?.addEventListener('closed', () => {
    if (activeResolver) {
      const resolver = activeResolver;
      activeResolver = null;
      resolver(dialog.returnValue === 'confirm');
    }
  });
}
