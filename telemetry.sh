#!/system/bin/sh
# telemetry.sh - High-Performance Telemetry Sampler for SweetClocker
# Outputs compact system telemetry for WebUI in a single process execution.
#
# OUTPUT FORMAT (sections separated by '---'):
# 1. CPU Cores (0..7): <core_id>|<scaling_governor>|<min_freq>|<max_freq>|<cur_freq>
# ---
# 2. Thermal Zones: <type>|<temp_millicelsius_or_celsius>
# ---
# 3. CPU Stats: Lines from /proc/stat for cpu0..cpu7
# ---
# 4. Service State: <service_running: 0|1>|<force_bypass: 0|1>
# ---
# 5. GPU: <busy_pct>|<cur_freq>|<min_freq>|<max_freq>|<model>|<governor>|<avail_govs>|<avail_freqs>
# ---
# 6. Policies (0, 2, 5, 7): <policy_id>|<hw_min>|<hw_max>|<governor>|<avail_govs>|<avail_freqs>

SYSFS_PATH="/sys"
[ -d "/dev/sweetclocker/sysfs/devices/system/cpu" ] && SYSFS_PATH="/dev/sweetclocker/sysfs"

sample_telemetry() {
  # 1. Per-core CPU frequencies & governor
  for c in 0 1 2 3 4 5 6 7; do
    p="${SYSFS_PATH}/devices/system/cpu/cpu${c}/cpufreq"
    gov="unknown"
    min="0"
    max="0"
    cur="0"
    [ -f "${p}/scaling_governor" ] && read -r gov < "${p}/scaling_governor"
    [ -f "${p}/scaling_min_freq" ] && read -r min < "${p}/scaling_min_freq"
    [ -f "${p}/scaling_max_freq" ] && read -r max < "${p}/scaling_max_freq"
    [ -f "${p}/scaling_cur_freq" ] && read -r cur < "${p}/scaling_cur_freq"
    echo "${c}|${gov}|${min}|${max}|${cur}"
  done

  echo "---"

  # 2. Thermal zones
  for tz in /sys/class/thermal/thermal_zone*; do
    [ -f "${tz}/type" ] || continue
    read -r type < "${tz}/type" 2>/dev/null || continue
    read -r temp < "${tz}/temp" 2>/dev/null || continue
    echo "${type}|${temp}"
  done

  echo "---"

  # 3. /proc/stat deltas
  if [ -f "/proc/stat" ]; then
    grep -E "^cpu[0-7] " /proc/stat 2>/dev/null || true
  fi

  echo "---"

  # 4. Module service and bypass status
  is_run=0
  pgrep -f "sweetclocker/service.sh" >/dev/null 2>&1 && is_run=1
  bypass=0
  [ -f "/data/local/tmp/sweetclocker_force" ] && bypass=1
  echo "${is_run}|${bypass}"

  echo "---"

  # 5. GPU telemetry (KGSL / Devfreq)
  gpu_dir="/sys/class/kgsl/kgsl-3d0"
  [ -d "${SYSFS_PATH}/class/kgsl/kgsl-3d0" ] && gpu_dir="${SYSFS_PATH}/class/kgsl/kgsl-3d0"

  gpu_df_dir=""
  for d in "${SYSFS_PATH}/class/devfreq/3d00000.qcom,kgsl-3d0" \
           "${SYSFS_PATH}/devices/platform/soc/3d00000.qcom,kgsl-3d0/devfreq/3d00000.qcom,kgsl-3d0" \
           "${SYSFS_PATH}/class/devfreq/gpufreq" \
           "${gpu_dir}/devfreq"; do
    [ -d "$d" ] || continue
    case "$d" in *bw*|*bwmon*) continue ;; esac
    gpu_df_dir="$d"
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

  [ -f "${gpu_dir}/gpu_busy_percent" ] && read -r gpu_busy < "${gpu_dir}/gpu_busy_percent"
  if [ "${gpu_busy}" = "0" ] && [ -f "${gpu_dir}/gpubusy" ]; then
    read -r busy total < "${gpu_dir}/gpubusy" 2>/dev/null || true
    if [ -n "${total}" ] && [ "${total}" -gt 0 ] 2>/dev/null; then
      gpu_busy=$((busy * 100 / total))
    fi
  fi

  [ -f "${gpu_dir}/max_gpuclk" ] && read -r gpu_max < "${gpu_dir}/max_gpuclk"
  [ -f "${gpu_dir}/gpuclk" ] && read -r gpu_cur < "${gpu_dir}/gpuclk"

  if [ -n "${gpu_df_dir}" ]; then
    [ -f "${gpu_df_dir}/cur_freq" ] && [ "${gpu_cur}" = "0" ] && read -r gpu_cur < "${gpu_df_dir}/cur_freq"
    [ -f "${gpu_df_dir}/min_freq" ] && read -r gpu_min < "${gpu_df_dir}/min_freq"
    [ -f "${gpu_df_dir}/max_freq" ] && [ "${gpu_max}" = "0" ] && read -r gpu_max < "${gpu_df_dir}/max_freq"
    [ -f "${gpu_df_dir}/governor" ] && read -r gpu_gov < "${gpu_df_dir}/governor"
    [ -f "${gpu_df_dir}/available_governors" ] && read -r gpu_avail_govs < "${gpu_df_dir}/available_governors"
    if [ -f "${gpu_dir}/gpu_available_frequencies" ]; then
      read -r gpu_avail_freqs < "${gpu_dir}/gpu_available_frequencies"
    elif [ -f "${gpu_df_dir}/available_frequencies" ]; then
      read -r gpu_avail_freqs < "${gpu_df_dir}/available_frequencies"
    fi
  fi

  [ -f "${gpu_dir}/gpu_model" ] && read -r gpu_model < "${gpu_dir}/gpu_model"

  if [ -n "${gpu_min}" ] && [ -n "${gpu_max}" ]; then
    if [ "${gpu_min}" -gt "${gpu_max}" ] 2>/dev/null; then
      gpu_min="264000000"
    fi
  fi

  echo "${gpu_busy}|${gpu_cur}|${gpu_min}|${gpu_max}|${gpu_model}|${gpu_gov}|${gpu_avail_govs}|${gpu_avail_freqs}"

  echo "---"

  # 6. CPU Cluster policies (0, 2, 5, 7)
  for p in 0 2 5 7; do
    pol_dir="${SYSFS_PATH}/devices/system/cpu/cpufreq/policy${p}"
    [ -d "${pol_dir}" ] || pol_dir="${SYSFS_PATH}/devices/system/cpu/cpu${p}/cpufreq"
    avail=""
    boost=""
    hw_min="0"
    hw_max="0"
    gov=""
    avail_govs=""
    [ -f "${pol_dir}/scaling_available_frequencies" ] && read -r avail < "${pol_dir}/scaling_available_frequencies"
    [ -f "${pol_dir}/scaling_boost_frequencies" ] && read -r boost < "${pol_dir}/scaling_boost_frequencies"
    [ -n "${boost}" ] && avail="${avail} ${boost}"
    [ -f "${pol_dir}/cpuinfo_min_freq" ] && read -r hw_min < "${pol_dir}/cpuinfo_min_freq"
    [ -f "${pol_dir}/cpuinfo_max_freq" ] && read -r hw_max < "${pol_dir}/cpuinfo_max_freq"
    [ -f "${pol_dir}/scaling_governor" ] && read -r gov < "${pol_dir}/scaling_governor"
    [ -f "${pol_dir}/scaling_available_governors" ] && read -r avail_govs < "${pol_dir}/scaling_available_governors"
    echo "${p}|${hw_min}|${hw_max}|${gov}|${avail_govs}|${avail}"
  done
}

case "$1" in
  --stream)
    INTERVAL_SEC="1"
    [ -n "$2" ] && INTERVAL_SEC="$2"
    PARENT_PID="$PPID"

    while true; do
      # Self-exit guard: terminate loop if parent process died
      if [ -n "$PARENT_PID" ] && [ "$PARENT_PID" -gt 1 ] 2>/dev/null; then
        kill -0 "$PARENT_PID" 2>/dev/null || exit 0
      fi

      echo "===SWEETCLOCKER_FRAME_START==="
      sample_telemetry
      echo "===SWEETCLOCKER_FRAME_END==="

      sleep "$INTERVAL_SEC"
    done
    ;;
  *)
    sample_telemetry
    ;;
esac
