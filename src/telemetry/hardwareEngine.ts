import type {
  TelemetrySnapshot,
  CoreStats,
  ClusterPolicyData,
  GpuStats,
  IoStats,
  NetStats,
  IoBlockDevice,
  CpuConfigLimits,
  GpuConfigLimits
} from './types';
import { parseTelemetryOutput } from './parse';
import { exec } from '../bridge/ksu';

export type SubsystemKey = 'cpu' | 'gpu' | 'io' | 'net';

export interface CpuTelemetry {
  cores: CoreStats[];
  clusters: Record<string, ClusterPolicyData>;
  totalLoad: number;
}

export interface SubsystemMap {
  cpu: CpuTelemetry;
  gpu: GpuStats;
  io: IoStats | null;
  net: NetStats | null;
}

export interface HardwareIntent {
  cpu?: Record<string, CpuConfigLimits>;
  gpu?: GpuConfigLimits;
  io?: { config: Record<string, string>; applyBoot: boolean; enabled: boolean };
  net?: { algo: string; applyBoot: boolean; enabled: boolean };
  bypass?: boolean;
}

export type HardwarePreset = 'sweetclock' | 'defaults';

export type HardwareObserver<T = any> = (data: T) => void;

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

class HardwareEngineImpl {
  private isSamplingPaused = false;
  private isTickInProgress = false;
  private pollTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastSnapshot: TelemetrySnapshot | null = null;
  private cachedIoStats: IoStats | null = null;
  private cachedNetStats: NetStats | null = null;
  private busyCount = 0;

  // Observers by channel
  private observers: Map<SubsystemKey | 'all', Set<HardwareObserver>> = new Map([
    ['all', new Set()],
    ['cpu', new Set()],
    ['gpu', new Set()],
    ['io', new Set()],
    ['net', new Set()]
  ]);

  // FIFO Mutex queue to serialize shell operations and avoid race conditions
  private queue: Promise<any> = Promise.resolve();

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.pauseInternal();
        } else {
          this.resumeInternal();
        }
      });
    }
  }

  public get isBusy(): boolean {
    return this.busyCount > 0;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.busyCount++;
    const res = this.queue.then(async () => {
      try {
        return await task();
      } finally {
        this.busyCount = Math.max(0, this.busyCount - 1);
      }
    });
    this.queue = res.catch(() => {});
    return res;
  }

  public observe(target: 'all', listener: (data: TelemetrySnapshot) => void): () => void;
  public observe<K extends SubsystemKey>(target: K, listener: (data: SubsystemMap[K]) => void): () => void;
  public observe(
    target: SubsystemKey | 'all',
    listener: HardwareObserver
  ): () => void {
    const channelSet = this.observers.get(target);
    if (channelSet) {
      channelSet.add(listener as HardwareObserver);
    }

    // Immediately deliver cached snapshot if available
    if (this.lastSnapshot) {
      this.dispatchSingle(target, listener as HardwareObserver, this.lastSnapshot);
    }

    // Start background sampling if we have observers and are not paused
    this.checkPollingLoop();

    return () => {
      channelSet?.delete(listener as HardwareObserver);
      this.checkPollingLoop();
    };
  }

  public pause(): void {
    this.isSamplingPaused = true;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
  }

  public resume(): void {
    this.isSamplingPaused = false;
    this.checkPollingLoop();
    this.triggerImmediateTick();
  }

  private pauseInternal(): void {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
  }

  private resumeInternal(): void {
    if (!this.isSamplingPaused) {
      this.checkPollingLoop();
      this.triggerImmediateTick();
    }
  }

  private hasActiveObservers(): boolean {
    for (const set of this.observers.values()) {
      if (set.size > 0) return true;
    }
    return false;
  }

  private checkPollingLoop(): void {
    if (this.hasActiveObservers() && !this.isSamplingPaused) {
      if (!this.pollTimeout && !this.isTickInProgress) {
        this.runTick();
      }
    } else {
      if (this.pollTimeout) {
        clearTimeout(this.pollTimeout);
        this.pollTimeout = null;
      }
    }
  }

  private async triggerImmediateTick(): Promise<void> {
    if (this.isTickInProgress) return;
    await this.runTick();
  }

  private async runTick(): Promise<void> {
    if (this.isSamplingPaused || this.isTickInProgress) return;
    this.isTickInProgress = true;

    try {
      const snapshot = await this.sampleOnceInternal();
      if (snapshot) {
        this.dispatchSnapshot(snapshot);
      }
    } catch (err) {
      console.warn('HardwareEngine sampler tick warning:', err);
    } finally {
      this.isTickInProgress = false;
      if (this.hasActiveObservers() && !this.isSamplingPaused) {
        this.pollTimeout = setTimeout(() => this.runTick(), 800);
      }
    }
  }

  private async sampleOnceInternal(): Promise<TelemetrySnapshot | null> {
    try {
      const { errno, stdout, stderr } = await exec(TELEMETRY_CMD, { timeoutMs: 6000 });
      if (errno !== 0 && !stdout) {
        console.warn('Telemetry sampling returned non-zero:', stderr);
        return this.lastSnapshot;
      }
      const snapshot = parseTelemetryOutput(stdout);
      if (snapshot) {
        this.lastSnapshot = snapshot;
      }
      return snapshot ?? this.lastSnapshot;
    } catch (err) {
      console.error('Failed to sample telemetry in HardwareEngine:', err);
      return this.lastSnapshot;
    }
  }

  private dispatchSnapshot(snapshot: TelemetrySnapshot): void {
    for (const [target, set] of this.observers.entries()) {
      for (const listener of set) {
        this.dispatchSingle(target, listener, snapshot);
      }
    }
  }

  private dispatchSingle(
    target: SubsystemKey | 'all',
    listener: HardwareObserver,
    snapshot: TelemetrySnapshot
  ): void {
    try {
      if (target === 'all') {
        listener(snapshot);
      } else if (target === 'cpu') {
        listener({
          cores: snapshot.cores,
          clusters: snapshot.clusters,
          totalLoad: snapshot.totalLoad
        });
      } else if (target === 'gpu') {
        listener(snapshot.gpu);
      } else if (target === 'io') {
        listener(this.cachedIoStats);
      } else if (target === 'net') {
        listener(this.cachedNetStats);
      }
    } catch (err) {
      console.error(`Error in observer for channel '${target}':`, err);
    }
  }

  public async query(target: 'all'): Promise<TelemetrySnapshot>;
  public async query<K extends SubsystemKey>(target: K): Promise<SubsystemMap[K]>;
  public async query(target: SubsystemKey | 'all'): Promise<any> {
    if (target === 'io') {
      const io = await this.fetchIoStatsInternal();
      return io as any;
    }
    if (target === 'net') {
      const net = await this.fetchNetStatsInternal();
      return net as any;
    }

    if (!this.lastSnapshot) {
      await this.sampleOnceInternal();
    }

    const snap = this.lastSnapshot;
    if (!snap) {
      throw new Error('Unable to acquire hardware snapshot');
    }

    if (target === 'all') return snap as any;
    if (target === 'cpu') {
      return {
        cores: snap.cores,
        clusters: snap.clusters,
        totalLoad: snap.totalLoad
      } as any;
    }
    if (target === 'gpu') return snap.gpu as any;
    return null as any;
  }

  /**
   * Declarative transactional mutation. Applies any combination of CPU, GPU,
   * I/O, or bypass settings, serializes execution, and returns verified state.
   */
  public async reconcile(intent: HardwareIntent = {}): Promise<TelemetrySnapshot> {
    return this.enqueue(async () => {
      // 1. Force bypass toggle
      if (intent.bypass !== undefined) {
        const bypassCmd = intent.bypass
          ? 'touch /data/local/tmp/sweetclocker_force'
          : 'rm -f /data/local/tmp/sweetclocker_force';
        await exec(bypassCmd);
      }

      // 2. CPU configuration
      if (intent.cpu) {
        const lines = await this.getExistingCustomLines('policy');
        for (const [pol, limits] of Object.entries(intent.cpu)) {
          if (limits.min !== undefined) lines.push(`${pol}_min=${limits.min}`);
          if (limits.max !== undefined) lines.push(`${pol}_max=${limits.max}`);
          if (limits.gov !== undefined) lines.push(`${pol}_gov=${limits.gov}`);
        }
        const customText = lines.join('\n') + (lines.length ? '\n' : '');
        const cmd =
          `cat << 'EOF' > /data/local/tmp/.sweetclocker_custom\n${customText}EOF\n` +
          getScriptCmd('--apply-cpu');
        await exec(cmd);
      }

      // 3. GPU configuration
      if (intent.gpu) {
        const lines = await this.getExistingCustomLines('gpu_');
        if (intent.gpu.min !== undefined) lines.push(`gpu_min=${intent.gpu.min}`);
        if (intent.gpu.max !== undefined) lines.push(`gpu_max=${intent.gpu.max}`);
        if (intent.gpu.gov !== undefined) lines.push(`gpu_gov=${intent.gpu.gov}`);
        const customText = lines.join('\n') + (lines.length ? '\n' : '');
        const cmd =
          `cat << 'EOF' > /data/local/tmp/.sweetclocker_custom\n${customText}EOF\n` +
          getScriptCmd('--apply-gpu');
        await exec(cmd);
      }

      // 4. I/O scheduler configuration
      if (intent.io) {
        let customText = `io_enabled=${intent.io.enabled ? 1 : 0}\nio_apply_boot=${intent.io.applyBoot ? 1 : 0}\n`;
        for (const [dev, sched] of Object.entries(intent.io.config)) {
          customText += `${dev}=${sched}\n`;
        }
        const cmd =
          `cat << 'EOF' > /data/local/tmp/.sweetclocker_io_custom\n${customText}EOF\n` +
          getScriptCmd('--apply-io');
        await exec(cmd);
      }

      // 5. Network TCP congestion control configuration
      if (intent.net) {
        const customText = `net_enabled=${intent.net.enabled ? 1 : 0}\nnet_apply_boot=${intent.net.applyBoot ? 1 : 0}\ntcp_congestion_control=${intent.net.algo}\n`;
        const cmd =
          `cat << 'EOF' > /data/local/tmp/.sweetclocker_net_custom\n${customText}EOF\n` +
          getScriptCmd('--apply-net');
        await exec(cmd);
      }

      // 6. Post-condition verification: sample fresh state and notify
      const freshSnapshot = await this.sampleOnceInternal();
      if (freshSnapshot) {
        this.dispatchSnapshot(freshSnapshot);
        return freshSnapshot;
      }
      return this.lastSnapshot!;
    });
  }

  /**
   * Apply predefined presets
   */
  public async applyPreset(preset: HardwarePreset): Promise<TelemetrySnapshot> {
    return this.enqueue(async () => {
      if (preset === 'sweetclock') {
        await exec(getScriptCmd('--reset-sweetclock'));
      } else if (preset === 'defaults') {
        await exec(getScriptCmd('--reset-cpu'));
        await exec(getScriptCmd('--reset-gpu'));
        await exec(getScriptCmd('--reset-io'));
        await exec(getScriptCmd('--reset-net'));
      }

      const freshSnapshot = await this.sampleOnceInternal();
      if (freshSnapshot) {
        this.dispatchSnapshot(freshSnapshot);
        return freshSnapshot;
      }
      return this.lastSnapshot!;
    });
  }

  public async fetchIoStats(): Promise<IoStats | null> {
    return this.enqueue(async () => {
      return this.fetchIoStatsInternal();
    });
  }

  public async fetchNetStats(): Promise<NetStats | null> {
    return this.enqueue(async () => {
      return this.fetchNetStatsInternal();
    });
  }

  public async resetNet(): Promise<void> {
    return this.enqueue(async () => {
      await exec(getScriptCmd('--reset-net'));
      await this.fetchNetStatsInternal();
    });
  }

  private async fetchIoStatsInternal(): Promise<IoStats | null> {
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

    const blocks: IoBlockDevice[] = [];
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

    const stats: IoStats = {
      enabled,
      applyBoot,
      defaultsMap,
      customMap,
      blocks
    };

    this.cachedIoStats = stats;
    const ioListeners = this.observers.get('io');
    if (ioListeners && ioListeners.size > 0) {
      for (const l of ioListeners) {
        try {
          l(stats);
        } catch (_) {}
      }
    }

    return stats;
  }

  private async fetchNetStatsInternal(): Promise<NetStats | null> {
    const cmd = `
def_file="/data/local/tmp/.sweetclocker_net_defaults"
cust_file="/data/local/tmp/.sweetclocker_net_custom"
cc_node="/proc/sys/net/ipv4/tcp_congestion_control"
avail_node="/proc/sys/net/ipv4/tcp_available_congestion_control"

if [ ! -f "$def_file" ] && [ -f "$cc_node" ]; then
  touch "$def_file" 2>/dev/null
  read -r act < "$cc_node"
  [ -n "$act" ] && echo "tcp_congestion_control=\${act}" >> "$def_file"
fi

cat "$def_file" 2>/dev/null
echo "---NET_CUSTOM---"
cat "$cust_file" 2>/dev/null
echo "---NET_NODES---"
if [ -f "$cc_node" ]; then
  read -r cur < "$cc_node"
  echo "current:\${cur}"
fi
if [ -f "$avail_node" ]; then
  read -r avail < "$avail_node"
  echo "available:\${avail}"
fi
`;

    const { errno, stdout, stderr } = await exec(cmd);
    if (errno !== 0 && !stdout) {
      console.error('Failed to get Network stats:', stderr);
      return null;
    }

    const parts = stdout.split(/---NET_CUSTOM---|---NET_NODES---/);
    const defaultsText = parts[0] ?? '';
    const customText = parts[1] ?? '';
    const nodesText = parts[2] ?? '';

    let defaultAlgo = '';
    for (const line of defaultsText.trim().split('\n')) {
      if (line.includes('=')) {
        const [k, v] = line.split('=');
        if (k?.trim() === 'tcp_congestion_control' && v) {
          defaultAlgo = v.trim();
        }
      }
    }

    let enabled = false;
    let applyBoot = false;
    let customAlgo: string | null = null;

    for (const line of customText.trim().split('\n')) {
      if (line.includes('=')) {
        const [k, v] = line.split('=');
        const key = k?.trim() ?? '';
        const val = v?.trim() ?? '';
        if (key === 'net_enabled') enabled = val === '1';
        else if (key === 'net_apply_boot') applyBoot = val === '1';
        else if (key === 'tcp_congestion_control') customAlgo = val || null;
      }
    }

    let currentAlgo = '';
    const availAlgos: string[] = [];

    for (const line of nodesText.trim().split('\n')) {
      if (line.startsWith('current:')) {
        currentAlgo = line.slice('current:'.length).trim();
      } else if (line.startsWith('available:')) {
        const rawAvail = line.slice('available:'.length).trim();
        for (const algo of rawAvail.split(/\s+/)) {
          const trimmed = algo.trim();
          if (trimmed && !availAlgos.includes(trimmed)) {
            availAlgos.push(trimmed);
          }
        }
      }
    }

    if (!currentAlgo) {
      currentAlgo = customAlgo || defaultAlgo || 'cubic';
    }
    if (!defaultAlgo) {
      defaultAlgo = currentAlgo;
    }
    if (!availAlgos.includes(currentAlgo)) {
      availAlgos.unshift(currentAlgo);
    }
    if (defaultAlgo && !availAlgos.includes(defaultAlgo)) {
      availAlgos.push(defaultAlgo);
    }
    if (availAlgos.length === 0) {
      availAlgos.push('cubic', 'reno');
    }

    const stats: NetStats = {
      enabled,
      applyBoot,
      currentAlgo,
      defaultAlgo,
      availAlgos,
      customAlgo
    };

    this.cachedNetStats = stats;
    const netListeners = this.observers.get('net');
    if (netListeners && netListeners.size > 0) {
      for (const l of netListeners) {
        try {
          l(stats);
        } catch (_) {}
      }
    }

    return stats;
  }

  private async getExistingCustomLines(filterPrefix: string): Promise<string[]> {
    const { stdout } = await exec('cat /data/local/tmp/.sweetclocker_custom 2>/dev/null');
    if (!stdout) return [];
    return stdout.split('\n').filter((l) => l.trim().length > 0 && !l.startsWith(filterPrefix));
  }
}

export const hardwareEngine = new HardwareEngineImpl();
