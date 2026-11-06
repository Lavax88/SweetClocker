import type { ExecResult, SpawnHandle } from './types';

export function mockExec(_command: string): Promise<ExecResult> {
  return Promise.reject(new Error('Mock bridge called in production build'));
}

export function mockSpawn(_command: string, _onLine: (line: string) => void): SpawnHandle {
  return {
    stop: () => {},
    done: Promise.reject(new Error('Mock spawn called in production build'))
  };
}
