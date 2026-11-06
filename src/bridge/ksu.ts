import type { ExecResult, ExecOptions, SpawnHandle } from './types';
export type { ExecResult, ExecOptions, SpawnHandle };
import { mockExec, mockSpawn } from '@bridge/mock';

let callbackCounter = 0;

function getUniqueCallbackName(prefix: string): string {
  return `__sweetclocker_${prefix}_${Date.now()}_${callbackCounter++}`;
}

/**
 * Execute a shell command via KernelSU's root execution API with timeout guard
 */
export function exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
  const timeoutMs = options.timeoutMs ?? 10000;

  return new Promise((resolve, reject) => {
    // If not running in KernelSU Manager WebView, fall back to mock
    if (typeof window.ksu === 'undefined') {
      resolve(mockExec(command));
      return;
    }

    const callbackFuncName = getUniqueCallbackName('exec');
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (callbackFuncName in window) {
        delete window[callbackFuncName];
      }
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${command.slice(0, 80)}...`));
    }, timeoutMs);

    window[callbackFuncName] = (errno: number, stdout: string, stderr: string) => {
      if (timedOut) return;
      clearTimeout(timer);
      delete window[callbackFuncName];
      resolve({ errno, stdout: stdout || '', stderr: stderr || '' });
    };

    try {
      window.ksu.exec(command, JSON.stringify(options), callbackFuncName);
    } catch (error) {
      clearTimeout(timer);
      delete window[callbackFuncName];
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Spawn a continuous streaming shell process or managed loop
 */
export function spawn(command: string, onLine: (line: string) => void): SpawnHandle {
  if (typeof window.ksu === 'undefined') {
    return mockSpawn(command, onLine);
  }

  // If the host manager WebView supports streaming spawn directly
  if (typeof window.ksu.spawn === 'function') {
    const callbackFuncName = getUniqueCallbackName('spawn');
    let active = true;

    window[callbackFuncName] = (line: string) => {
      if (!active) return;
      onLine(line);
    };

    try {
      const pid = window.ksu.spawn(command, '{}', callbackFuncName);
      return {
        stop: () => {
          active = false;
          delete window[callbackFuncName];
          if (pid > 0) {
            exec(`kill -TERM ${pid} 2>/dev/null || kill -9 ${pid} 2>/dev/null`).catch(() => {});
          }
        },
        done: Promise.resolve(0)
      };
    } catch (err) {
      console.warn('window.ksu.spawn failed, falling back to managed exec loop:', err);
      delete window[callbackFuncName];
    }
  }

  // Fallback managed loop when streaming spawn is not natively provided by the WebView host
  let isRunning = true;
  let pollTimeout: ReturnType<typeof setTimeout> | null = null;

  const runLoop = async () => {
    if (!isRunning) return;
    try {
      const { errno, stdout } = await exec(command, { timeoutMs: 8000 });
      if (isRunning && errno === 0 && stdout) {
        onLine(stdout);
      }
    } catch (err) {
      console.error('Error during telemetry poll tick:', err);
    }
    if (isRunning) {
      pollTimeout = setTimeout(runLoop, 800);
    }
  };

  runLoop();

  return {
    stop: () => {
      isRunning = false;
      if (pollTimeout) {
        clearTimeout(pollTimeout);
        pollTimeout = null;
      }
    },
    done: Promise.resolve(0)
  };
}

/**
 * Display a short Material 3 toast notification
 */
export function toast(message: string): void {
  const existing = document.getElementById('sweetclocker-toast');
  if (existing) existing.remove();

  const toastEl = document.createElement('div');
  toastEl.id = 'sweetclocker-toast';
  toastEl.style.position = 'fixed';
  toastEl.style.bottom = '84px';
  toastEl.style.left = '50%';
  toastEl.style.transform = 'translateX(-50%) translateY(12px)';
  toastEl.style.backgroundColor = 'var(--md-sys-color-primary-container)';
  toastEl.style.color = 'var(--md-sys-color-on-primary-container)';
  toastEl.style.padding = '10px 20px';
  toastEl.style.borderRadius = '9999px';
  toastEl.style.fontSize = '0.85rem';
  toastEl.style.fontWeight = '600';
  toastEl.style.fontFamily = 'var(--font-family)';
  toastEl.style.boxShadow = 'var(--md-elevation-3)';
  toastEl.style.zIndex = '99999';
  toastEl.style.opacity = '0';
  toastEl.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
  toastEl.style.pointerEvents = 'none';
  toastEl.style.whiteSpace = 'nowrap';
  toastEl.innerText = message;

  document.body.appendChild(toastEl);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toastEl.style.opacity = '1';
      toastEl.style.transform = 'translateX(-50%) translateY(0)';
    });
  });

  setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateX(-50%) translateY(8px)';
    setTimeout(() => toastEl.remove(), 280);
  }, 2200);
}

/**
 * Open external URL in Android browser
 */
export async function openUrl(url: string): Promise<void> {
  if (!url) return;
  try {
    if (typeof window.ksu !== 'undefined' && typeof window.ksu.openUrl === 'function') {
      window.ksu.openUrl(url);
      return;
    }
  } catch (e) {
    console.warn('ksu.openUrl failed, using am start fallback:', e);
  }

  const safeUrl = url.replace(/'/g, "'\\''");
  const cmd = `am start -a android.intent.action.VIEW -d '${safeUrl}' 2>/dev/null`;
  const res = await exec(cmd);
  if (res.errno !== 0) {
    window.open(url, '_blank');
  }
}
