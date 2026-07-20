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
        2|3|4|5|6) echo "1920000 MID" ;;
        7) echo "2515200 PRIME" ;;
        *) echo "0 UNKNOWN" ;;
    esac
}

apply_and_log() {
    label="$1"
    path="$2"
    target="$3"

    if [ ! -f "$path/scaling_max_freq" ]; then
        log_msg "error: ${path}/scaling_max_freq not found"
        return 1
    fi

    # Determine the corresponding standard path for locking
    if [ "${label#policy}" != "$label" ]; then
        std_path="/sys/devices/system/cpu/cpufreq/${label}/scaling_max_freq"
    else
        std_path="/sys/devices/system/cpu/${label}/cpufreq/scaling_max_freq"
    fi

    # Check against scaling_min_freq to prevent capping below min
    min_freq=$(cat "$path/scaling_min_freq" 2>/dev/null)
    if [ -n "$min_freq" ] && [ "$min_freq" -eq "$min_freq" ] 2>/dev/null; then
        if [ "$target" -lt "$min_freq" ] 2>/dev/null; then
            log_msg "warning: skipping ${label}/scaling_max_freq: target ${target} kHz is below scaling_min_freq (${min_freq} kHz)"
            return 1
        fi
    fi

    # Unmount the standard path if currently bind-mounted before writing to the underlying file
    if grep -q " ${std_path} " /proc/mounts 2>/dev/null; then
        umount "${std_path}" 2>/dev/null
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

        # Apply VFS bind-mount lock to prevent userspace (libperfmgr/PowerHAL) overrides on the standard path
        mkdir -p /dev/sweetclocker 2>/dev/null
        src_file="/dev/sweetclocker/${label}_max_freq"
        echo "$readback" > "$src_file" 2>/dev/null
        chmod 444 "$src_file" 2>/dev/null
        mount --bind "$src_file" "${std_path}" 2>/dev/null

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
                    if grep -q " ${std_path} " /proc/mounts 2>/dev/null; then
                        umount "${std_path}" 2>/dev/null
                    fi
                    err_msg2=$(echo "$fallback_target" > "$path/scaling_max_freq" 2>&1)
                    if [ "$?" -eq 0 ]; then
                        readback=$(cat "$path/scaling_max_freq" 2>/dev/null)
                        if [ "$readback" = "$fallback_target" ]; then
                            log_msg "${label}/scaling_max_freq: wrote ${fallback_target} (fallback from ${target}), readback ${readback} (exact)"
                        else
                            log_msg "${label}/scaling_max_freq: wrote ${fallback_target} (fallback from ${target}), readback ${readback} (snapped, nearest available)"
                        fi

                        # Apply VFS bind-mount lock
                        mkdir -p /dev/sweetclocker 2>/dev/null
                        src_file="/dev/sweetclocker/${label}_max_freq"
                        echo "$readback" > "$src_file" 2>/dev/null
                        chmod 444 "$src_file" 2>/dev/null
                        mount --bind "$src_file" "${std_path}" 2>/dev/null

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

MODE="$1"
CHECK_NUM="$2"

if [ "$MODE" = "--check-soc" ]; then
    check_is_sd8s_gen4
    exit $?
fi

check_is_sd8s_gen4 || exit 1

found_LITTLE=0
found_MID=0
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
        elif [ "$first_cluster" = "MID" ] && case "$cpus_comma" in "2,3,4,5,6"|"2,3,4"|"5,6") true ;; *) false ;; esac; then
            matches_expected=1
            found_MID=1
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

if [ "$found_LITTLE" != "1" ] || [ "$found_MID" != "1" ] || [ "$found_PRIME" != "1" ]; then
    layout_mismatch=1
    if [ "$MODE" = "--init" ]; then
        if [ "$found_LITTLE" != "1" ]; then
            log_msg "error: expected cluster LITTLE (cpus 0,1 -> 1286400 kHz) policy directory missing or mismatched!"
        fi
        if [ "$found_MID" != "1" ]; then
            log_msg "error: expected cluster MID (cpus 2,3,4,5,6 -> 1920000 kHz) policy directory missing or mismatched!"
        fi
        if [ "$found_PRIME" != "1" ]; then
            log_msg "error: expected cluster PRIME (cpu 7 -> 2515200 kHz) policy directory missing or mismatched!"
        fi
    fi
fi

if [ "$layout_mismatch" = "1" ] && [ "$MODE" = "--init" ]; then
    log_msg "WARNING: Cluster layout mismatch detected on this device!"
    log_msg "WARNING: Expected: cpu0-1 (LITTLE: 1286400 kHz), cpu2-6 (MID: 1920000 kHz across policy2/policy5), cpu7 (PRIME: 2515200 kHz)."
    log_msg "WARNING: Discovered grouping does not match expected SoC split. Sweet-spot numbers were derived for SD8s Gen 4."
fi

if [ "$MODE" = "--init" ]; then
    for item in $POLICY_TARGETS $CPU_TARGETS; do
        label=$(echo "$item" | cut -d: -f1)
        path=$(echo "$item" | cut -d: -f2)
        target=$(echo "$item" | cut -d: -f3)
        apply_and_log "$label" "$path" "$target"
    done
elif [ "$MODE" = "--check" ] || [ "$MODE" = "--check-slow" ]; then
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
            drift_count=$((drift_count + 1))
            log_msg "service.sh: drift detected on ${label}, was reset to ${curr_freq}, re-applying ${target}"
            apply_and_log "$label" "$path" "$target"
        fi
    done

    if [ "$drift_count" -eq 0 ]; then
        if [ "$MODE" = "--check" ] && [ "$CHECK_NUM" = "1" ]; then
            log_msg "service.sh: check ok, no drift"
        elif [ -n "$CHECK_NUM" ] && [ $((CHECK_NUM % 10)) -eq 0 ] 2>/dev/null; then
            log_msg "service.sh: heartbeat, no drift (check #${CHECK_NUM})"
        fi
    fi
fi
