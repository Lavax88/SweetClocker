import type { ExecResult, SpawnHandle } from './types';

interface MockCore {
  id: number;
  cluster: 'LITTLE' | 'BIG' | 'PRIME';
  gov: string;
  min: number;
  max: number;
  cur: number;
  temp: number;
  user: number;
  nice: number;
  sys: number;
  idle: number;
  iowait: number;
  irq: number;
  softirq: number;
}

const mockCoresState: MockCore[] = Array.from({ length: 8 }, (_, i) => {
  let cluster: 'LITTLE' | 'BIG' | 'PRIME' = 'LITTLE';
  let targetMax = 1286400;
  if (i >= 2 && i <= 6) {
    cluster = 'BIG';
    targetMax = 1920000;
  } else if (i === 7) {
    cluster = 'PRIME';
    targetMax = 2515200;
  }

  return {
    id: i,
    cluster,
    gov: 'schedutil',
    min: 400000,
    max: targetMax,
    cur: 600000,
    temp: 38,
    user: 50000 + Math.floor(Math.random() * 10000),
    nice: 2000,
    sys: 15000 + Math.floor(Math.random() * 5000),
    idle: 500000 + Math.floor(Math.random() * 200000),
    iowait: 1000,
    irq: 500,
    softirq: 500
  };
});

const mockGpuState = {
  min: 305,
  max: 900,
  gov: 'msm-adreno-tz',
  availGovs: 'msm-adreno-tz performance powersave userspace simple_ondemand bw_hwmon',
  availFreqs: '305000000 401000000 480000000 550000000 640000000 750000000 900000000 1000000000'
};

let mockBypass = false;
let mockLog = `[2026-07-20 00:02:18] post-fs-data.sh: boot start, log truncated
[2026-07-20 00:02:18] discovered policy0 -> cpus [0,1] -> target 1286400 kHz (LITTLE, matches expected)
[2026-07-20 00:02:18] policy0/scaling_max_freq: wrote 1286400, readback 1286400 (exact)
[2026-07-20 00:02:18] discovered policy2 -> cpus [2,3,4] -> target 1920000 kHz (BIG, matches expected)
[2026-07-20 00:02:18] policy2/scaling_max_freq: wrote 1920000, readback 1920000 (exact)
[2026-07-20 00:02:18] discovered policy5 -> cpus [5,6] -> target 1920000 kHz (BIG, matches expected)
[2026-07-20 00:02:18] policy5/scaling_max_freq: wrote 1920000, readback 1920000 (exact)
[2026-07-20 00:02:19] discovered policy7 -> cpus [7] -> target 2515200 kHz (PRIME, matches expected)
[2026-07-20 00:02:19] policy7/scaling_max_freq: wrote 2515200, readback 2515200 (exact)
[2026-07-20 00:02:22] service.sh: loop started, fast-poll phase (5s interval, 3min)
[2026-07-20 00:02:27] service.sh: check ok, no drift
[2026-07-20 00:02:32] service.sh: check ok, no drift
[2026-07-20 00:02:37] service.sh: drift detected on policy7, was reset to 2860800, re-applying 2515200
[2026-07-20 00:02:37] policy7/scaling_max_freq: wrote 2515200, readback 2515200 (exact)
[2026-07-20 00:02:42] service.sh: check ok, no drift
[2026-07-20 00:02:47] service.sh: check ok, no drift
[2026-07-20 00:02:52] service.sh: check ok, no drift
[2026-07-20 00:02:57] service.sh: heartbeat, no drift (check #10)
[2026-07-20 00:03:02] service.sh: check ok, no drift`;

function generateMockTelemetryRecord(): string {
  // 1. Cores
  const coresLines = mockCoresState.map(c => {
    const range = c.max - c.min;
    const usage = Math.random();
    c.cur = Math.floor(c.min + range * usage);
    c.temp = Math.floor(35 + usage * 25 + c.id * 1.2);
    c.user += Math.floor(usage * 2000);
    c.idle += Math.floor((1 - usage) * 2000);
    return `${c.id}|${c.gov}|${c.min}|${c.max}|${c.cur}`;
  }).join('\n');

  // 2. Thermals
  const thermalLines = mockCoresState.map(c => `cpu-0-${c.id}|${c.temp * 1000}`)
    .concat([`gpu-0-0|${Math.floor(39 + Math.random() * 15) * 1000}`])
    .join('\n');

  // 3. Proc stat
  const procStatLines = mockCoresState.map(c =>
    `cpu${c.id} ${c.user} ${c.nice} ${c.sys} ${c.idle} ${c.iowait} ${c.irq} ${c.softirq} 0`
  ).join('\n');

  // 4. Status
  const statusLine = `1|${mockBypass ? 1 : 0}`;

  // 5. GPU
  const gpuBusy = Math.floor(Math.random() * 40);
  const gpuCur = Math.floor(mockGpuState.min + Math.random() * (mockGpuState.max - mockGpuState.min));
  const gpuLine = `${gpuBusy}|${gpuCur}|${mockGpuState.min}|${mockGpuState.max}|Adreno 735 GPU|${mockGpuState.gov}|${mockGpuState.availGovs}|${mockGpuState.availFreqs}`;

  // 6. Clusters info
  const govs = 'schedutil performance powersave userspace ondemand conservative';
  const clustersLines = [
    `0|400000|2016000|${mockCoresState[0]!.gov}|${govs}|364800 441600 614400 748800 883200 979200 1075200 1190400 1286400 1401600 1516800 1632000 1785600 1900800 2016000`,
    `2|480000|3014400|${mockCoresState[2]!.gov}|${govs}|480000 633600 787200 940800 1056000 1190400 1286400 1401600 1516800 1632000 1728000 1824000 1920000 2073600 2208000 2323200 2438400 2515200 2611200 2707200 2803200 2918400 3014400`,
    `5|480000|2803200|${mockCoresState[5]!.gov}|${govs}|480000 633600 787200 940800 1056000 1190400 1286400 1401600 1516800 1632000 1728000 1824000 1920000 2073600 2208000 2323200 2438400 2515200 2611200 2707200 2803200`,
    `7|480000|3206400|${mockCoresState[7]!.gov}|${govs}|480000 633600 787200 960000 1094400 1228800 1363200 1478400 1670400 1785600 1920000 2054400 2169600 2284800 2400000 2515200 2630400 2745600 2841600 2956800 3072000 3206400`
  ].join('\n');

  return `${coresLines}\n---\n${thermalLines}\n---\n${procStatLines}\n---\n${statusLine}\n---\n${gpuLine}\n---\n${clustersLines}\n`;
}

export function mockExec(command: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Telemetry command or script
      if (command.includes('telemetry.sh') || command.includes('scaling_cur_freq') || command.includes('---')) {
        resolve({ errno: 0, stdout: generateMockTelemetryRecord(), stderr: '' });
        return;
      }

      if (command.includes('getprop ro.product.model')) {
        resolve({ errno: 0, stdout: 'POCO F7 Pro (Desktop Mock)\n', stderr: '' });
        return;
      }

      if (command.includes('[ -f /data/local/tmp/sweetclocker_force ]')) {
        resolve({ errno: mockBypass ? 0 : 1, stdout: '', stderr: '' });
        return;
      }

      if (command.includes('touch /data/local/tmp/sweetclocker_force')) {
        mockBypass = true;
        mockLog += `\n[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] service.sh: Force bypass activated manually`;
        resolve({ errno: 0, stdout: '', stderr: '' });
        return;
      }

      if (command.includes('rm -f /data/local/tmp/sweetclocker_force')) {
        mockBypass = false;
        mockLog += `\n[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] service.sh: Force bypass deactivated`;
        resolve({ errno: 0, stdout: '', stderr: '' });
        return;
      }

      if (command.includes('rm -f /data/local/tmp/sweetclocker.log')) {
        mockLog = `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] sweetclocker.log cleared by user via WebUI`;
        resolve({ errno: 0, stdout: '', stderr: '' });
        return;
      }

      if (command.includes('tail -n') || command.includes('cat /data/local/tmp/sweetclocker.log')) {
        resolve({ errno: 0, stdout: `${mockLog.length}\n---\n${mockLog}`, stderr: '' });
        return;
      }

      if (command.includes('wc -c < /data/local/tmp/sweetclocker.log')) {
        resolve({ errno: 0, stdout: `${mockLog.length}\n`, stderr: '' });
        return;
      }

      if (command.includes('settings get secure theme_customization_overlay_packages')) {
        resolve({
          errno: 0,
          stdout: `{"android.theme.customization.system_palette":"#6750A4","android.theme.customization.accent_color":"#6750A4"}\n`,
          stderr: ''
        });
        return;
      }

      if (command.includes('---IO_CUSTOM---') || command.includes('block')) {
        const defStr = 'sda=mq-deadline\nsdb=mq-deadline\nmmcblk0=mq-deadline';
        const custStr = 'io_enabled=1\nio_apply_boot=1\nsda=mq-deadline\nsdb=mq-deadline\nmmcblk0=mq-deadline';
        const blocksStr = 'sda|none [mq-deadline] kyber bfq\nsdb|none [mq-deadline] kyber bfq\nmmcblk0|none [mq-deadline] kyber bfq';
        resolve({ errno: 0, stdout: `${defStr}\n---IO_CUSTOM---\n${custStr}\n---IO_BLOCKS---\n${blocksStr}\n`, stderr: '' });
        return;
      }

      if (command.includes('.sweetclocker_custom')) {
        mockLog += `\n[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] sweetspot-apply.sh: Applied custom frequency / governor limits`;
        resolve({ errno: 0, stdout: '', stderr: '' });
        return;
      }

      if (command.includes('--reset-sweetclock')) {
        mockLog += `\n[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] sweetspot-apply.sh: Reset custom cluster frequencies & governors to predefined sweetclocks`;
        resolve({ errno: 0, stdout: '', stderr: '' });
        return;
      }

      resolve({ errno: 0, stdout: '', stderr: '' });
    }, 40);
  });
}

export function mockSpawn(_command: string, onLine: (line: string) => void): SpawnHandle {
  let active = true;
  const interval = setInterval(() => {
    if (!active) return;
    onLine(generateMockTelemetryRecord());
  }, 800);

  return {
    stop: () => {
      active = false;
      clearInterval(interval);
    },
    done: Promise.resolve(0)
  };
}
