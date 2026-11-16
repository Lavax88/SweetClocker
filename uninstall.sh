#!/system/bin/sh
# SweetClocker Module Uninstallation Script
# Restores CPU/GPU parameters, unmounts isolation helpers, and deletes log/tmp files

LOG_FILE="/data/local/tmp/sweetclocker.log"

log_uninstall() {
    TS=$(date +"%Y-%m-%d %H:%M:%S")
    echo "[$TS] uninstall.sh: $*" >> "$LOG_FILE" 2>/dev/null
}

log_uninstall "Starting SweetClocker module uninstallation..."

# 1. Kill any active background check loops or service daemons
log_uninstall "Terminating active service daemons..."
pkill -f "sweetclocker/service.sh" 2>/dev/null
pkill -f "sweetspot-apply.sh" 2>/dev/null

# 2. Find and release all custom bind-mount locks on CPU max frequencies
log_uninstall "Unmounting active VFS bind-mount limits..."
for mount_point in $(grep "sweetclocker" /proc/mounts 2>/dev/null | awk '{print $2}'); do
    umount -l "$mount_point" 2>/dev/null
    log_uninstall "Released bind-mount lock: $mount_point"
done

# 3. Explicitly unmount alternative sysfs layout if still active
if grep -q "/dev/sweetclocker/sysfs" /proc/mounts 2>/dev/null; then
    umount -l /dev/sweetclocker/sysfs 2>/dev/null
    log_uninstall "Released sysfs namespace mount."
fi

# 4. Clean up all temporary directory mounts and files under /dev/
rm -rf /dev/sweetclocker 2>/dev/null

# 5. Clean up temporary state and custom overrides in data
if [ -f "/data/local/tmp/.sweetclocker_io_defaults" ]; then
    log_uninstall "Reverting I/O schedulers to initial system defaults..."
    while IFS='=' read -r dev default_sched; do
        [ -z "$dev" ] || [ -z "$default_sched" ] && continue
        if [ -f "/sys/block/$dev/queue/scheduler" ]; then
            echo "$default_sched" > "/sys/block/$dev/queue/scheduler" 2>/dev/null
            log_uninstall "Reverted I/O scheduler on ${dev} to default ('${default_sched}')"
        fi
    done < "/data/local/tmp/.sweetclocker_io_defaults"
fi
if [ -f "/data/local/tmp/.sweetclocker_net_defaults" ]; then
    log_uninstall "Reverting TCP congestion control to initial system defaults..."
    default_algo=$(grep "^tcp_congestion_control=" "/data/local/tmp/.sweetclocker_net_defaults" 2>/dev/null | cut -d= -f2 | tr -d '\r')
    if [ -n "$default_algo" ] && [ -f "/proc/sys/net/ipv4/tcp_congestion_control" ]; then
        echo "$default_algo" > "/proc/sys/net/ipv4/tcp_congestion_control" 2>/dev/null
        sysctl -w net.ipv4.tcp_congestion_control="$default_algo" >/dev/null 2>&1
        log_uninstall "Reverted TCP congestion control to default ('${default_algo}')"
    fi
fi
if [ -f "/data/local/tmp/.sweetclocker_props_defaults" ]; then
    log_uninstall "Reverting system properties to initial defaults..."
    if command -v resetprop >/dev/null 2>&1 && [ -f "/data/local/tmp/.sweetclocker_props_custom" ]; then
        while IFS='=' read -r prop_key prop_val; do
            [ -z "$prop_key" ] && continue
            case "$prop_key" in \#*) continue ;; esac
            orig_val=$(grep "^\[${prop_key}\]:" "/data/local/tmp/.sweetclocker_props_defaults" 2>/dev/null | sed -e 's/^[^:]*: \[//' -e 's/\]$//')
            if [ -n "$orig_val" ]; then
                resetprop -n "$prop_key" "$orig_val" 2>/dev/null
                log_uninstall "Reverted prop '${prop_key}' to default ('${orig_val}')"
            else
                resetprop --delete "$prop_key" 2>/dev/null
                log_uninstall "Deleted custom prop '${prop_key}'"
            fi
        done < "/data/local/tmp/.sweetclocker_props_custom"
    fi
fi
rm -f /data/local/tmp/.sweetclocker_state 2>/dev/null
rm -f /data/local/tmp/.sweetclocker_custom 2>/dev/null
rm -f /data/local/tmp/.sweetclocker_io_defaults 2>/dev/null
rm -f /data/local/tmp/.sweetclocker_io_custom 2>/dev/null
rm -f /data/local/tmp/.sweetclocker_net_defaults 2>/dev/null
rm -f /data/local/tmp/.sweetclocker_net_custom 2>/dev/null
rm -f /data/local/tmp/.sweetclocker_props_defaults 2>/dev/null
rm -f /data/local/tmp/.sweetclocker_props_custom 2>/dev/null
rm -f /data/adb/modules/sweetclocker/system.prop 2>/dev/null
rm -f /data/adb/modules/SweetClocker/system.prop 2>/dev/null

# 6. Delete bypass lock overrides
rm -f /data/local/tmp/sweetclocker_force 2>/dev/null

log_uninstall "SweetClocker parameters reverted successfully."

# 7. Final log deletion
rm -f "$LOG_FILE" 2>/dev/null
