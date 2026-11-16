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

    const backdrop = document.getElementById('m3-confirm-dialog-backdrop');
    const titleEl = document.getElementById('m3-confirm-dialog-title');
    const messageEl = document.getElementById('m3-confirm-dialog-message');
    const confirmBtn = document.getElementById('m3-confirm-dialog-confirm-btn');
    const cancelBtn = document.getElementById('m3-confirm-dialog-cancel-btn');

    if (!backdrop || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
      resolve(window.confirm(`${options.title}\n\n${options.message}`));
      return;
    }

    titleEl.innerText = options.title;
    messageEl.innerText = options.message;
    confirmBtn.innerText = options.confirmLabel || 'Confirm';
    cancelBtn.innerText = options.cancelLabel || 'Cancel';

    if (options.isDanger) {
      confirmBtn.className = 'm3e-btn m3e-btn-danger';
    } else {
      confirmBtn.className = 'm3e-btn m3e-btn-primary';
    }

    activeResolver = resolve;
    backdrop.style.display = 'flex';
  });
}

export function initConfirmDialog(): void {
  if (isInitialized) return;
  isInitialized = true;

  const backdrop = document.getElementById('m3-confirm-dialog-backdrop');
  const confirmBtn = document.getElementById('m3-confirm-dialog-confirm-btn');
  const cancelBtn = document.getElementById('m3-confirm-dialog-cancel-btn');

  const closeDialog = (result: boolean) => {
    if (backdrop) backdrop.style.display = 'none';
    if (activeResolver) {
      const resolver = activeResolver;
      activeResolver = null;
      resolver(result);
    }
  };

  confirmBtn?.addEventListener('click', () => closeDialog(true));
  cancelBtn?.addEventListener('click', () => closeDialog(false));
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) closeDialog(false);
  });
}
