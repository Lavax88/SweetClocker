import type { TelemetrySnapshot } from '../telemetry/types';

export type AppTab = 'page-dashboard' | 'page-tuning' | 'page-logs' | 'page-preferences';
export type TuningSubView = 'hub' | 'cpu-clocks' | 'gpu-clocks' | 'io-management';

export interface AppState {
  activeTab: AppTab;
  currentTuningSubView: TuningSubView;
  deviceModel: string;
  telemetry: TelemetrySnapshot | null;
  error: string | null;
}

type Listener<T> = (value: T) => void;

class StateStore {
  private state: AppState = {
    activeTab: 'page-dashboard',
    currentTuningSubView: 'hub',
    deviceModel: 'Snapdragon 8s Gen 4',
    telemetry: null,
    error: null
  };

  private listeners = new Map<keyof AppState, Set<(val: unknown) => void>>();

  public get<K extends keyof AppState>(key: K): AppState[K] {
    return this.state[key];
  }

  public set<K extends keyof AppState>(key: K, value: AppState[K]): void {
    if (this.state[key] === value) return;
    this.state[key] = value;
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      for (const cb of callbacks) {
        cb(value);
      }
    }
  }

  public subscribe<K extends keyof AppState>(
    key: K,
    listener: Listener<AppState[K]>
  ): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    const wrapper = listener as (val: unknown) => void;
    set.add(wrapper);

    listener(this.state[key]);

    return () => {
      set?.delete(wrapper);
    };
  }
}

export const store = new StateStore();
