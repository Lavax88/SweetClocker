/* stats.js - Core Telemetry and Usage Parser (Classic Script version) */
(function() {
  let prevCpuTimes = {};

  // Extremely optimized query using shell builtins (read) to prevent fork overhead
  // Uses alternative sysfs path (/dev/sweetclocker/sysfs) if mounted to read actual unmounted frequency limits
  const STATS_COMBINED_CMD = `
sys_path="/sys"
[ -d "/dev/sweetclocker/sysfs/devices/system/cpu" ] && sys_path="/dev/sweetclocker/sysfs"

for c in 0 1 2 3 4 5 6 7; do
  p="\${sys_path}/devices/system/cpu/cpu\${c}/cpufreq"
  gov="unknown"
  min="0"
  max="0"
  cur="0"
  [ -f "\${p}/scaling_governor" ] && read -r gov < "\${p}/scaling_governor"
  [ -f "\${p}/scaling_min_freq" ] && read -r min < "\${p}/scaling_min_freq"
  [ -f "\${p}/scaling_max_freq" ] && read -r max < "\${p}/scaling_max_freq"
  [ -f "\${p}/scaling_cur_freq" ] && read -r cur < "\${p}/scaling_cur_freq"
  echo "\${c}|\${gov}|\${min}|\${max}|\${cur}"
done
echo "---"
for tz in /sys/class/thermal/thermal_zone*; do
  [ -f "\${tz}/type" ] || continue
  read -r type < "\${tz}/type"
  read -r temp < "\${tz}/temp"
  echo "\${type}|\${temp}"
done
echo "---"
cat /proc/stat | grep -E "^cpu[0-7] "
echo "---"
is_run=0
pgrep -f "sweetclocker/service.sh" >/dev/null && is_run=1
bypass=0
[ -f /data/local/tmp/sweetclocker_force ] && bypass=1
echo "\${is_run}|\${bypass}"
echo "---"
gpu_busy="0"
gpu_cur="0"
gpu_min="0"
gpu_max="0"
gpu_model="Adreno GPU"
[ -f "/sys/class/kgsl/kgsl-3d0/gpu_busy_percent" ] && read -r gpu_busy < "/sys/class/kgsl/kgsl-3d0/gpu_busy_percent"
if [ "\${gpu_busy}" = "0" ] && [ -f "/sys/class/kgsl/kgsl-3d0/gpubusy" ]; then
  read -r busy total < "/sys/class/kgsl/kgsl-3d0/gpubusy"
  if [ -n "\${total}" ] && [ "\${total}" -gt 0 ]; then
    gpu_busy=\$((busy * 100 / total))
  fi
fi
[ -f "/sys/class/kgsl/kgsl-3d0/devfreq/cur_freq" ] && read -r gpu_cur < "/sys/class/kgsl/kgsl-3d0/devfreq/cur_freq"
[ -f "/sys/class/kgsl/kgsl-3d0/devfreq/min_freq" ] && read -r gpu_min < "/sys/class/kgsl/kgsl-3d0/devfreq/min_freq"
[ -f "/sys/class/kgsl/kgsl-3d0/devfreq/max_freq" ] && read -r gpu_max < "/sys/class/kgsl/kgsl-3d0/devfreq/max_freq"
[ "\${gpu_cur}" = "0" ] && [ -f "/sys/class/kgsl/kgsl-3d0/gpuclk" ] && read -r gpu_cur < "/sys/class/kgsl/kgsl-3d0/gpuclk"
[ "\${gpu_max}" = "0" ] && [ -f "/sys/class/kgsl/kgsl-3d0/max_gpuclk" ] && read -r gpu_max < "/sys/class/kgsl/kgsl-3d0/max_gpuclk"
[ -f "/sys/class/kgsl/kgsl-3d0/gpu_model" ] && read -r gpu_model < "/sys/class/kgsl/kgsl-3d0/gpu_model"
echo "\${gpu_busy}|\${gpu_cur}|\${gpu_min}|\${gpu_max}|\${gpu_model}"
`;

  /**
   * Fetch and parse system stats
   * @returns {Promise<{cores: Array, totalLoad: number, serviceRunning: boolean, bypassActive: boolean, gpu: Object}>}
   */
  async function getCpuStats() {
    const { errno, stdout, stderr } = await KsuApi.exec(STATS_COMBINED_CMD);
    
    if (errno !== 0) {
      console.error("Failed to query stats:", stderr);
      throw new Error(stderr || "Unknown system error querying cpufreq/gpufreq");
    }
    
    const sections = stdout.trim().split("---");
    if (sections.length < 5) {
      throw new Error("Invalid output format returned by stats command");
    }
    
    const rawCoreParams = sections[0].trim().split("\n");
    const rawThermals = sections[1].trim().split("\n");
    const rawProcStat = sections[2].trim().split("\n");
    const rawStatus = sections[3].trim().split("|");
    const rawGpu = sections[4].trim().split("|");
    
    const serviceRunning = rawStatus[0] === "1";
    const bypassActive = rawStatus[1] === "1";
    
    // Parse thermal zones into a map: type -> temp
    const thermalMap = {};
    rawThermals.forEach(line => {
      const parts = line.split("|");
      if (parts.length >= 2) {
        const type = parts[0].toLowerCase().trim();
        const temp = parseInt(parts[1], 10) || 0;
        thermalMap[type] = temp;
      }
    });

    // Match core temperatures
    function getCoreTemp(coreId) {
      // 1. Precise cpu-X-Y-Z mapping pattern (Snapdragon 8 Gen 2 / 3 / 8s Gen 4)
      let targetPattern = "";
      if (coreId === 0 || coreId === 1) {
        targetPattern = `cpu-0-${coreId}`;
      } else if (coreId >= 2 && coreId <= 6) {
        targetPattern = `cpu-1-${coreId - 2}`;
      } else if (coreId === 7) {
        targetPattern = `cpu-2-0`;
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
        
        // Pattern B: apc0-cpu0 (core 0), apc0-cpu1 (core 1), apc0-cpu2 (core 2)
        if (type.includes("apc0-cpu")) {
          const numPart = type.split("apc0-cpu")[1];
          if (numPart && parseInt(numPart, 10) === coreId) matched = true;
        }
        
        // Pattern C: apc1-cpu0 (core 3), apc1-cpu1 (core 4), etc. (offset of 3)
        if (type.includes("apc1-cpu")) {
          const numPart = type.split("apc1-cpu")[1];
          if (numPart && (parseInt(numPart, 10) + 3) === coreId) matched = true;
        }
        
        // Pattern D: cpu0_0 (core 0), cpu1_0 (core 1)...
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
      
      // Fallback to CPU package temperature (cpu_therm) or first sensor
      const fallbackTemp = thermalMap["cpu_therm"] || thermalMap["cpu-0-0-0"] || thermalMap["thermal_zone0"] || thermalMap["tsens_tz_sensor0"] || 0;
      if (fallbackTemp > 1000) return Math.round(fallbackTemp / 1000);
      return fallbackTemp;
    }
    
    const parsedCores = rawCoreParams.map(line => {
      const parts = line.split("|");
      const id = parseInt(parts[0], 10);
      
      let cluster = "LITTLE";
      if (id >= 2 && id <= 6) cluster = "MID";
      else if (id === 7) cluster = "PRIME";
      
      return {
        id,
        cluster,
        governor: parts[1],
        minFreq: parseInt(parts[2], 10),
        maxFreq: parseInt(parts[3], 10),
        curFreq: parseInt(parts[4], 10),
        temp: getCoreTemp(id),
        usage: 0
      };
    });
    
    let usageSum = 0;
    let usageCount = 0;
    
    rawProcStat.forEach(line => {
      const parts = line.trim().split(/\s+/);
      const cpuName = parts[0];
      const cpuId = parseInt(cpuName.replace("cpu", ""), 10);
      
      if (isNaN(cpuId) || cpuId < 0 || cpuId > 7) return;
      
      const user = parseFloat(parts[1]) || 0;
      const nice = parseFloat(parts[2]) || 0;
      const system = parseFloat(parts[3]) || 0;
      const idle = parseFloat(parts[4]) || 0;
      const iowait = parseFloat(parts[5]) || 0;
      const irq = parseFloat(parts[6]) || 0;
      const softirq = parseFloat(parts[7]) || 0;
      const steal = parseFloat(parts[8]) || 0;
      
      const activeTime = user + nice + system + irq + softirq + steal;
      const idleTime = idle + iowait;
      const totalTime = activeTime + idleTime;
      
      if (prevCpuTimes[cpuName]) {
        const prev = prevCpuTimes[cpuName];
        const deltaActive = activeTime - prev.active;
        const deltaTotal = totalTime - prev.total;
        
        let usagePct = 0;
        if (deltaTotal > 0) {
          usagePct = Math.round((deltaActive / deltaTotal) * 100);
          usagePct = Math.max(0, Math.min(100, usagePct));
        }
        
        const core = parsedCores.find(c => c.id === cpuId);
        if (core) {
          core.usage = usagePct;
          usageSum += usagePct;
          usageCount++;
        }
      }
      
      prevCpuTimes[cpuName] = { active: activeTime, total: totalTime };
    });
    
    // Convert frequencies from Hz/kHz to MHz
    function formatGpuFreq(valStr) {
      const val = parseInt(valStr, 10) || 0;
      if (val === 0) return 0;
      if (val > 1000000) {
        return Math.round(val / 1000000);
      } else if (val > 1000) {
        return Math.round(val / 1000);
      }
      return val;
    }
    
    // Get GPU temperature from thermal zone keys
    function getGpuTemp() {
      for (const [type, rawTemp] of Object.entries(thermalMap)) {
        if (type.includes("gpu-0") || type.includes("gpu_therm") || (type.includes("gpu") && !type.includes("gpubusy"))) {
          if (rawTemp > 1000 || rawTemp < -1000) {
            return Math.round(rawTemp / 1000);
          }
          return rawTemp;
        }
      }
      return 0;
    }
    
    const gpuStats = {
      usage: Math.max(0, Math.min(100, parseInt(rawGpu[0], 10) || 0)),
      curFreq: formatGpuFreq(rawGpu[1]),
      minFreq: formatGpuFreq(rawGpu[2]),
      maxFreq: formatGpuFreq(rawGpu[3]),
      model: rawGpu[4] ? rawGpu[4].trim().replace(/Adreno(\d+)/i, 'Adreno $1') : "Adreno GPU",
      temp: getGpuTemp()
    };
    
    const totalLoad = usageCount > 0 ? Math.round(usageSum / usageCount) : 0;
    
    return {
      cores: parsedCores,
      totalLoad,
      serviceRunning,
      bypassActive,
      gpu: gpuStats
    };
  }

  /**
   * Toggle the SweetClocker force bypass override setting
   */
  async function setBypassMode(activate) {
    const cmd = activate 
      ? "touch /data/local/tmp/sweetclocker_force" 
      : "rm -f /data/local/tmp/sweetclocker_force";
    
    const { errno, stderr } = await KsuApi.exec(cmd);
    if (errno !== 0) {
      console.error("Failed to toggle bypass:", stderr);
      return false;
    }
    return true;
  }

  // Expose to window namespace
  window.Stats = {
    getCpuStats,
    setBypassMode
  };
})();
