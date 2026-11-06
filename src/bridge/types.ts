export interface ExecResult {
  errno: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  timeoutMs?: number;
  [key: string]: unknown;
}

export interface SpawnHandle {
  stop(): void;
  done: Promise<number>;
}

declare global {
  interface Window {
    ksu?: {
      exec(cmd: string, optionsJson: string, callbackName: string): void;
      spawn?(cmd: string, optionsJson: string, callbackName: string): number;
      openUrl?(url: string): void;
    };
    [callbackName: string]: unknown;
  }
}
