import type {
  TelemetrySnapshot,
  IoStats,
  CpuConfigLimits,
  GpuConfigLimits
} from './types';
import { parseTelemetryOutput } from './parse';
import { exec, type SpawnHandle } from '../bridge/ksu';

type TelemetryListener = (snapshot: TelemetrySnapshot) => void;

let activeListener: TelemetryListener | null = null;
let activeSpawnHandle: SpawnHandle | null = null;
let pollTimeout: ReturnType<typeof setTimeout> | null = null;
let isSamplingActive = false;
let isTickInProgress = false;
let lastSnapshot: TelemetrySnapshot | null = null;

const TELEMETRY_CMD = `
sp="/data/adb/modules/sweetclocker/telemetry.sh"
[ -f "$sp" ] || sp="/data/adb/modules/SweetClocker/telemetry.sh"
[ -f "$sp" ] || sp="$(find /data/adb/modules* -name telemetry.sh 2>/dev/null | head -n 1)"
[ -f "$sp" ] && sh "$sp"
`;

function getScriptCmd(flag: string): string {
  return (
    `sp="/data/adb/modules/sweetclocker/sweetspot-apply.sh"\n` +
    `[ -f "$sp" ] || sp="/data/adb/modules/SweetClocker/sweetspot-apply.sh"\n` +
    `[ -f "$sp" ] || sp="/data/adb/modules_update/sweetclocker/sweetspot-apply.sh"\n` +
    `[ -f "$sp" ] || sp="$(find /data/adb/modules* -name sweetspot-apply.sh 2>/dev/null | head -n 1)"\n` +
    `sh "$sp" ${flag}`
  );
}

export async function sampleOnce(): Promise<TelemetrySnapshot | null> {
  try {
    const { errno, stdout, stderr } = await exec(TELEMETRY_CMD, { timeoutMs: 6000 });
    if (errno !== 0 && !stdout) {
      console.warn('Telemetry sampling returned non-zero:', stderr);
      return lastSnapshot;
    }
    const snapshot = parseTelemetryOutput(stdout);
    if (snapshot) {
      lastSnapshot = snapshot;
    }
    return snapshot ?? lastSnapshot;
  } catch (err) {
    console.error('Failed to sample telemetry once:', err);
    return lastSnapshot;
  }
}

async function runTick(): Promise<void> {
  if (!isSamplingActive || isTickInProgress) return;
  isTickInProgress = true;

  try {
    const snapshot = await sampleOnce();
    if (snapshot && activeListener && isSamplingActive) {
      activeListener(snapshot);
    }
  } catch (err) {
    console.error('Error in telemetry sampler tick:', err);
  } finally {
    isTickInProgress = false;
    if (isSamplingActive) {
      pollTimeout = setTimeout(runTick, 800);
    }
  }
}

export function startSampler(listener: TelemetryListener): void {
  activeListener = listener;
  if (isSamplingActive) return;

  isSamplingActive = true;
  // Trigger immediate tick
  runTick();
}

export function stopSampler(): void {
  isSamplingActive = false;
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
  if (activeSpawnHandle) {
    activeSpawnHandle.stop();
    activeSpawnHandle = null;
  }
}

export function getLastSnapshot(): TelemetrySnapshot | null {
  return lastSnapshot;
}

// Lifecycle discipline: pause when hidden
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      stopSampler();
    } else {
      if (activeListener) {
        startSampler(activeListener);
      }
    }
  });
}

/**
 * Toggle the SweetClocker force bypass override setting
 */
export async function setBypassMode(activate: boolean): Promise<boolean> {
  const cmd = activate
    ? 'touch /data/local/tmp/sweetclocker_force'
    : 'rm -f /data/local/tmp/sweetclocker_force';

  const { errno, stderr } = await exec(cmd);
  if (errno !== 0) {
    console.error('Failed to toggle bypass:', stderr);
    return false;
  }
  return true;
}

async function getExistingCustomLines(filterPrefix: string): Promise<string[]> {
  const { stdout } = await exec('cat /data/local/tmp/.sweetclocker_custom 2>/dev/null');
  if (!stdout) return [];
  return stdout.split('\n').filter((l) => l.trim().length > 0 && !l.startsWith(filterPrefix));
}

export async function applyCpuConfig(config: Record<string, CpuConfigLimits>): Promise<boolean> {
  const lines = await getExistingCustomLines('policy');
  for (const [pol, limits] of Object.entries(config)) {
    if (limits.min !== undefined) lines.push(`${pol}_min=${limits.min}`);
    if (limits.max !== undefined) lines.push(`${pol}_max=${limits.max}`);
    if (limits.gov !== undefined) lines.push(`${pol}_gov=${limits.gov}`);
  }
  const customText = lines.join('\n') + (lines.length ? '\n' : '');
  const cmd =
    `cat << 'EOF' > /data/local/tmp/.sweetclocker_custom\n${customText}EOF\n` +
    getScriptCmd('--apply-cpu');

  const { errno, stderr } = await exec(cmd);
  if (errno !== 0) {
    console.error('Failed to apply CPU configuration:', stderr);
    return false;
  }
  return true;
}

export async function applyGpuConfig(gpuConfig?: GpuConfigLimits): Promise<boolean> {
  const lines = await getExistingCustomLines('gpu_');
  if (gpuConfig) {
    if (gpuConfig.min !== undefined) lines.push(`gpu_min=${gpuConfig.min}`);
    if (gpuConfig.max !== undefined) lines.push(`gpu_max=${gpuConfig.max}`);
    if (gpuConfig.gov !== undefined) lines.push(`gpu_gov=${gpuConfig.gov}`);
  }
  const customText = lines.join('\n') + (lines.length ? '\n' : '');
  const cmd =
    `cat << 'EOF' > /data/local/tmp/.sweetclocker_custom\n${customText}EOF\n` +
    getScriptCmd('--apply-gpu');

  const { errno, stderr } = await exec(cmd);
  if (errno !== 0) {
    console.error('Failed to apply GPU configuration:', stderr);
    return false;
  }
  return true;
}

export async function resetCpuConfig(): Promise<boolean> {
  const cmd = getScriptCmd('--reset-cpu');
  const { errno, stderr } = await exec(cmd);
  if (errno !== 0) {
    console.error('Failed to reset CPU configuration:', stderr);
    return false;
  }
  return true;
}

export async function resetGpuConfig(): Promise<boolean> {
  const cmd = getScriptCmd('--reset-gpu');
  const { errno, stderr } = await exec(cmd);
  if (errno !== 0) {
    console.error('Failed to reset GPU configuration:', stderr);
    return false;
  }
  return true;
}

export async function resetToSweetclocks(): Promise<boolean> {
  const cmd = getScriptCmd('--reset-sweetclock');
  const { errno, stderr } = await exec(cmd);
  if (errno !== 0) {
    console.error('Failed to reset sweetclocks:', stderr);
    return false;
  }
  return true;
}

export async function getIoStats(): Promise<IoStats | null> {
  const cmd = `
sys_path="/sys"
[ -d "/dev/sweetclocker/sysfs/block" ] && sys_path="/dev/sweetclocker/sysfs"

def_file="/data/local/tmp/.sweetclocker_io_defaults"
cust_file="/data/local/tmp/.sweetclocker_io_custom"

if [ ! -f "$def_file" ]; then
  touch "$def_file" 2>/dev/null
  for d in "\${sys_path}/block"/*; do
    [ -d "$d" ] || continue
    dev="\${d##*/}"
    case "$dev" in loop*|zram*) continue ;; esac
    [ -f "$d/queue/scheduler" ] || continue
    read -r sched < "$d/queue/scheduler"
    act=""
    for w in $sched; do
      case "$w" in \\[*\\]) act="\${w#\\[}"; act="\${act%\\]}"; break ;; esac
    done
    [ -z "$act" ] && act=$(echo "$sched" | awk '{print $1}')
    [ -n "$act" ] && echo "\${dev}=\${act}" >> "$def_file"
  done
fi

cat "$def_file" 2>/dev/null
echo "---IO_CUSTOM---"
cat "$cust_file" 2>/dev/null
echo "---IO_BLOCKS---"
for d in "\${sys_path}/block"/*; do
  [ -d "$d" ] || continue
  dev="\${d##*/}"
  case "$dev" in loop*|zram*) continue ;; esac
  [ -f "$d/queue/scheduler" ] || continue
  read -r sched < "$d/queue/scheduler"
  echo "\${dev}|\${sched}"
done
`;

  const { errno, stdout, stderr } = await exec(cmd);
  if (errno !== 0 && !stdout) {
    console.error('Failed to get I/O stats:', stderr);
    return null;
  }

  const parts = stdout.split(/---IO_CUSTOM---|---IO_BLOCKS---/);
  const defaultsText = parts[0] ?? '';
  const customText = parts[1] ?? '';
  const blocksText = parts[2] ?? '';

  const defaultsMap: Record<string, string> = {};
  for (const line of defaultsText.trim().split('\n')) {
    if (line.includes('=')) {
      const [k, v] = line.split('=');
      if (k && v) defaultsMap[k.trim()] = v.trim();
    }
  }

  const customMap: Record<string, string> = {};
  let enabled = false;
  let applyBoot = false;

  for (const line of customText.trim().split('\n')) {
    if (line.includes('=')) {
      const [k, v] = line.split('=');
      const key = k?.trim() ?? '';
      const val = v?.trim() ?? '';
      if (key === 'io_enabled') enabled = val === '1';
      else if (key === 'io_apply_boot') applyBoot = val === '1';
      else if (key) customMap[key] = val;
    }
  }

  const blocks: IoStats['blocks'] = [];
  for (const line of blocksText.trim().split('\n')) {
    if (!line.includes('|')) continue;
    const [dev, rawSched] = line.split('|');
    if (!dev || !rawSched) continue;
    if (dev.startsWith('loop') || dev.startsWith('zram')) continue;

    const words = rawSched.trim().split(/\s+/);
    let active = '';
    const avail: string[] = [];
    for (const w of words) {
      if (w.startsWith('[') && w.endsWith(']')) {
        active = w.slice(1, -1);
        avail.push(active);
      } else if (w) {
        avail.push(w);
      }
    }
    if (!active && avail.length > 0 && avail[0]) active = avail[0];

    const defaultSched = defaultsMap[dev] || active;

    blocks.push({
      dev,
      active,
      avail,
      defaultSched,
      customSched: customMap[dev] || null
    });
  }

  return {
    enabled,
    applyBoot,
    defaultsMap,
    customMap,
    blocks
  };
}

export async function applyIoConfig(
  configMap: Record<string, string>,
  applyBoot: boolean,
  enabled: boolean
): Promise<boolean> {
  let customText = `io_enabled=${enabled ? 1 : 0}\nio_apply_boot=${applyBoot ? 1 : 0}\n`;
  for (const [dev, sched] of Object.entries(configMap)) {
    customText += `${dev}=${sched}\n`;
  }

  const cmd =
    `cat << 'EOF' > /data/local/tmp/.sweetclocker_io_custom\n${customText}EOF\n` +
    getScriptCmd('--apply-io');

  const { errno, stderr } = await exec(cmd);
  if (errno !== 0) {
    console.error('Failed to apply I/O config:', stderr);
    return false;
  }
  return true;
}

export async function resetIoConfig(): Promise<boolean> {
  const cmd = getScriptCmd('--reset-io');
  const { errno, stderr } = await exec(cmd);
  if (errno !== 0) {
    console.error('Failed to reset I/O config:', stderr);
    return false;
  }
  return true;
}
