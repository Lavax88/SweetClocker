#!/system/bin/sh
# customize.sh for SweetClocker

# Clean up previous install logs, state, mounts, and old module files
ui_print "- Cleaning up old logs, state files, and mounts..."
rm -f "/data/local/tmp/sweetclocker.log" 2>/dev/null
rm -f "/data/local/tmp/.sweetclocker_state" 2>/dev/null
rm -f "/data/local/tmp/.sweetclocker_custom" 2>/dev/null
rm -f "/data/local/tmp/.sweetclocker_io_defaults" 2>/dev/null
rm -f "/data/local/tmp/.sweetclocker_io_custom" 2>/dev/null

# Unmount any existing policy mount locks if active before removing files
for mount_point in $(grep "sweetclocker" /proc/mounts 2>/dev/null | awk '{print $2}'); do
    umount -l "$mount_point" 2>/dev/null
done
rm -rf "/dev/sweetclocker" 2>/dev/null

# Remove the old module directory explicitly to ensure no stale files persist
rm -rf "/data/adb/modules/sweetclocker" 2>/dev/null

# Set permissions for scripts
set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/post-fs-data.sh" 0 0 0755
set_perm "$MODPATH/sweetspot-apply.sh" 0 0 0755

ui_print "- Sweetspot frequency caps applied across all clusters."
ui_print "- Governor set to schedutil, performance daemons locked out."

# Set default schedutil governor, sweetspot caps, and VFS locks at install time
if [ -f "$MODPATH/sweetspot-apply.sh" ]; then
    sh "$MODPATH/sweetspot-apply.sh" --init
fi

ui_print "- SweetClocker installation complete!"
