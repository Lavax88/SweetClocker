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

# 5. Clean up temporary state and bypass toggle files in data
rm -f /data/local/tmp/.sweetclocker_state 2>/dev/null

# 6. Delete bypass lock overrides
rm -f /data/local/tmp/sweetclocker_force 2>/dev/null

log_uninstall "SweetClocker parameters reverted successfully."

# 7. Final log deletion
rm -f "$LOG_FILE" 2>/dev/null
