const HIDE_WARNING_KEY = 'sweetclocker_hide_gpu_warning';

export function showGpuWarningDialog(): void {
  if (localStorage.getItem(HIDE_WARNING_KEY) === 'true') {
    return;
  }
  const backdrop = document.getElementById('gpu-warning-dialog-backdrop');
  if (backdrop) {
    backdrop.style.display = 'flex';
    requestAnimationFrame(() => backdrop.classList.add('active'));
  }
}

export function hideGpuWarningDialog(): void {
  const dontShowCheckbox = document.getElementById(
    'gpu-dont-show-again-checkbox'
  ) as HTMLInputElement | null;
  if (dontShowCheckbox && dontShowCheckbox.checked) {
    localStorage.setItem(HIDE_WARNING_KEY, 'true');
  }
  const backdrop = document.getElementById('gpu-warning-dialog-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    setTimeout(() => {
      backdrop.style.display = 'none';
    }, 250);
  }
}

export function initGpuWarningDialog(): void {
  const dismissBtn = document.getElementById('gpu-warning-dialog-dismiss');
  if (dismissBtn) {
    dismissBtn.onclick = hideGpuWarningDialog;
  }

  const backdrop = document.getElementById('gpu-warning-dialog-backdrop');
  if (backdrop) {
    backdrop.onclick = (e) => {
      if (e.target === backdrop) hideGpuWarningDialog();
    };
  }

  const acknowledgeCheckbox = document.getElementById(
    'gpu-acknowledge-checkbox'
  ) as HTMLInputElement | null;
  const gpuGrid = document.getElementById('gpu-tuning-grid');

  if (acknowledgeCheckbox && gpuGrid) {
    acknowledgeCheckbox.onchange = () => {
      if (acknowledgeCheckbox.checked) {
        gpuGrid.classList.remove('gpu-controls-disabled');
      } else {
        gpuGrid.classList.add('gpu-controls-disabled');
      }
    };
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

    const backdrop = document.getElementById('apply-boot-dialog-backdrop');
    const titleEl = document.getElementById('apply-boot-dialog-title');
    const msgEl = document.getElementById('apply-boot-dialog-message');

    if (titleEl && opts.title) titleEl.innerText = opts.title;
    if (msgEl) msgEl.innerText = opts.message;

    if (backdrop) {
      backdrop.style.display = 'flex';
      requestAnimationFrame(() => backdrop.classList.add('active'));
    }

    try {
      history.pushState({ modal: true }, '');
    } catch (e) {}
  });
}

export function hideApplyBootDialog(result: boolean | null = null): void {
  const backdrop = document.getElementById('apply-boot-dialog-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    setTimeout(() => {
      backdrop.style.display = 'none';
    }, 250);
  }

  if (applyBootResolve) {
    applyBootResolve(result);
    applyBootResolve = null;
  }
}

export function initApplyBootDialog(): void {
  const backdrop = document.getElementById('apply-boot-dialog-backdrop');
  const nowBtn = document.getElementById('apply-boot-dialog-now');
  const bootBtn = document.getElementById('apply-boot-dialog-boot');

  if (nowBtn) {
    nowBtn.onclick = () => {
      hideApplyBootDialog(false);
    };
  }

  if (bootBtn) {
    bootBtn.onclick = () => {
      hideApplyBootDialog(true);
    };
  }

  if (backdrop) {
    backdrop.onclick = (e) => {
      if (e.target === backdrop) hideApplyBootDialog(null);
    };
  }
}
