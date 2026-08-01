#!/system/bin/sh
# sweetspot-apply.sh
# Shared logic for SweetClocker KernelSU Next module (POCO F7 / SD8s Gen 4)

MODDIR="${0%/*}"
[ "$MODDIR" = "$0" ] && MODDIR="."

LOG_FILE="/data/local/tmp/sweetclocker.log"
STATE_FILE="/data/local/tmp/.sweetclocker_state"

# Alternative sysfs mount to bypass namespace isolation and active bind-mount locks
SYSFS_PATH="/sys"
if [ -d "/dev/sweetclocker/sysfs/devices/system/cpu" ]; then
    SYSFS_PATH="/dev/sweetclocker/sysfs"
else
    mkdir -p /dev/sweetclocker/sysfs 2>/dev/null
    if mount -t sysfs sysfs /dev/sweetclocker/sysfs 2>/dev/null; then
        SYSFS_PATH="/dev/sweetclocker/sysfs"
    fi
fi

log_msg() {
    if [ ! -f "$LOG_FILE" ]; then
        touch "$LOG_FILE" 2>/dev/null
        chmod 666 "$LOG_FILE" 2>/dev/null
    fi
    TS=$(date +"%Y-%m-%d %H:%M:%S")
    echo "[$TS] $*" >> "$LOG_FILE"
}

check_is_sd8s_gen4() {
    if [ -f "/data/local/tmp/sweetclocker_force" ]; then
        return 0
    fi

    soc_machine=$(cat /sys/devices/soc0/machine 2>/dev/null)
    soc_compat=$(tr '\0' ' ' < /sys/firmware/devicetree/base/compatible 2>/dev/null)
    soc_cpuinfo=$(grep -i -E "hardware|model name" /proc/cpuinfo 2>/dev/null)
    prop_soc=$(getprop ro.soc.model 2>/dev/null)
    prop_plat=$(getprop ro.board.platform 2>/dev/null)
    prop_hw=$(getprop ro.hardware 2>/dev/null)

    all_info=$(echo "${soc_machine} ${soc_compat} ${soc_cpuinfo} ${prop_soc} ${prop_plat} ${prop_hw}" | tr '[:upper:]' '[:lower:]')

    case "$all_info" in
        *sm8735*|*"8s gen 4"*)
            return 0
            ;;
        *)
            detected="${prop_soc:-${prop_plat:-${soc_machine:-unknown}}}"
            log_msg "error: Device is NOT running Snapdragon 8s Gen 4 (SM8735)! Detected SoC: '${detected}'."
            log_msg "error: Aborting SweetClocker to prevent applying incorrect clock caps. (Create /data/local/tmp/sweetclocker_force to bypass if false negative)"
            return 1
            ;;
    esac
}

update_state() {
    lbl="$1"
    val="$2"
    if [ -f "$STATE_FILE" ]; then
        grep -v "^${lbl}=" "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null
        mv "${STATE_FILE}.tmp" "$STATE_FILE" 2>/dev/null
    else
        touch "$STATE_FILE" 2>/dev/null
        chmod 600 "$STATE_FILE" 2>/dev/null
    fi
    echo "${lbl}=${val}" >> "$STATE_FILE"
}

get_state() {
    lbl="$1"
    if [ -f "$STATE_FILE" ]; then
        grep "^${lbl}=" "$STATE_FILE" 2>/dev/null | cut -d= -f2
    fi
}

get_cpu_target() {
    case "$1" in
        0|1) echo "1286400 LITTLE" ;;
        2|3|4|5|6) echo "1920000 BIG" ;;
        7) echo "2515200 PRIME" ;;
        *) echo "0 UNKNOWN" ;;
    esac
}

get_freq_target_nodes() {
    lbl="$1"
    real_path="$2"
    freq_type="$3" # "max" or "min"

    if [ "${lbl#policy}" != "$lbl" ]; then
        pol_dir="/sys/devices/system/cpu/cpufreq/${lbl}"
    else
        pol_dir="/sys/devices/system/cpu/${lbl}/cpufreq"
    fi

    nodes="${pol_dir}/scaling_${freq_type}_freq"

    cpus_str=$(cat "$real_path/related_cpus" 2>/dev/null)
    [ -z "$cpus_str" ] && cpus_str=$(cat "$real_path/affected_cpus" 2>/dev/null)
    if [ -n "$cpus_str" ]; then
        for c in $(echo "$cpus_str" | tr ',' ' '); do
            nodes="${nodes} /sys/devices/system/cpu/cpu${c}/cpufreq/scaling_${freq_type}_freq"
        done
    fi

    echo "$nodes"
}

get_gov_target_nodes() {
    lbl="$1"
    real_path="$2"

    if [ "${lbl#policy}" != "$lbl" ]; then
        pol_dir="/sys/devices/system/cpu/cpufreq/${lbl}"
    else
        pol_dir="/sys/devices/system/cpu/${lbl}/cpufreq"
    fi

    nodes="${pol_dir}/scaling_governor"

    cpus_str=$(cat "$real_path/related_cpus" 2>/dev/null)
    [ -z "$cpus_str" ] && cpus_str=$(cat "$real_path/affected_cpus" 2>/dev/null)
    if [ -n "$cpus_str" ]; then
        for c in $(echo "$cpus_str" | tr ',' ' '); do
            nodes="${nodes} /sys/devices/system/cpu/cpu${c}/cpufreq/scaling_governor"
        done
    fi

    echo "$nodes"
}

unmount_gov_locks() {
    lbl="$1"
    real_path="$2"
    for n in $(get_gov_target_nodes "$lbl" "$real_path"); do
        if grep -q " ${n} " /proc/mounts 2>/dev/null; then
            umount "${n}" 2>/dev/null
        fi
    done
}

bind_gov_locks() {
    lbl="$1"
    src_gov="$2"
    real_path="$3"

    if [ -n "$src_gov" ] && [ -f "$src_gov" ]; then
        for n in $(get_gov_target_nodes "$lbl" "$real_path"); do
            if [ -f "$n" ] || [ -L "$n" ]; then
                if grep -q " ${n} " /proc/mounts 2>/dev/null; then
                    umount "${n}" 2>/dev/null
                fi
                mount --bind "$src_gov" "${n}" 2>/dev/null
            fi
        done
    fi
}

unmount_freq_locks() {
    lbl="$1"
    real_path="$2"
    for n in $(get_freq_target_nodes "$lbl" "$real_path" "max") $(get_freq_target_nodes "$lbl" "$real_path" "min"); do
        if grep -q " ${n} " /proc/mounts 2>/dev/null; then
            umount "${n}" 2>/dev/null
        fi
    done
}

bind_freq_locks() {
    lbl="$1"
    src_max="$2"
    src_min="$3"
    real_path="$4"

    for n in $(get_freq_target_nodes "$lbl" "$real_path" "max"); do
        if [ -f "$n" ] || [ -L "$n" ]; then
            if grep -q " ${n} " /proc/mounts 2>/dev/null; then
                umount "${n}" 2>/dev/null
            fi
            mount --bind "$src_max" "${n}" 2>/dev/null
        fi
    done

    if [ -n "$src_min" ] && [ -f "$src_min" ]; then
        for n in $(get_freq_target_nodes "$lbl" "$real_path" "min"); do
            if [ -f "$n" ] || [ -L "$n" ]; then
                if grep -q " ${n} " /proc/mounts 2>/dev/null; then
                    umount "${n}" 2>/dev/null
                fi
                mount --bind "$src_min" "${n}" 2>/dev/null
            fi
        done
    fi
}
find_gpu_devfreq_dir() {
    for d in "${SYSFS_PATH}/class/devfreq/3d00000.qcom,kgsl-3d0" \
             "${SYSFS_PATH}/devices/platform/soc/3d00000.qcom,kgsl-3d0/devfreq/3d00000.qcom,kgsl-3d0" \
             "${SYSFS_PATH}/class/devfreq/gpufreq" \
             "${SYSFS_PATH}/class/kgsl/kgsl-3d0/devfreq"; do
        if [ -d "$d" ]; then
            case "$d" in *bw*|*bwmon*) continue ;; esac
            echo "$d"
            return
        fi
    done
    for d in ${SYSFS_PATH}/class/devfreq/*kgsl* ${SYSFS_PATH}/class/devfreq/*gpu*; do
        if [ -d "$d" ]; then
            case "$d" in *bw*|*bwmon*) continue ;; esac
            echo "$d"
            return
        fi
    done
}

find_gpu_kgsl_dir() {
    for d in "${SYSFS_PATH}/class/kgsl/kgsl-3d0" \
             "${SYSFS_PATH}/devices/platform/soc/3d00000.qcom,kgsl-3d0"; do
        if [ -d "$d" ]; then
            echo "$d"
            return
        fi
    done
}

get_gpu_target_nodes() {
    node_type="$1"
    nodes=""

    for base in "/sys" "${SYSFS_PATH}"; do
        [ -z "$base" ] && continue
        for d in "${base}/class/kgsl/kgsl-3d0/devfreq" \
                 "${base}/class/devfreq/3d00000.qcom,kgsl-3d0" \
                 "${base}/class/devfreq/gpufreq" \
                 "${base}/devices/platform/soc/3d00000.qcom,kgsl-3d0/devfreq/3d00000.qcom,kgsl-3d0"; do
            [ -d "$d" ] || continue
            if [ "$node_type" = "max" ] && [ -f "$d/max_freq" ]; then
                nodes="${nodes} ${d}/max_freq"
            elif [ "$node_type" = "min" ] && [ -f "$d/min_freq" ]; then
                nodes="${nodes} ${d}/min_freq"
            elif [ "$node_type" = "gov" ] && [ -f "$d/governor" ]; then
                nodes="${nodes} ${d}/governor"
            fi
        done

        for d in "${base}/class/kgsl/kgsl-3d0" \
                 "${base}/devices/platform/soc/3d00000.qcom,kgsl-3d0"; do
            [ -d "$d" ] || continue
            if [ "$node_type" = "max" ]; then
                [ -f "$d/max_gpuclk" ] && nodes="${nodes} ${d}/max_gpuclk"
                [ -f "$d/max_pwrlevel" ] && nodes="${nodes} ${d}/max_pwrlevel"
                [ -f "$d/thermal_pwrlevel" ] && nodes="${nodes} ${d}/thermal_pwrlevel"
            elif [ "$node_type" = "min" ]; then
                [ -f "$d/min_clock_mhz" ] && nodes="${nodes} ${d}/min_clock_mhz"
                [ -f "$d/min_pwrlevel" ] && nodes="${nodes} ${d}/min_pwrlevel"
            fi
        done
    done

    echo "$nodes" | tr ' ' '\n' | sort -u | tr '\n' ' '
}

unmount_gpu_locks() {
    for n in $(get_gpu_target_nodes "max") $(get_gpu_target_nodes "min") $(get_gpu_target_nodes "gov"); do
        if grep -q " ${n} " /proc/mounts 2>/dev/null; then
            umount "${n}" 2>/dev/null
        fi
    done
}

bind_gpu_locks() {
    src_max="$1"
    src_min="$2"
    src_gov="$3"
    src_max_pwr="$4"
    src_min_pwr="$5"

    if [ -n "$src_max" ] && [ -f "$src_max" ]; then
        for n in $(get_gpu_target_nodes "max"); do
            [ -f "$n" ] || [ -L "$n" ] || continue
            case "$n" in
                *pwrlevel*)
                    if [ -n "$src_max_pwr" ] && [ -f "$src_max_pwr" ]; then
                        grep -q " ${n} " /proc/mounts 2>/dev/null && umount "${n}" 2>/dev/null
                        mount --bind "$src_max_pwr" "${n}" 2>/dev/null
                    fi
                    ;;
                *)
                    grep -q " ${n} " /proc/mounts 2>/dev/null && umount "${n}" 2>/dev/null
                    mount --bind "$src_max" "${n}" 2>/dev/null
                    ;;
            esac
        done
    fi

    if [ -n "$src_min" ] && [ -f "$src_min" ]; then
        for n in $(get_gpu_target_nodes "min"); do
            [ -f "$n" ] || [ -L "$n" ] || continue
            case "$n" in
                *min_pwrlevel*)
                    if [ -n "$src_min_pwr" ] && [ -f "$src_min_pwr" ]; then
                        grep -q " ${n} " /proc/mounts 2>/dev/null && umount "${n}" 2>/dev/null
                        mount --bind "$src_min_pwr" "${n}" 2>/dev/null
                    fi
                    ;;
                *)
                    grep -q " ${n} " /proc/mounts 2>/dev/null && umount "${n}" 2>/dev/null
                    mount --bind "$src_min" "${n}" 2>/dev/null
                    ;;
            esac
        done
    fi

    if [ -n "$src_gov" ] && [ -f "$src_gov" ]; then
        for n in $(get_gpu_target_nodes "gov"); do
            if [ -f "$n" ] || [ -L "$n" ]; then
                grep -q " ${n} " /proc/mounts 2>/dev/null && umount "${n}" 2>/dev/null
                mount --bind "$src_gov" "${n}" 2>/dev/null
            fi
        done
    fi
}

apply_gpu_config() {
    gpu_min=$(get_custom_min "gpu")
    gpu_max=$(get_custom_max "gpu" "")
    gpu_gov=$(get_custom_gov "gpu")

    if [ -z "$gpu_min" ] && [ -z "$gpu_max" ] && [ -z "$gpu_gov" ]; then
        return 0
    fi

    gpu_df=$(find_gpu_devfreq_dir)
    gpu_kgsl=$(find_gpu_kgsl_dir)
    [ -z "$gpu_df" ] && [ -z "$gpu_kgsl" ] && return 0

    unmount_gpu_locks
    mkdir -p /dev/sweetclocker 2>/dev/null

    if [ -f "/sys/class/thermal/thermal_message/sconfig" ]; then
        if [ -n "$gpu_max" ] && [ "$gpu_max" -gt 937 ] 2>/dev/null; then
            echo 6 > /sys/class/thermal/thermal_message/sconfig 2>/dev/null
            log_msg "gpu/thermal: set sconfig 6 (49°C thermal limit unlock for custom max GPU freq ${gpu_max}MHz)"
        else
            echo 0 > /sys/class/thermal/thermal_message/sconfig 2>/dev/null
            log_msg "gpu/thermal: set sconfig 0 (stock thermal profile for max GPU freq <=937MHz)"
        fi
    fi

    src_gov_file=""
    if [ -n "$gpu_gov" ] && [ -n "$gpu_df" ] && [ -f "$gpu_df/governor" ]; then
        echo "$gpu_gov" > "$gpu_df/governor" 2>/dev/null
        readback_gov=$(cat "$gpu_df/governor" 2>/dev/null)
        log_msg "gpu/governor: set custom governor ${readback_gov:-$gpu_gov}"
        src_gov_file="/dev/sweetclocker/gpu_governor"
        echo "${readback_gov:-$gpu_gov}" > "$src_gov_file" 2>/dev/null
        chmod 444 "$src_gov_file" 2>/dev/null
        update_state "gpu_gov" "${readback_gov:-$gpu_gov}"
    fi

    src_min_file=""
    if [ -n "$gpu_min" ]; then
        if [ "$gpu_min" -le 2000 ] 2>/dev/null; then
            target_min_hz=$((gpu_min * 1000000))
            target_min_khz=$((gpu_min * 1000))
        else
            target_min_hz="$gpu_min"
            target_min_khz=$((gpu_min / 1000))
        fi

        [ -n "$gpu_df" ] && [ -f "$gpu_df/min_freq" ] && echo "$target_min_hz" > "$gpu_df/min_freq" 2>/dev/null
        [ -n "$gpu_kgsl" ] && [ -f "$gpu_kgsl/min_clock_mhz" ] && echo "$gpu_min" > "$gpu_kgsl/min_clock_mhz" 2>/dev/null

        if [ -n "$gpu_kgsl" ] && [ -f "$gpu_df/available_frequencies" ]; then
            avail_str=$(cat "$gpu_df/available_frequencies" 2>/dev/null)
            if [ -n "$avail_str" ]; then
                freq_list=$(echo "$avail_str" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -n)
                total_freqs=$(echo "$freq_list" | wc -l)
                if [ "$total_freqs" -gt 1 ]; then
                    idx=0
                    target_min_pwr=""
                    for f in $freq_list; do
                        if [ "$f" -ge "$target_min_hz" ] 2>/dev/null; then
                            target_min_pwr=$((total_freqs - 1 - idx))
                            break
                        fi
                        idx=$((idx + 1))
                    done
                    if [ -n "$target_min_pwr" ] && [ -f "$gpu_kgsl/min_pwrlevel" ]; then
                        echo "$target_min_pwr" > "$gpu_kgsl/min_pwrlevel" 2>/dev/null
                        log_msg "gpu/pwrlevel: set min_pwrlevel ${target_min_pwr} for min freq ${gpu_min}MHz"
                    fi
                fi
            fi
        fi

        readback_min=""
        [ -n "$gpu_df" ] && [ -f "$gpu_df/min_freq" ] && readback_min=$(cat "$gpu_df/min_freq" 2>/dev/null)
        if [ -z "$readback_min" ] || [ "$readback_min" = "0" ]; then
            [ -n "$gpu_df" ] && [ -f "$gpu_df/min_freq" ] && echo "$target_min_khz" > "$gpu_df/min_freq" 2>/dev/null
            [ -n "$gpu_df" ] && [ -f "$gpu_df/min_freq" ] && readback_min=$(cat "$gpu_df/min_freq" 2>/dev/null)
        fi

        log_msg "gpu/min_freq: set custom min ${readback_min:-$target_min_hz}"
        src_min_file="/dev/sweetclocker/gpu_min_freq"
        echo "${readback_min:-$target_min_hz}" > "$src_min_file" 2>/dev/null
        chmod 444 "$src_min_file" 2>/dev/null
        update_state "gpu_min" "${readback_min:-$target_min_hz}"
    fi

    src_max_file=""
    if [ -n "$gpu_max" ]; then
        if [ "$gpu_max" -le 2000 ] 2>/dev/null; then
            target_max_hz=$((gpu_max * 1000000))
            target_max_khz=$((gpu_max * 1000))
        else
            target_max_hz="$gpu_max"
            target_max_khz=$((gpu_max / 1000))
        fi

        [ -n "$gpu_df" ] && [ -f "$gpu_df/max_freq" ] && echo "$target_max_hz" > "$gpu_df/max_freq" 2>/dev/null
        [ -n "$gpu_kgsl" ] && [ -f "$gpu_kgsl/max_gpuclk" ] && echo "$target_max_hz" > "$gpu_kgsl/max_gpuclk" 2>/dev/null
        [ -n "$gpu_kgsl" ] && [ -f "$gpu_kgsl/max_clock_mhz" ] && echo "$gpu_max" > "$gpu_kgsl/max_clock_mhz" 2>/dev/null

        readback_max=""
        [ -n "$gpu_df" ] && [ -f "$gpu_df/max_freq" ] && readback_max=$(cat "$gpu_df/max_freq" 2>/dev/null)
        [ -z "$readback_max" ] && [ -n "$gpu_kgsl" ] && [ -f "$gpu_kgsl/max_gpuclk" ] && readback_max=$(cat "$gpu_kgsl/max_gpuclk" 2>/dev/null)

        if [ -z "$readback_max" ] || [ "$readback_max" = "0" ]; then
            [ -n "$gpu_df" ] && [ -f "$gpu_df/max_freq" ] && echo "$target_max_khz" > "$gpu_df/max_freq" 2>/dev/null
            [ -n "$gpu_kgsl" ] && [ -f "$gpu_kgsl/max_gpuclk" ] && echo "$target_max_khz" > "$gpu_kgsl/max_gpuclk" 2>/dev/null
            [ -n "$gpu_df" ] && [ -f "$gpu_df/max_freq" ] && readback_max=$(cat "$gpu_df/max_freq" 2>/dev/null)
        fi

        if [ -n "$gpu_kgsl" ] && [ -f "$gpu_df/available_frequencies" ]; then
            avail_str=$(cat "$gpu_df/available_frequencies" 2>/dev/null)
            if [ -n "$avail_str" ]; then
                freq_list=$(echo "$avail_str" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -n)
                total_freqs=$(echo "$freq_list" | wc -l)
                if [ "$total_freqs" -gt 1 ]; then
                    idx=0
                    target_pwr=""
                    for f in $freq_list; do
                        if [ "$f" -ge "$target_max_hz" ] 2>/dev/null; then
                            target_pwr=$((total_freqs - 1 - idx))
                            break
                        fi
                        idx=$((idx + 1))
                    done
                    if [ -n "$target_pwr" ]; then
                        [ -f "$gpu_kgsl/max_pwrlevel" ] && echo "$target_pwr" > "$gpu_kgsl/max_pwrlevel" 2>/dev/null
                        [ -f "$gpu_kgsl/thermal_pwrlevel" ] && echo "$target_pwr" > "$gpu_kgsl/thermal_pwrlevel" 2>/dev/null
                        src_max_pwr_file="/dev/sweetclocker/gpu_max_pwrlevel"
                        echo "$target_pwr" > "$src_max_pwr_file" 2>/dev/null
                        chmod 444 "$src_max_pwr_file" 2>/dev/null
                        log_msg "gpu/pwrlevel: set max_pwrlevel ${target_pwr}"
                    fi
                fi
            fi
        fi

        log_msg "gpu/max_freq: set custom max ${readback_max:-$target_max_hz}"
        src_max_file="/dev/sweetclocker/gpu_max_freq"
        echo "${readback_max:-$target_max_hz}" > "$src_max_file" 2>/dev/null
        chmod 444 "$src_max_file" 2>/dev/null
        update_state "gpu_max" "${readback_max:-$target_max_hz}"
    fi

    bind_gpu_locks "$src_max_file" "$src_min_file" "$src_gov_file" "$src_max_pwr_file" "$src_min_pwr_file"
}
apply_and_log() {
    label="$1"
    path="$2"
    def_target="$3"

    target=$(get_custom_max "$label" "$def_target")
    custom_min=$(get_custom_min "$label")
    if [ -z "$custom_min" ]; then
        if [ "$label" = "policy0" ]; then
            custom_min=364800
        elif [ "$label" = "policy2" ] || [ "$label" = "policy5" ] || [ "$label" = "policy7" ]; then
            custom_min=480000
        fi
    fi

    if [ ! -f "$path/scaling_max_freq" ]; then
        log_msg "error: ${path}/scaling_max_freq not found"
        return 1
    fi

    # Unmount standard policy and per-CPU max/min frequency & governor paths before writing to real sysfs node
    unmount_freq_locks "$label" "$path"
    unmount_gov_locks "$label" "$path"

    # Write governor (default to schedutil if no custom governor is configured)
    custom_gov=$(get_custom_gov "$label")
    target_gov="${custom_gov:-schedutil}"
    if [ -n "$target_gov" ] && [ -f "$path/scaling_governor" ]; then
        echo "$target_gov" > "$path/scaling_governor" 2>/dev/null
        readback_gov=$(cat "$path/scaling_governor" 2>/dev/null)
        log_msg "${label}/scaling_governor: set governor ${readback_gov:-$target_gov}"
        
        mkdir -p /dev/sweetclocker 2>/dev/null
        src_gov_file="/dev/sweetclocker/${label}_governor"
        echo "${readback_gov:-$target_gov}" > "$src_gov_file" 2>/dev/null
        chmod 444 "$src_gov_file" 2>/dev/null
        bind_gov_locks "$label" "$src_gov_file" "$path"

        update_state "${label}_gov" "${readback_gov:-$target_gov}"
    fi

    # Write min frequency (default 364800 kHz for LITTLE, 480000 kHz for others)
    if [ -n "$custom_min" ] && [ -f "$path/scaling_min_freq" ]; then
        echo "$custom_min" > "$path/scaling_min_freq" 2>/dev/null
        log_msg "${label}/scaling_min_freq: set min ${custom_min} kHz"
    fi

    # Check against scaling_min_freq to prevent capping below min
    min_freq=$(cat "$path/scaling_min_freq" 2>/dev/null)
    if [ -n "$min_freq" ] && [ "$min_freq" -eq "$min_freq" ] 2>/dev/null; then
        if [ "$target" -lt "$min_freq" ] 2>/dev/null; then
            log_msg "warning: skipping ${label}/scaling_max_freq: target ${target} kHz is below scaling_min_freq (${min_freq} kHz)"
            return 1
        fi
    fi

    # Attempt direct write of exact target to the real node (which is un-mounted)
    err_msg=$(echo "$target" > "$path/scaling_max_freq" 2>&1)
    write_status=$?

    if [ "$write_status" -eq 0 ]; then
        readback=$(cat "$path/scaling_max_freq" 2>/dev/null)
        if [ -z "$readback" ]; then
            log_msg "${label}/scaling_max_freq: wrote ${target}, readback failed"
            return 1
        elif [ "$readback" = "$target" ]; then
            log_msg "${label}/scaling_max_freq: wrote ${target}, readback ${readback} (exact)"
        else
            log_msg "${label}/scaling_max_freq: wrote ${target}, readback ${readback} (snapped, nearest available)"
        fi

        # Apply VFS bind-mount locks on scaling & cpuinfo max and min frequencies across policy & CPUs
        mkdir -p /dev/sweetclocker 2>/dev/null
        src_file="/dev/sweetclocker/${label}_max_freq"
        echo "$readback" > "$src_file" 2>/dev/null
        chmod 444 "$src_file" 2>/dev/null

        src_min_file=""
        if [ -n "$min_freq" ]; then
            src_min_file="/dev/sweetclocker/${label}_min_freq"
            echo "$min_freq" > "$src_min_file" 2>/dev/null
            chmod 444 "$src_min_file" 2>/dev/null
        fi

        bind_freq_locks "$label" "$src_file" "$src_min_file" "$path"

        update_state "$label" "$readback"
        return 0
    else
        # Write failed outright; attempt fallback using scaling_available_frequencies
        avail_freqs=$(cat "$path/scaling_available_frequencies" 2>/dev/null)
        if [ -n "$avail_freqs" ]; then
            fallback_target=$(echo "$avail_freqs" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -n | awk -v tgt="$target" '$1 <= tgt { best = $1 } END { print best }')
            if [ -n "$fallback_target" ] && [ "$fallback_target" -ne "$target" ] 2>/dev/null; then
                if [ -n "$min_freq" ] && [ "$fallback_target" -lt "$min_freq" ] 2>/dev/null; then
                    log_msg "warning: fallback frequency ${fallback_target} kHz is below scaling_min_freq (${min_freq} kHz) for ${label}"
                else
                    unmount_freq_locks "$label" "$path"
                    err_msg2=$(echo "$fallback_target" > "$path/scaling_max_freq" 2>&1)
                    if [ "$?" -eq 0 ]; then
                        readback=$(cat "$path/scaling_max_freq" 2>/dev/null)
                        if [ "$readback" = "$fallback_target" ]; then
                            log_msg "${label}/scaling_max_freq: wrote ${fallback_target} (fallback from ${target}), readback ${readback} (exact)"
                        else
                            log_msg "${label}/scaling_max_freq: wrote ${fallback_target} (fallback from ${target}), readback ${readback} (snapped, nearest available)"
                        fi

                        # Apply VFS bind-mount locks
                        mkdir -p /dev/sweetclocker 2>/dev/null
                        src_file="/dev/sweetclocker/${label}_max_freq"
                        echo "$readback" > "$src_file" 2>/dev/null
                        chmod 444 "$src_file" 2>/dev/null

                        src_min_file=""
                        if [ -n "$min_freq" ]; then
                            src_min_file="/dev/sweetclocker/${label}_min_freq"
                            echo "$min_freq" > "$src_min_file" 2>/dev/null
                            chmod 444 "$src_min_file" 2>/dev/null
                        fi

                        bind_freq_locks "$label" "$src_file" "$src_min_file" "$path"

                        update_state "$label" "$readback"
                        return 0
                    fi
                fi
            fi
        fi

        selinux_status=$(getenforce 2>/dev/null)
        selinux_info=""
        if [ "$selinux_status" = "Enforcing" ]; then
            selinux_info=" (SELinux getenforce: Enforcing)"
        fi
        clean_err=$(echo "$err_msg" | tr '\n' ' ' | sed 's/ *$//')
        if [ -z "$clean_err" ]; then clean_err="write error (status ${write_status})"; fi
        log_msg "${label}/scaling_max_freq: write failure for target ${target} kHz: ${clean_err}${selinux_info}"
        return 1
    fi
}

CUSTOM_FILE="/data/local/tmp/.sweetclocker_custom"

get_custom_max() {
    lbl="$1"
    def="$2"
    if [ -f "$CUSTOM_FILE" ]; then
        val=$(grep "^${lbl}_max=" "$CUSTOM_FILE" 2>/dev/null | cut -d= -f2)
        [ -n "$val" ] && echo "$val" && return
    fi
    echo "$def"
}

get_custom_min() {
    lbl="$1"
    if [ -f "$CUSTOM_FILE" ]; then
        val=$(grep "^${lbl}_min=" "$CUSTOM_FILE" 2>/dev/null | cut -d= -f2)
        [ -n "$val" ] && echo "$val" && return
    fi
    echo ""
}

get_custom_gov() {
    lbl="$1"
    if [ -f "$CUSTOM_FILE" ]; then
        val=$(grep "^${lbl}_gov=" "$CUSTOM_FILE" 2>/dev/null | cut -d= -f2)
        [ -n "$val" ] && echo "$val" && return
    fi
    echo ""
}

reset_gpu_config() {
    gpu_df=$(find_gpu_devfreq_dir)
    gpu_kgsl=$(find_gpu_kgsl_dir)

    unmount_gpu_locks

    if [ -f "$STATE_FILE" ]; then
        grep -v "^gpu_" "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null
        mv "${STATE_FILE}.tmp" "$STATE_FILE" 2>/dev/null
    fi

    if [ -f "$CUSTOM_FILE" ]; then
        grep -v "^gpu_" "$CUSTOM_FILE" > "${CUSTOM_FILE}.tmp" 2>/dev/null
        mv "${CUSTOM_FILE}.tmp" "$CUSTOM_FILE" 2>/dev/null
        [ ! -s "$CUSTOM_FILE" ] && rm -f "$CUSTOM_FILE" 2>/dev/null
    fi

    rm -f /dev/sweetclocker/gpu_* 2>/dev/null

    if [ -f "/sys/class/thermal/thermal_message/sconfig" ]; then
        echo 0 > /sys/class/thermal/thermal_message/sconfig 2>/dev/null
        log_msg "gpu/thermal: reset sconfig to 0 (default thermal profile)"
    fi

    [ -z "$gpu_df" ] && return 0

    def_gov="msm-adreno-tz"
    if [ -f "$gpu_df/available_governors" ]; then
        if ! grep -q "msm-adreno-tz" "$gpu_df/available_governors" 2>/dev/null; then
            def_gov=$(head -n 1 "$gpu_df/available_governors" | awk '{print $1}')
        fi
    fi
    if [ -n "$def_gov" ] && [ -f "$gpu_df/governor" ]; then
        echo "$def_gov" > "$gpu_df/governor" 2>/dev/null
        log_msg "gpu/governor: reset to default ${def_gov}"
    fi

    if [ -f "$gpu_df/min_freq" ]; then
        curr_raw_min=$(cat "$gpu_df/min_freq" 2>/dev/null)
        def_min="264"
        if [ -f "$gpu_df/available_frequencies" ]; then
            lowest_raw=$(tr ' ' '\n' < "$gpu_df/available_frequencies" 2>/dev/null | grep -E '^[0-9]+$' | sort -n | head -n 1)
            [ -n "$lowest_raw" ] && def_min="$lowest_raw"
        fi
        if [ "$def_min" = "264" ]; then
            if [ "${#curr_raw_min}" -ge 9 ]; then
                def_min=264000000
            elif [ "${#curr_raw_min}" -ge 6 ]; then
                def_min=264000
            fi
        fi
        echo "$def_min" > "$gpu_df/min_freq" 2>/dev/null
        log_msg "gpu/min_freq: reset to default ${def_min}"
    fi

    if [ -n "$gpu_kgsl" ]; then
        [ -f "$gpu_kgsl/max_pwrlevel" ] && echo 0 > "$gpu_kgsl/max_pwrlevel" 2>/dev/null
        [ -f "$gpu_kgsl/thermal_pwrlevel" ] && echo 0 > "$gpu_kgsl/thermal_pwrlevel" 2>/dev/null
        [ -f "$gpu_kgsl/min_clock_mhz" ] && echo 264 > "$gpu_kgsl/min_clock_mhz" 2>/dev/null
        if [ -f "$gpu_df/available_frequencies" ]; then
            total_freqs=$(tr ' ' '\n' < "$gpu_df/available_frequencies" 2>/dev/null | grep -E '^[0-9]+$' | wc -l)
            if [ "$total_freqs" -gt 1 ]; then
                def_min_pwr=$((total_freqs - 1))
                [ -f "$gpu_kgsl/min_pwrlevel" ] && echo "$def_min_pwr" > "$gpu_kgsl/min_pwrlevel" 2>/dev/null
            fi
        fi
        log_msg "gpu/pwrlevel: reset max_pwrlevel & thermal_pwrlevel to 0 (unlocked)"
    fi

    if [ -f "$gpu_df/max_freq" ] || ([ -n "$gpu_kgsl" ] && [ -f "$gpu_kgsl/max_gpuclk" ]); then
        curr_raw_max=$(cat "$gpu_df/max_freq" 2>/dev/null)
        [ -z "$curr_raw_max" ] && [ -n "$gpu_kgsl" ] && curr_raw_max=$(cat "$gpu_kgsl/max_gpuclk" 2>/dev/null)
        def_max=937000000
        if [ "${#curr_raw_max}" -le 4 ]; then
            def_max=937
        elif [ "${#curr_raw_max}" -le 7 ]; then
            def_max=937000
        fi
        [ -f "$gpu_df/max_freq" ] && echo "$def_max" > "$gpu_df/max_freq" 2>/dev/null
        [ -n "$gpu_kgsl" ] && [ -f "$gpu_kgsl/max_gpuclk" ] && echo "$def_max" > "$gpu_kgsl/max_gpuclk" 2>/dev/null
        log_msg "gpu/max_freq: reset to default ${def_max}"
    fi
}

MODE="$1"
CHECK_NUM="$2"

if [ "$MODE" = "--check-soc" ]; then
    check_is_sd8s_gen4
    exit $?
fi

if [ "$MODE" = "--reset-sweetclock" ]; then
    rm -f "$CUSTOM_FILE" 2>/dev/null
    for p in 0 2 5 7; do
        unmount_gov_locks "policy${p}" "${SYSFS_PATH}/devices/system/cpu/cpufreq/policy${p}"
        unmount_freq_locks "policy${p}" "${SYSFS_PATH}/devices/system/cpu/cpufreq/policy${p}"
    done
    reset_gpu_config
    log_msg "sweetspot-apply.sh: Reset custom cluster frequencies, governors, and GPU settings to defaults"
    MODE="--init"
fi

if [ "$MODE" = "--reset-cpu" ]; then
    if [ -f "$CUSTOM_FILE" ]; then
        grep -v "^policy[0-9]" "$CUSTOM_FILE" > "${CUSTOM_FILE}.tmp" 2>/dev/null
        mv "${CUSTOM_FILE}.tmp" "$CUSTOM_FILE" 2>/dev/null
        [ ! -s "$CUSTOM_FILE" ] && rm -f "$CUSTOM_FILE" 2>/dev/null
    fi
    log_msg "sweetspot-apply.sh: Reset CPU cluster frequencies and governors to sweetclock defaults"
    MODE="--apply-cpu"
fi

if [ "$MODE" = "--reset-gpu" ]; then
    check_is_sd8s_gen4 || exit 1
    reset_gpu_config
    log_msg "sweetspot-apply.sh: Reset GPU configuration to defaults"
    exit 0
fi

if [ "$MODE" = "--apply-gpu" ]; then
    check_is_sd8s_gen4 || exit 1
    apply_gpu_config
    exit 0
fi

check_is_sd8s_gen4 || exit 1

found_LITTLE=0
found_BIG=0
found_PRIME=0
layout_mismatch=0

POLICY_TARGETS=""
CPU_TARGETS=""

# Discover policy directories dynamically from the real SYSFS mount path
policies=$(for d in $SYSFS_PATH/devices/system/cpu/cpufreq/policy*; do
    [ -d "$d" ] || continue
    num=${d##*/policy}
    echo "$num $d"
done 2>/dev/null | sort -n | awk '{print $2}')

for d in $policies; do
    [ -d "$d" ] || continue
    policy_name=${d##*/}

    cpus_str=$(cat "$d/related_cpus" 2>/dev/null)
    if [ -z "$cpus_str" ]; then
        cpus_str=$(cat "$d/affected_cpus" 2>/dev/null)
    fi
    [ -z "$cpus_str" ] && continue

    cpus_clean=$(echo "$cpus_str" | tr ',' ' ' | awk '{$1=$1; print}')
    cpus_comma=$(echo "$cpus_clean" | tr ' ' ',')

    first_target=""
    first_cluster=""
    mixed_targets=0

    for c in $cpus_clean; do
        tgt_info=$(get_cpu_target "$c")
        tgt=${tgt_info% *}
        cls=${tgt_info#* }
        if [ -z "$first_target" ]; then
            first_target="$tgt"
            first_cluster="$cls"
        elif [ "$tgt" != "$first_target" ]; then
            mixed_targets=1
        fi
    done

    if [ "$mixed_targets" -eq 0 ] && [ -n "$first_target" ] && [ "$first_target" != "0" ]; then
        matches_expected=0
        if [ "$first_cluster" = "LITTLE" ] && [ "$cpus_comma" = "0,1" ]; then
            matches_expected=1
            found_LITTLE=1
        elif [ "$first_cluster" = "BIG" ] && case "$cpus_comma" in "2,3,4,5,6"|"2,3,4"|"5,6") true ;; *) false ;; esac; then
            matches_expected=1
            found_BIG=1
        elif [ "$first_cluster" = "PRIME" ] && [ "$cpus_comma" = "7" ]; then
            matches_expected=1
            found_PRIME=1
        else
            layout_mismatch=1
        fi

        if [ "$MODE" = "--init" ]; then
            if [ "$matches_expected" -eq 1 ]; then
                log_msg "discovered ${policy_name} -> cpus [${cpus_comma}] -> target ${first_target} kHz (${first_cluster}, matches expected)"
            else
                log_msg "discovered ${policy_name} -> cpus [${cpus_comma}] -> target ${first_target} kHz (${first_cluster}, unexpected cpu grouping)"
            fi
        fi

        POLICY_TARGETS="${POLICY_TARGETS} ${policy_name}:${d}:${first_target}:${first_cluster}"
    else
        layout_mismatch=1
        if [ "$MODE" = "--init" ]; then
            log_msg "discovered ${policy_name} -> cpus [${cpus_comma}] -> mixed cluster targets (expected clustering didn't match)"
        fi
        for c in $cpus_clean; do
            tgt_info=$(get_cpu_target "$c")
            tgt=${tgt_info% *}
            cls=${tgt_info#* }
            if [ "$tgt" != "0" ]; then
                CPU_TARGETS="${CPU_TARGETS} cpu${c}:${SYSFS_PATH}/devices/system/cpu/cpu${c}/cpufreq:${tgt}:${cls}"
            fi
        done
    fi
done

IO_DEFAULTS_FILE="/data/local/tmp/.sweetclocker_io_defaults"
IO_CUSTOM_FILE="/data/local/tmp/.sweetclocker_io_custom"

init_io_defaults() {
    if [ ! -f "$IO_DEFAULTS_FILE" ]; then
        touch "$IO_DEFAULTS_FILE" 2>/dev/null
        chmod 600 "$IO_DEFAULTS_FILE" 2>/dev/null
        sys_block_dir="${SYSFS_PATH}/block"
        [ ! -d "$sys_block_dir" ] && sys_block_dir="/sys/block"
        if [ -d "$sys_block_dir" ]; then
            for blk_dir in "$sys_block_dir"/*; do
                [ -d "$blk_dir" ] || continue
                dev_name="${blk_dir##*/}"
                case "$dev_name" in loop*|zram*) continue ;; esac
                sched_file="${blk_dir}/queue/scheduler"

                if [ -f "$sched_file" ]; then
                    raw_sched=$(cat "$sched_file" 2>/dev/null)
                    active_sched=""
                    for word in $raw_sched; do
                        case "$word" in
                            \[*\])
                                active_sched="${word#\[}"
                                active_sched="${active_sched%\]}"
                                break
                                ;;
                        esac
                    done
                    [ -z "$active_sched" ] && active_sched=$(echo "$raw_sched" | awk '{print $1}')
                    if [ -n "$active_sched" ]; then
                        echo "${dev_name}=${active_sched}" >> "$IO_DEFAULTS_FILE"
                        log_msg "io/defaults: recorded initial default scheduler '${active_sched}' for block device '${dev_name}'"
                    fi
                fi
            done
        fi
    fi
}

apply_io_config() {
    init_io_defaults
    if [ -f "$IO_CUSTOM_FILE" ]; then
        enabled=$(grep "^io_enabled=" "$IO_CUSTOM_FILE" 2>/dev/null | cut -d= -f2)
        if [ "$enabled" = "1" ]; then
            sys_block_dir="${SYSFS_PATH}/block"
            [ ! -d "$sys_block_dir" ] && sys_block_dir="/sys/block"
            while IFS='=' read -r key val; do
                [ -z "$key" ] || [ "$key" = "io_enabled" ] || [ "$key" = "io_apply_boot" ] && continue
                dev="$key"
                target_sched="$val"
                sched_file="${sys_block_dir}/${dev}/queue/scheduler"
                [ ! -f "$sched_file" ] && sched_file="/sys/block/${dev}/queue/scheduler"
                if [ -f "$sched_file" ]; then
                    echo "$target_sched" > "$sched_file" 2>/dev/null
                    raw_readback=$(cat "$sched_file" 2>/dev/null)
                    readback_sched=""
                    for word in $raw_readback; do
                        case "$word" in
                            \[*\])
                                readback_sched="${word#\[}"
                                readback_sched="${readback_sched%\]}"
                                break
                                ;;
                        esac
                    done
                    log_msg "io/scheduler: set scheduler '${readback_sched:-$target_sched}' for block device '${dev}'"
                fi
            done < "$IO_CUSTOM_FILE"
        fi
    fi
}

reset_io_config() {
    init_io_defaults
    if [ -f "$IO_DEFAULTS_FILE" ]; then
        sys_block_dir="${SYSFS_PATH}/block"
        [ ! -d "$sys_block_dir" ] && sys_block_dir="/sys/block"
        while IFS='=' read -r dev default_sched; do
            [ -z "$dev" ] || [ -z "$default_sched" ] && continue
            sched_file="${sys_block_dir}/${dev}/queue/scheduler"
            [ ! -f "$sched_file" ] && sched_file="/sys/block/${dev}/queue/scheduler"
            if [ -f "$sched_file" ]; then
                echo "$default_sched" > "$sched_file" 2>/dev/null
                log_msg "io/reset: reverted block device '${dev}' to default scheduler '${default_sched}'"
            fi
        done < "$IO_DEFAULTS_FILE"
    fi
    rm -f "$IO_CUSTOM_FILE" 2>/dev/null
}

check_io_drift() {
    if [ -f "$IO_CUSTOM_FILE" ]; then
        enabled=$(grep "^io_enabled=" "$IO_CUSTOM_FILE" 2>/dev/null | cut -d= -f2)
        apply_boot=$(grep "^io_apply_boot=" "$IO_CUSTOM_FILE" 2>/dev/null | cut -d= -f2)
        if [ "$enabled" = "1" ] && [ "$apply_boot" = "1" ]; then
            sys_block_dir="${SYSFS_PATH}/block"
            [ ! -d "$sys_block_dir" ] && sys_block_dir="/sys/block"
            while IFS='=' read -r key val; do
                [ -z "$key" ] || [ "$key" = "io_enabled" ] || [ "$key" = "io_apply_boot" ] && continue
                dev="$key"
                target_sched="$val"
                sched_file="${sys_block_dir}/${dev}/queue/scheduler"
                [ ! -f "$sched_file" ] && sched_file="/sys/block/${dev}/queue/scheduler"
                if [ -f "$sched_file" ]; then
                    raw_sched=$(cat "$sched_file" 2>/dev/null)
                    curr_sched=""
                    for word in $raw_sched; do
                        case "$word" in
                            \[*\])
                                curr_sched="${word#\[}"
                                curr_sched="${curr_sched%\]}"
                                break
                                ;;
                        esac
                    done
                    if [ -n "$curr_sched" ] && [ "$curr_sched" != "$target_sched" ]; then
                        log_msg "service.sh: I/O scheduler drift detected on ${dev} (was '${curr_sched}', expected '${target_sched}'), re-applying"
                        echo "$target_sched" > "$sched_file" 2>/dev/null
                    fi
                fi
            done < "$IO_CUSTOM_FILE"
        fi
    fi
}

if [ "$found_LITTLE" != "1" ] || [ "$found_BIG" != "1" ] || [ "$found_PRIME" != "1" ]; then
    layout_mismatch=1
    if [ "$MODE" = "--init" ]; then
        if [ "$found_LITTLE" != "1" ]; then
            log_msg "error: expected cluster LITTLE (cpus 0,1 -> 1286400 kHz) policy directory missing or mismatched!"
        fi
        if [ "$found_BIG" != "1" ]; then
            log_msg "error: expected cluster BIG (cpus 2,3,4,5,6 -> 1920000 kHz) policy directory missing or mismatched!"
        fi
        if [ "$found_PRIME" != "1" ]; then
            log_msg "error: expected cluster PRIME (cpu 7 -> 2515200 kHz) policy directory missing or mismatched!"
        fi
    fi
fi

if [ "$layout_mismatch" = "1" ] && [ "$MODE" = "--init" ]; then
    log_msg "WARNING: Cluster layout mismatch detected on this device!"
    log_msg "WARNING: Expected: cpu0-1 (LITTLE: 1286400 kHz), cpu2-6 (BIG: 1920000 kHz across policy2/policy5), cpu7 (PRIME: 2515200 kHz)."
    log_msg "WARNING: Discovered grouping does not match expected SoC split. Sweet-spot numbers were derived for SD8s Gen 4."
fi

if [ "$MODE" = "--init" ] || [ "$MODE" = "--apply-cpu" ]; then
    for item in $POLICY_TARGETS $CPU_TARGETS; do
        label=$(echo "$item" | cut -d: -f1)
        path=$(echo "$item" | cut -d: -f2)
        target=$(echo "$item" | cut -d: -f3)
        apply_and_log "$label" "$path" "$target"
    done
    if [ "$MODE" = "--init" ]; then
        apply_gpu_config
        apply_io_config
    fi
elif [ "$MODE" = "--apply-gpu" ]; then
    apply_gpu_config
elif [ "$MODE" = "--apply-io" ]; then
    apply_io_config
elif [ "$MODE" = "--reset-io" ]; then
    reset_io_config
elif [ "$MODE" = "--check" ] || [ "$MODE" = "--check-slow" ]; then
    check_io_drift
    drift_count=0
    for item in $POLICY_TARGETS $CPU_TARGETS; do
        label=$(echo "$item" | cut -d: -f1)
        path=$(echo "$item" | cut -d: -f2)
        target=$(echo "$item" | cut -d: -f3)

        if [ ! -f "$path/scaling_max_freq" ]; then
            continue
        fi

        # Check values directly against the real un-mounted nodes in SYSFS_PATH
        curr_freq=$(cat "$path/scaling_max_freq" 2>/dev/null)
        expected_landed=$(get_state "$label")
        [ -z "$expected_landed" ] && expected_landed="$target"

        if [ "$curr_freq" != "$expected_landed" ] && [ "$curr_freq" != "$target" ]; then
            avail_freqs=$(cat "$path/scaling_available_frequencies" 2>/dev/null)
            is_thermal_snap=0
            if [ -n "$avail_freqs" ] && [ -n "$curr_freq" ] && [ "$curr_freq" -le "$target" ] 2>/dev/null; then
                if echo " $avail_freqs " | grep -q " $curr_freq " 2>/dev/null; then
                    is_thermal_snap=1
                fi
            fi

            if [ "$is_thermal_snap" -eq 1 ]; then
                update_state "$label" "$curr_freq"
            else
                drift_count=$((drift_count + 1))
                log_msg "service.sh: drift detected on ${label}, was reset to ${curr_freq}, re-applying ${target}"
                apply_and_log "$label" "$path" "$target"
            fi
        else
            custom_gov=$(get_custom_gov "$label")
            if [ -n "$custom_gov" ] && [ -f "$path/scaling_governor" ]; then
                curr_gov=$(cat "$path/scaling_governor" 2>/dev/null)
                if [ "$curr_gov" != "$custom_gov" ]; then
                    drift_count=$((drift_count + 1))
                    log_msg "service.sh: governor drift detected on ${label}, was ${curr_gov}, re-applying ${custom_gov} with VFS lock"
                    unmount_gov_locks "$label" "$path"
                    echo "$custom_gov" > "$path/scaling_governor" 2>/dev/null
                    readback_gov=$(cat "$path/scaling_governor" 2>/dev/null)
                    mkdir -p /dev/sweetclocker 2>/dev/null
                    src_gov_file="/dev/sweetclocker/${label}_governor"
                    echo "${readback_gov:-$custom_gov}" > "$src_gov_file" 2>/dev/null
                    chmod 444 "$src_gov_file" 2>/dev/null
                    bind_gov_locks "$label" "$src_gov_file" "$path"
                    update_state "${label}_gov" "${readback_gov:-$custom_gov}"
                fi
            fi
        fi
    done

    gpu_custom_gov=$(get_custom_gov "gpu")
    gpu_custom_min=$(get_custom_min "gpu")
    gpu_custom_max=$(get_custom_max "gpu" "")
    if [ -n "$gpu_custom_gov" ] || [ -n "$gpu_custom_min" ] || [ -n "$gpu_custom_max" ]; then
        real_kgsl="${SYSFS_PATH}/class/kgsl/kgsl-3d0"
        real_df="${SYSFS_PATH}/class/devfreq/3d00000.qcom,kgsl-3d0"
        [ ! -d "$real_df" ] && real_df="${SYSFS_PATH}/devices/platform/soc/3d00000.qcom,kgsl-3d0/devfreq/3d00000.qcom,kgsl-3d0"

        gpu_drift=0
        if [ -n "$gpu_custom_gov" ] && [ -f "$real_df/governor" ]; then
            curr_gpu_gov=$(cat "$real_df/governor" 2>/dev/null)
            if [ "$curr_gpu_gov" != "$gpu_custom_gov" ]; then
                gpu_drift=1
                log_msg "service.sh: GPU governor drift detected (was ${curr_gpu_gov}, expected ${gpu_custom_gov})"
            fi
        fi
        if [ -n "$gpu_custom_max" ]; then
            curr_gpu_max=""
            [ -f "$real_df/max_freq" ] && curr_gpu_max=$(cat "$real_df/max_freq" 2>/dev/null)
            [ -z "$curr_gpu_max" ] && [ -f "$real_kgsl/max_gpuclk" ] && curr_gpu_max=$(cat "$real_kgsl/max_gpuclk" 2>/dev/null)
            exp_gpu_max=$(get_state "gpu_max")
            if [ -n "$exp_gpu_max" ] && [ "$curr_gpu_max" != "$exp_gpu_max" ]; then
                gpu_drift=1
                log_msg "service.sh: GPU max freq drift detected (was ${curr_gpu_max}, expected ${exp_gpu_max})"
            fi
        fi
        if [ "$gpu_drift" -eq 1 ]; then
            log_msg "service.sh: GPU drift detected, re-applying custom GPU settings with VFS locks"
            apply_gpu_config
            drift_count=$((drift_count + 1))
        fi
    fi

    if [ "$drift_count" -eq 0 ]; then
        if [ "$MODE" = "--check" ] && [ "$CHECK_NUM" = "1" ]; then
            log_msg "service.sh: check ok, no drift"
        elif [ -n "$CHECK_NUM" ] && [ $((CHECK_NUM % 10)) -eq 0 ] 2>/dev/null; then
            log_msg "service.sh: heartbeat, no drift (check #${CHECK_NUM})"
        fi
    fi
fi
