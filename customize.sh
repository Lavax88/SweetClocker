#!/system/bin/sh
# customize.sh for SweetClocker

# Clean up previous install logs, state, mounts, and old module files
ui_print "- Cleaning up old logs, state files, and mounts..."
rm -f "/data/local/tmp/sweetclocker.log" 2>/dev/null
rm -f "/data/local/tmp/.sweetclocker_state" 2>/dev/null

# Unmount any existing policy mount locks if active before removing files
for d in /sys/devices/system/cpu/cpufreq/policy*; do
    if [ -d "$d" ] && grep -q " ${d}/scaling_max_freq " /proc/mounts 2>/dev/null; then
        umount "${d}/scaling_max_freq" 2>/dev/null
    fi
done
rm -rf "/dev/sweetclocker" 2>/dev/null

# Remove the old module directory explicitly to ensure no stale files persist
rm -rf "/data/adb/modules/sweetclocker" 2>/dev/null

# Set permissions for scripts
set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/post-fs-data.sh" 0 0 0755
set_perm "$MODPATH/sweetspot-apply.sh" 0 0 0755

ui_print "- SweetClocker installation successful!"
ui_print "  Note: Frequencies will be capped to sweet-spot values at boot."
