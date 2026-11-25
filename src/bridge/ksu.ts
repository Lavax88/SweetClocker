import type { ExecResult, ExecOptions, SpawnHandle } from './types';
export type { ExecResult, ExecOptions, SpawnHandle };
import { mockExec, mockSpawn } from '@bridge/mock';
import { M3eSnackbar } from '@m3e/web/snackbar';

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
 * Display a short Material 3 Expressive snackbar notification
 */
export function toast(message: string): void {
  M3eSnackbar.open(message, { duration: 2200 });
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
