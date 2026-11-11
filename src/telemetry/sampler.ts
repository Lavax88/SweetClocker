import type {
  TelemetrySnapshot,
  IoStats,
  CpuConfigLimits,
  GpuConfigLimits
} from './types';
import { hardwareEngine } from './hardwareEngine';

export { hardwareEngine } from './hardwareEngine';
export type {
  SubsystemKey,
  SubsystemMap,
  HardwareIntent,
  HardwarePreset
} from './hardwareEngine';

type TelemetryListener = (snapshot: TelemetrySnapshot) => void;

let activeUnsubscribe: (() => void) | null = null;

export async function sampleOnce(): Promise<TelemetrySnapshot | null> {
  try {
    return await hardwareEngine.query('all');
  } catch (err) {
    console.error('Failed to sampleOnce via HardwareEngine:', err);
    return null;
  }
}

export function startSampler(listener: TelemetryListener): void {
  if (activeUnsubscribe) {
    activeUnsubscribe();
  }
  hardwareEngine.resume();
  activeUnsubscribe = hardwareEngine.observe('all', listener);
}

export function stopSampler(): void {
  if (activeUnsubscribe) {
    activeUnsubscribe();
    activeUnsubscribe = null;
  }
  hardwareEngine.pause();
}

export async function setBypassMode(activate: boolean): Promise<boolean> {
  try {
    await hardwareEngine.reconcile({ bypass: activate });
    return true;
  } catch {
    return false;
  }
}

export async function applyCpuConfig(config: Record<string, CpuConfigLimits>): Promise<boolean> {
  try {
    await hardwareEngine.reconcile({ cpu: config });
    return true;
  } catch {
    return false;
  }
}

export async function applyGpuConfig(gpuConfig?: GpuConfigLimits): Promise<boolean> {
  try {
    await hardwareEngine.reconcile({ gpu: gpuConfig });
    return true;
  } catch {
    return false;
  }
}

export async function resetCpuConfig(): Promise<boolean> {
  try {
    await hardwareEngine.applyPreset('defaults');
    return true;
  } catch {
    return false;
  }
}

export async function resetGpuConfig(): Promise<boolean> {
  try {
    await hardwareEngine.applyPreset('defaults');
    return true;
  } catch {
    return false;
  }
}

export async function resetToSweetclocks(): Promise<boolean> {
  try {
    await hardwareEngine.applyPreset('sweetclock');
    return true;
  } catch {
    return false;
  }
}

export async function getIoStats(): Promise<IoStats | null> {
  return hardwareEngine.fetchIoStats();
}

export async function applyIoConfig(
  configMap: Record<string, string>,
  applyBoot: boolean,
  enabled: boolean
): Promise<boolean> {
  try {
    await hardwareEngine.reconcile({
      io: { config: configMap, applyBoot, enabled }
    });
    return true;
  } catch {
    return false;
  }
}

export async function resetIoConfig(): Promise<boolean> {
  try {
    await hardwareEngine.applyPreset('defaults');
    return true;
  } catch {
    return false;
  }
}
