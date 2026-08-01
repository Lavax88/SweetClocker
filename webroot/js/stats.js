/* stats.js - Core Telemetry and Usage Parser (Classic Script version) */
(function() {
  let prevCpuTimes = {};
  let lastCachedStats = null;

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
gpu_dir="/sys/class/kgsl/kgsl-3d0"
[ -d "\${sys_path}/class/kgsl/kgsl-3d0" ] && gpu_dir="\${sys_path}/class/kgsl/kgsl-3d0"

gpu_df_dir=""
for d in "\${sys_path}/class/devfreq/3d00000.qcom,kgsl-3d0" \
         "\${sys_path}/devices/platform/soc/3d00000.qcom,kgsl-3d0/devfreq/3d00000.qcom,kgsl-3d0" \
         "\${sys_path}/class/devfreq/gpufreq" \
         "\${gpu_dir}/devfreq"; do
  [ -d "\$d" ] || continue
  case "\$d" in *bw*|*bwmon*) continue ;; esac
  gpu_df_dir="\$d"
  break
done

gpu_busy="0"
gpu_cur="0"
gpu_min="0"
gpu_max="0"
gpu_model="Adreno GPU"
gpu_gov="msm-adreno-tz"
gpu_avail_govs=""
gpu_avail_freqs=""

[ -f "\${gpu_dir}/gpu_busy_percent" ] && read -r gpu_busy < "\${gpu_dir}/gpu_busy_percent"
if [ "\${gpu_busy}" = "0" ] && [ -f "\${gpu_dir}/gpubusy" ]; then
  read -r busy total < "\${gpu_dir}/gpubusy"
  [ -n "\${total}" ] && [ "\${total}" -gt 0 ] && gpu_busy=\$((busy * 100 / total))
fi

[ -f "\${gpu_dir}/max_gpuclk" ] && read -r gpu_max < "\${gpu_dir}/max_gpuclk"
[ -f "\${gpu_dir}/gpuclk" ] && read -r gpu_cur < "\${gpu_dir}/gpuclk"

if [ -n "\${gpu_df_dir}" ]; then
  [ -f "\${gpu_df_dir}/cur_freq" ] && [ "\${gpu_cur}" = "0" ] && read -r gpu_cur < "\${gpu_df_dir}/cur_freq"
  [ -f "\${gpu_df_dir}/min_freq" ] && read -r gpu_min < "\${gpu_df_dir}/min_freq"
  [ -f "\${gpu_df_dir}/max_freq" ] && [ "\${gpu_max}" = "0" ] && read -r gpu_max < "\${gpu_df_dir}/max_freq"
  [ -f "\${gpu_df_dir}/governor" ] && read -r gpu_gov < "\${gpu_df_dir}/governor"
  [ -f "\${gpu_df_dir}/available_governors" ] && read -r gpu_avail_govs < "\${gpu_df_dir}/available_governors"
  if [ -f "\${gpu_dir}/gpu_available_frequencies" ]; then
    read -r gpu_avail_freqs < "\${gpu_dir}/gpu_available_frequencies"
  elif [ -f "\${gpu_df_dir}/available_frequencies" ]; then
    read -r gpu_avail_freqs < "\${gpu_df_dir}/available_frequencies"
  fi
fi

[ -f "\${gpu_dir}/gpu_model" ] && read -r gpu_model < "\${gpu_dir}/gpu_model"

if [ -n "\${gpu_min}" ] && [ -n "\${gpu_max}" ]; then
  if [ "\${gpu_min}" -gt "\${gpu_max}" ] 2>/dev/null; then
    gpu_min="264000000"
  fi
fi

echo "\${gpu_busy}|\${gpu_cur}|\${gpu_min}|\${gpu_max}|\${gpu_model}|\${gpu_gov}|\${gpu_avail_govs}|\${gpu_avail_freqs}"
echo "---"
for p in 0 2 5 7; do
  pol_dir="\${sys_path}/devices/system/cpu/cpufreq/policy\${p}"
  [ -d "\${pol_dir}" ] || pol_dir="\${sys_path}/devices/system/cpu/cpu\${p}/cpufreq"
  avail=""
  boost=""
  hw_min="0"
  hw_max="0"
  gov=""
  avail_govs=""
  [ -f "\${pol_dir}/scaling_available_frequencies" ] && read -r avail < "\${pol_dir}/scaling_available_frequencies"
  [ -f "\${pol_dir}/scaling_boost_frequencies" ] && read -r boost < "\${pol_dir}/scaling_boost_frequencies"
  [ -n "\${boost}" ] && avail="\${avail} \${boost}"
  [ -f "\${pol_dir}/cpuinfo_min_freq" ] && read -r hw_min < "\${pol_dir}/cpuinfo_min_freq"
  [ -f "\${pol_dir}/cpuinfo_max_freq" ] && read -r hw_max < "\${pol_dir}/cpuinfo_max_freq"
  [ -f "\${pol_dir}/scaling_governor" ] && read -r gov < "\${pol_dir}/scaling_governor"
  [ -f "\${pol_dir}/scaling_available_governors" ] && read -r avail_govs < "\${pol_dir}/scaling_available_governors"
  echo "\${p}|\${hw_min}|\${hw_max}|\${gov}|\${avail_govs}|\${avail}"
done
`;

  /**
   * Fetch and parse system stats
   * @returns {Promise<{cores: Array, totalLoad: number, serviceRunning: boolean, bypassActive: boolean, gpu: Object, clusters: Object}>}
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

    const clustersData = {};
    if (sections[5]) {
      const rawClusters = sections[5].trim().split("\n");
      rawClusters.forEach(line => {
        const parts = line.split("|");
        if (parts.length >= 3) {
          const policyId = parts[0].trim();
          const hwMin = parseInt(parts[1], 10) || 0;
          let hwMax = parseInt(parts[2], 10) || 0;
          let gov = "";
          let availGovs = [];
          let availStr = "";

          if (parts.length >= 6) {
            gov = parts[3].trim();
            availGovs = parts[4].split(/\s+/).filter(g => g.length > 0);
            availStr = parts[5] || "";
          } else {
            availStr = parts[3] || "";
          }

          const availFreqs = availStr.split(/\s+/).map(f => parseInt(f, 10)).filter(f => !isNaN(f) && f > 0).sort((a, b) => a - b);
          if (availFreqs.length > 0) {
            hwMax = Math.max(hwMax, availFreqs[availFreqs.length - 1]);
          }
          clustersData[`policy${policyId}`] = {
            policyId,
            hwMin,
            hwMax,
            governor: gov || "schedutil",
            availGovs: availGovs.length > 0 ? availGovs : ["schedutil", "performance", "powersave", "userspace", "ondemand", "conservative"],
            availFreqs
          };
        }
      });
    }
    
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
      if (id >= 2 && id <= 6) cluster = "BIG";
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
    
    const parsedAvailGovs = rawGpu[6] ? rawGpu[6].split(/\s+/).filter(g => g.length > 0) : [];
    const rawFreqsList = (rawGpu[7] || "").split(/\s+/).map(f => parseInt(f, 10)).filter(f => !isNaN(f) && f > 0);
    let parsedAvailFreqs = Array.from(new Set(rawFreqsList.map(f => formatGpuFreq(f)))).sort((a, b) => a - b);

    if (parsedAvailFreqs.length === 0) {
      parsedAvailFreqs = [264, 355, 443, 540, 650, 738, 855, 937];
    }

    const gpuStats = {
      usage: Math.max(0, Math.min(100, parseInt(rawGpu[0], 10) || 0)),
      curFreq: formatGpuFreq(rawGpu[1]),
      minFreq: formatGpuFreq(rawGpu[2]) || 264,
      maxFreq: formatGpuFreq(rawGpu[3]) || 937,
      model: rawGpu[4] ? rawGpu[4].trim().replace(/Adreno(\d+)/i, 'Adreno $1') : "Adreno GPU",
      governor: rawGpu[5] ? rawGpu[5].trim() : "msm-adreno-tz",
      availGovs: parsedAvailGovs.length > 0 ? parsedAvailGovs : ["msm-adreno-tz", "performance", "powersave", "userspace", "simple_ondemand", "bw_hwmon"],
      availFreqs: parsedAvailFreqs,
      hwMin: parsedAvailFreqs[0],
      hwMax: parsedAvailFreqs[parsedAvailFreqs.length - 1],
      temp: getGpuTemp()
    };
    
    const totalLoad = usageCount > 0 ? Math.round(usageSum / usageCount) : 0;
    
    const result = {
      cores: parsedCores,
      totalLoad,
      serviceRunning,
      bypassActive,
      gpu: gpuStats,
      clusters: clustersData
    };
    lastCachedStats = result;
    return result;
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

  async function getExistingCustomLines(filterPrefix) {
    const { stdout } = await KsuApi.exec("cat /data/local/tmp/.sweetclocker_custom 2>/dev/null");
    if (!stdout) return [];
    return stdout.split('\n').filter(l => l.trim().length > 0 && !l.startsWith(filterPrefix));
  }

  function getScriptCmd(flag) {
    return `sp="/data/adb/modules/sweetclocker/sweetspot-apply.sh"\n` +
      `[ -f "$sp" ] || sp="/data/adb/modules/SweetClocker/sweetspot-apply.sh"\n` +
      `[ -f "$sp" ] || sp="/data/adb/modules_update/sweetclocker/sweetspot-apply.sh"\n` +
      `sh "$sp" ${flag}`;
  }

  async function applyCpuConfig(config) {
    const lines = await getExistingCustomLines("policy");
    for (const [pol, limits] of Object.entries(config)) {
      if (limits.min) lines.push(`${pol}_min=${limits.min}`);
      if (limits.max) lines.push(`${pol}_max=${limits.max}`);
      if (limits.gov) lines.push(`${pol}_gov=${limits.gov}`);
    }
    const customText = lines.join('\n') + (lines.length ? '\n' : '');
    const cmd = `cat << 'EOF' > /data/local/tmp/.sweetclocker_custom\n${customText}EOF\n` + getScriptCmd("--apply-cpu");

    const { errno, stderr } = await KsuApi.exec(cmd);
    if (errno !== 0) {
      console.error("Failed to apply CPU configuration:", stderr);
      return false;
    }
    return true;
  }

  async function applyGpuConfig(gpuConfig) {
    const lines = await getExistingCustomLines("gpu_");
    if (gpuConfig) {
      if (gpuConfig.min) lines.push(`gpu_min=${gpuConfig.min}`);
      if (gpuConfig.max) lines.push(`gpu_max=${gpuConfig.max}`);
      if (gpuConfig.gov) lines.push(`gpu_gov=${gpuConfig.gov}`);
    }
    const customText = lines.join('\n') + (lines.length ? '\n' : '');
    const cmd = `cat << 'EOF' > /data/local/tmp/.sweetclocker_custom\n${customText}EOF\n` + getScriptCmd("--apply-gpu");

    const { errno, stderr } = await KsuApi.exec(cmd);
    if (errno !== 0) {
      console.error("Failed to apply GPU configuration:", stderr);
      return false;
    }
    return true;
  }

  async function resetCpuConfig() {
    const cmd = getScriptCmd("--reset-cpu");
    const { errno, stderr } = await KsuApi.exec(cmd);
    if (errno !== 0) {
      console.error("Failed to reset CPU configuration:", stderr);
      return false;
    }
    return true;
  }

  async function resetGpuConfig() {
    const cmd = getScriptCmd("--reset-gpu");
    const { errno, stderr } = await KsuApi.exec(cmd);
    if (errno !== 0) {
      console.error("Failed to reset GPU configuration:", stderr);
      return false;
    }
    return true;
  }

  /**
   * Apply custom cluster frequencies to system (legacy/combined)
   */
  async function applyCustomClusterFreqs(config, gpuConfig = null) {
    if (gpuConfig && Object.keys(config).length === 0) {
      return applyGpuConfig(gpuConfig);
    }
    if (!gpuConfig && Object.keys(config).length > 0) {
      return applyCpuConfig(config);
    }
    let customText = "";
    for (const [pol, limits] of Object.entries(config)) {
      if (limits.min) customText += `${pol}_min=${limits.min}\n`;
      if (limits.max) customText += `${pol}_max=${limits.max}\n`;
      if (limits.gov) customText += `${pol}_gov=${limits.gov}\n`;
    }
    
    if (gpuConfig) {
      if (gpuConfig.min) customText += `gpu_min=${gpuConfig.min}\n`;
      if (gpuConfig.max) customText += `gpu_max=${gpuConfig.max}\n`;
      if (gpuConfig.gov) customText += `gpu_gov=${gpuConfig.gov}\n`;
    }
    
    const cmd = `cat << 'EOF' > /data/local/tmp/.sweetclocker_custom\n${customText}EOF\n` +
      `sp="/data/adb/modules/sweetclocker/sweetspot-apply.sh"\n` +
      `[ -f "$sp" ] || sp="/data/adb/modules/SweetClocker/sweetspot-apply.sh"\n` +
      `[ -f "$sp" ] || sp="$(find /data/adb/modules* -name sweetspot-apply.sh 2>/dev/null | head -n 1)"\n` +
      `sh "$sp" --init`;

    const { errno, stderr } = await KsuApi.exec(cmd);
    if (errno !== 0) {
      console.error("Failed to apply custom frequencies:", stderr);
      return false;
    }
    return true;
  }

  /**
   * Reset frequencies back to predefined sweetclocks
   */
  async function resetToSweetclocks() {
    const cmd = `sp="/data/adb/modules/sweetclocker/sweetspot-apply.sh"\n` +
      `[ -f "$sp" ] || sp="/data/adb/modules/SweetClocker/sweetspot-apply.sh"\n` +
      `[ -f "$sp" ] || sp="$(find /data/adb/modules* -name sweetspot-apply.sh 2>/dev/null | head -n 1)"\n` +
      `sh "$sp" --reset-sweetclock`;

    const { errno, stderr } = await KsuApi.exec(cmd);
    if (errno !== 0) {
      console.error("Failed to reset sweetclocks:", stderr);
      return false;
    }
    return true;
  }

  async function getIoStats() {
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

    const { errno, stdout, stderr } = await KsuApi.exec(cmd);
    if (errno !== 0 && !stdout) {
      console.error("Failed to get I/O stats:", stderr);
      return null;
    }

    const parts = stdout.split(/---IO_CUSTOM---|---IO_BLOCKS---/);
    const defaultsText = parts[0] || "";
    const customText = parts[1] || "";
    const blocksText = parts[2] || "";

    const defaultsMap = {};
    defaultsText.trim().split("\n").forEach(line => {
      if (line.includes("=")) {
        const [k, v] = line.split("=");
        defaultsMap[k.trim()] = v.trim();
      }
    });

    const customMap = {};
    let enabled = false;
    let applyBoot = false;

    customText.trim().split("\n").forEach(line => {
      if (line.includes("=")) {
        const [k, v] = line.split("=");
        const key = k.trim();
        const val = v.trim();
        if (key === "io_enabled") enabled = val === "1";
        else if (key === "io_apply_boot") applyBoot = val === "1";
        else customMap[key] = val;
      }
    });

    const blocks = [];
    blocksText.trim().split("\n").forEach(line => {
      if (!line.includes("|")) return;
      const [dev, rawSched] = line.split("|");
      if (!dev || !rawSched) return;
      if (dev.startsWith("loop") || dev.startsWith("zram")) return;

      const words = rawSched.trim().split(/\s+/);
      let active = "";
      const avail = [];
      words.forEach(w => {
        if (w.startsWith("[") && w.endsWith("]")) {
          active = w.slice(1, -1);
          avail.push(active);
        } else if (w) {
          avail.push(w);
        }
      });
      if (!active && avail.length > 0) active = avail[0];

      const defaultSched = defaultsMap[dev] || active;

      blocks.push({
        dev,
        active,
        avail,
        defaultSched,
        customSched: customMap[dev] || null
      });
    });

    return {
      enabled,
      applyBoot,
      defaultsMap,
      customMap,
      blocks
    };
  }

  async function applyIoConfig(configMap, applyBoot, enabled) {
    let customText = `io_enabled=${enabled ? 1 : 0}\nio_apply_boot=${applyBoot ? 1 : 0}\n`;
    for (const [dev, sched] of Object.entries(configMap)) {
      customText += `${dev}=${sched}\n`;
    }

    const cmd = `cat << 'EOF' > /data/local/tmp/.sweetclocker_io_custom\n${customText}EOF\n` +
      `sp="/data/adb/modules/sweetclocker/sweetspot-apply.sh"\n` +
      `[ -f "$sp" ] || sp="/data/adb/modules/SweetClocker/sweetspot-apply.sh"\n` +
      `[ -f "$sp" ] || sp="$(find /data/adb/modules* -name sweetspot-apply.sh 2>/dev/null | head -n 1)"\n` +
      `[ -f "$sp" ] && sh "$sp" --apply-io`;

    const { errno, stderr } = await KsuApi.exec(cmd);
    if (errno !== 0) {
      console.error("Failed to apply I/O config:", stderr);
      return false;
    }
    return true;
  }

  async function resetIoConfig() {
    const cmd = `sp="/data/adb/modules/sweetclocker/sweetspot-apply.sh"\n` +
      `[ -f "$sp" ] || sp="/data/adb/modules/SweetClocker/sweetspot-apply.sh"\n` +
      `[ -f "$sp" ] || sp="$(find /data/adb/modules* -name sweetspot-apply.sh 2>/dev/null | head -n 1)"\n` +
      `[ -f "$sp" ] && sh "$sp" --reset-io`;

    const { errno, stderr } = await KsuApi.exec(cmd);
    if (errno !== 0) {
      console.error("Failed to reset I/O config:", stderr);
      return false;
    }
    return true;
  }

  // Expose to window namespace
  window.Stats = {
    getCpuStats,
    getLastStats: () => lastCachedStats,
    setBypassMode,
    applyCpuConfig,
    applyGpuConfig,
    resetCpuConfig,
    resetGpuConfig,
    applyCustomClusterFreqs,
    resetToSweetclocks,
    getIoStats,
    applyIoConfig,
    resetIoConfig
  };
})();

