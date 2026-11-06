import type {
  CoreStats,
  CoreCluster,
  GpuStats,
  ClusterPolicyData,
  TelemetrySnapshot
} from './types';

interface ProcCpuTimes {
  active: number;
  total: number;
}

const prevCpuTimes: Record<string, ProcCpuTimes> = {};

export function formatGpuFreq(valStr: string | number): number {
  const val = typeof valStr === 'number' ? valStr : parseInt(valStr, 10) || 0;
  if (val === 0) return 0;
  if (val > 1000000) {
    return Math.round(val / 1000000);
  } else if (val > 1000) {
    return Math.round(val / 1000);
  }
  return val;
}

export function parseTelemetryOutput(rawOutput: string): TelemetrySnapshot | null {
  if (!rawOutput || typeof rawOutput !== 'string') return null;

  const sections = rawOutput.trim().split('---');
  if (sections.length < 5) {
    return null;
  }

  const rawCoreParams = (sections[0] ?? '').trim().split('\n');
  const rawThermals = (sections[1] ?? '').trim().split('\n');
  const rawProcStat = (sections[2] ?? '').trim().split('\n');
  const rawStatus = (sections[3] ?? '').trim().split('|');
  const rawGpu = (sections[4] ?? '').trim().split('|');

  const serviceRunning = rawStatus[0] === '1';
  const bypassActive = rawStatus[1] === '1';

  // 1. Parse thermal zones into a map
  const thermalMap: Record<string, number> = {};
  for (const line of rawThermals) {
    const parts = line.split('|');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      const type = parts[0].toLowerCase().trim();
      const temp = parseInt(parts[1], 10) || 0;
      thermalMap[type] = temp;
    }
  }

  function getCoreTemp(coreId: number): number {
    let targetPattern = '';
    if (coreId === 0 || coreId === 1) {
      targetPattern = `cpu-0-${coreId}`;
    } else if (coreId >= 2 && coreId <= 6) {
      targetPattern = `cpu-1-${coreId - 2}`;
    } else if (coreId === 7) {
      targetPattern = 'cpu-2-0';
    }

    const standardCpuPattern = `cpu-${coreId}`;

    for (const [type, rawTemp] of Object.entries(thermalMap)) {
      let matched = false;

      if (targetPattern && type.includes(targetPattern)) {
        matched = true;
      } else if (type.includes(standardCpuPattern)) {
        const indexAfter = type.indexOf(standardCpuPattern) + standardCpuPattern.length;
        if (indexAfter < type.length) {
          const nextChar = type.charAt(indexAfter);
          if (nextChar >= '0' && nextChar <= '9') {
            continue; // Skip cpu-10, cpu-11, etc.
          }
        }
        matched = true;
      }

      // Pattern: apc0-cpu0
      if (type.includes('apc0-cpu')) {
        const numPart = type.split('apc0-cpu')[1];
        if (numPart && parseInt(numPart, 10) === coreId) matched = true;
      }

      // Pattern: apc1-cpu
      if (type.includes('apc1-cpu')) {
        const numPart = type.split('apc1-cpu')[1];
        if (numPart && parseInt(numPart, 10) + 3 === coreId) matched = true;
      }

      if (type.includes(`cpu${coreId}_`)) {
        matched = true;
      }

      if (matched) {
        if (rawTemp > 1000 || rawTemp < -1000) {
          return Math.round(rawTemp / 1000);
        }
        return rawTemp;
      }
    }

    const fallbackTemp =
      thermalMap['cpu_therm'] ||
      thermalMap['cpu-0-0-0'] ||
      thermalMap['thermal_zone0'] ||
      thermalMap['tsens_tz_sensor0'] ||
      0;
    if (fallbackTemp > 1000) return Math.round(fallbackTemp / 1000);
    return fallbackTemp;
  }

  function getGpuTemp(): number {
    for (const [type, rawTemp] of Object.entries(thermalMap)) {
      if (
        type.includes('gpu-0') ||
        type.includes('gpu_therm') ||
        (type.includes('gpu') && !type.includes('gpubusy'))
      ) {
        if (rawTemp > 1000 || rawTemp < -1000) {
          return Math.round(rawTemp / 1000);
        }
        return rawTemp;
      }
    }
    return 0;
  }

  // 2. Parse CPU Cores
  const parsedCores: CoreStats[] = rawCoreParams.map((line) => {
    const parts = line.split('|');
    const id = parseInt(parts[0] ?? '0', 10);

    let cluster: CoreCluster = 'LITTLE';
    if (id >= 2 && id <= 6) cluster = 'BIG';
    else if (id === 7) cluster = 'PRIME';

    return {
      id,
      cluster,
      governor: parts[1] ?? 'unknown',
      minFreq: parseInt(parts[2] ?? '0', 10) || 0,
      maxFreq: parseInt(parts[3] ?? '0', 10) || 0,
      curFreq: parseInt(parts[4] ?? '0', 10) || 0,
      temp: getCoreTemp(id),
      usage: 0
    };
  });

  // 3. Parse /proc/stat deltas for usage
  let usageSum = 0;
  let usageCount = 0;

  for (const line of rawProcStat) {
    const parts = line.trim().split(/\s+/);
    const cpuName = parts[0];
    if (!cpuName || !cpuName.startsWith('cpu')) continue;

    const cpuId = parseInt(cpuName.replace('cpu', ''), 10);
    if (isNaN(cpuId) || cpuId < 0 || cpuId > 7) continue;

    const user = parseFloat(parts[1] ?? '0') || 0;
    const nice = parseFloat(parts[2] ?? '0') || 0;
    const system = parseFloat(parts[3] ?? '0') || 0;
    const idle = parseFloat(parts[4] ?? '0') || 0;
    const iowait = parseFloat(parts[5] ?? '0') || 0;
    const irq = parseFloat(parts[6] ?? '0') || 0;
    const softirq = parseFloat(parts[7] ?? '0') || 0;
    const steal = parseFloat(parts[8] ?? '0') || 0;

    const activeTime = user + nice + system + irq + softirq + steal;
    const idleTime = idle + iowait;
    const totalTime = activeTime + idleTime;

    const prev = prevCpuTimes[cpuName];
    if (prev) {
      const deltaActive = activeTime - prev.active;
      const deltaTotal = totalTime - prev.total;

      let usagePct = 0;
      if (deltaTotal > 0) {
        usagePct = Math.round((deltaActive / deltaTotal) * 100);
        usagePct = Math.max(0, Math.min(100, usagePct));
      }

      const core = parsedCores.find((c) => c.id === cpuId);
      if (core) {
        core.usage = usagePct;
        usageSum += usagePct;
        usageCount++;
      }
    }

    prevCpuTimes[cpuName] = { active: activeTime, total: totalTime };
  }

  // 4. Parse GPU
  const parsedAvailGovs = rawGpu[6]
    ? rawGpu[6].split(/\s+/).filter((g) => g.length > 0)
    : [];
  const rawFreqsList = (rawGpu[7] || '')
    .split(/\s+/)
    .map((f) => parseInt(f, 10))
    .filter((f) => !isNaN(f) && f > 0);

  let parsedAvailFreqs = Array.from(new Set(rawFreqsList.map((f) => formatGpuFreq(f)))).sort(
    (a, b) => a - b
  );

  if (parsedAvailFreqs.length === 0) {
    parsedAvailFreqs = [264, 355, 443, 540, 650, 738, 855, 937];
  }

  const gpuStats: GpuStats = {
    usage: Math.max(0, Math.min(100, parseInt(rawGpu[0] ?? '0', 10) || 0)),
    curFreq: formatGpuFreq(rawGpu[1] ?? '0'),
    minFreq: formatGpuFreq(rawGpu[2] ?? '0') || 264,
    maxFreq: formatGpuFreq(rawGpu[3] ?? '0') || 937,
    model: rawGpu[4] ? rawGpu[4].trim().replace(/Adreno(\d+)/i, 'Adreno $1') : 'Adreno GPU',
    governor: rawGpu[5] ? rawGpu[5].trim() : 'msm-adreno-tz',
    availGovs:
      parsedAvailGovs.length > 0
        ? parsedAvailGovs
        : ['msm-adreno-tz', 'performance', 'powersave', 'userspace', 'simple_ondemand', 'bw_hwmon'],
    availFreqs: parsedAvailFreqs,
    hwMin: parsedAvailFreqs[0] ?? 264,
    hwMax: parsedAvailFreqs[parsedAvailFreqs.length - 1] ?? 937,
    temp: getGpuTemp()
  };

  // 5. Parse Clusters Scaling Data
  const clustersData: Record<string, ClusterPolicyData> = {};
  if (sections[5]) {
    const rawClusters = sections[5].trim().split('\n');
    for (const line of rawClusters) {
      const parts = line.split('|');
      if (parts.length >= 3 && parts[0]) {
        const policyId = parts[0].trim();
        const hwMin = parseInt(parts[1] ?? '0', 10) || 0;
        let hwMax = parseInt(parts[2] ?? '0', 10) || 0;
        let gov = '';
        let availGovs: string[] = [];
        let availStr = '';

        if (parts.length >= 6) {
          gov = (parts[3] ?? '').trim();
          availGovs = (parts[4] ?? '').split(/\s+/).filter((g) => g.length > 0);
          availStr = parts[5] ?? '';
        } else {
          availStr = parts[3] ?? '';
        }

        const availFreqs = availStr
          .split(/\s+/)
          .map((f) => parseInt(f, 10))
          .filter((f) => !isNaN(f) && f > 0)
          .sort((a, b) => a - b);

        if (availFreqs.length > 0) {
          const lastFreq = availFreqs[availFreqs.length - 1];
          if (lastFreq !== undefined) {
            hwMax = Math.max(hwMax, lastFreq);
          }
        }

        clustersData[`policy${policyId}`] = {
          policyId,
          hwMin,
          hwMax,
          governor: gov || 'schedutil',
          availGovs:
            availGovs.length > 0
              ? availGovs
              : ['schedutil', 'performance', 'powersave', 'userspace', 'ondemand', 'conservative'],
          availFreqs
        };
      }
    }
  }

  const totalLoad = usageCount > 0 ? Math.round(usageSum / usageCount) : 0;

  return {
    cores: parsedCores,
    totalLoad,
    serviceRunning,
    bypassActive,
    gpu: gpuStats,
    clusters: clustersData
  };
}
