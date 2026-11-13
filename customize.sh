#!/system/bin/sh
# customize.sh for SweetClocker

# Request KernelSU/SukiSU Hot Install (no reboot required)
export MODULE_HOT_INSTALL_REQUEST=true
export MODULE_HOT_RUN_SCRIPT="hotinstall.sh"

STATE_DIR="/data/local/tmp"
CUSTOM_CPU="$STATE_DIR/.sweetclocker_custom"
CUSTOM_IO="$STATE_DIR/.sweetclocker_io_custom"
CUSTOM_NET="$STATE_DIR/.sweetclocker_net_custom"

# Volume Key Selector: Check if existing custom settings are present
if [ -f "$CUSTOM_CPU" ] || [ -f "$CUSTOM_IO" ] || [ -f "$CUSTOM_NET" ]; then
    ui_print " "
    ui_print "=========================================="
    ui_print " Existing custom settings detected!"
    ui_print " Choose an option within 5 seconds:"
    ui_print "   Vol UP (+)   = KEEP custom settings (Default)"
    ui_print "   Vol DOWN (-) = RESET to sweetspot defaults"
    ui_print "=========================================="
    ui_print " "

    tmp_event="/dev/.sc_key_$$"
    rm -f "$tmp_event" 2>/dev/null
    (getevent -l 2>/dev/null > "$tmp_event") &
    getevent_pid=$!

    start_time=$(date +%s)
    chosen_action="keep"

    while true; do
        now=$(date +%s)
        if [ $((now - start_time)) -ge 5 ]; then
            chosen_action="keep"
            break
        fi

        if [ -s "$tmp_event" ]; then
            if grep -q "KEY_VOLUMEUP.*DOWN" "$tmp_event" 2>/dev/null || grep -q "0073.*00000001" "$tmp_event" 2>/dev/null; then
                chosen_action="keep"
                break
            elif grep -q "KEY_VOLUMEDOWN.*DOWN" "$tmp_event" 2>/dev/null || grep -q "0072.*00000001" "$tmp_event" 2>/dev/null; then
                chosen_action="reset"
                break
            fi
        fi
        sleep 0.1
    done

    kill -9 $getevent_pid 2>/dev/null
    rm -f "$tmp_event" 2>/dev/null

    if [ "$chosen_action" = "reset" ]; then
        ui_print "- Resetting custom settings to SweetClocker sweetspots..."
        rm -f "$CUSTOM_CPU" "$CUSTOM_IO" "$CUSTOM_NET" 2>/dev/null
    else
        ui_print "- Keeping your current custom configuration."
    fi
else
    ui_print "- Clean install: sweetspot defaults will be applied."
fi

# Clean up logs, state, mounts, and lock files
ui_print "- Cleaning up old logs, state files, and mounts..."
rm -f "/data/local/tmp/sweetclocker.log" 2>/dev/null
rm -f "/data/local/tmp/.sweetclocker_state" 2>/dev/null
rm -f "/data/local/tmp/.sweetclocker_io_defaults" 2>/dev/null
rm -f "/data/local/tmp/.sweetclocker_net_defaults" 2>/dev/null

# Unmount any existing policy mount locks if active before updating files
for mount_point in $(grep "sweetclocker" /proc/mounts 2>/dev/null | awk '{print $2}'); do
    umount -l "$mount_point" 2>/dev/null
done
rm -rf "/dev/sweetclocker" "/dev/.sweetclocker_hotinstall.lock" 2>/dev/null

# Set permissions for scripts and webroot
set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/post-fs-data.sh" 0 0 0755
set_perm "$MODPATH/sweetspot-apply.sh" 0 0 0755
set_perm "$MODPATH/telemetry.sh" 0 0 0755
set_perm "$MODPATH/hotinstall.sh" 0 0 0755
set_perm "$MODPATH/uninstall.sh" 0 0 0755
set_perm_recursive "$MODPATH/webroot" 0 0 0755 0644

# Universal Live-Sync Fallback for APatch / SukiSU / Magisk:
TARGET_MOD="/data/adb/modules/sweetclocker"
if [ "$MODPATH" != "$TARGET_MOD" ] && [ -d "/data/adb/modules" ]; then
    ui_print "- Syncing module files to live path for no-reboot support..."
    mkdir -p "$TARGET_MOD" 2>/dev/null
    cp -af "$MODPATH"/* "$TARGET_MOD"/ 2>/dev/null
    set_perm_recursive "$TARGET_MOD" 0 0 0755 0644
    set_perm "$TARGET_MOD/service.sh" 0 0 0755
    set_perm "$TARGET_MOD/post-fs-data.sh" 0 0 0755
    set_perm "$TARGET_MOD/sweetspot-apply.sh" 0 0 0755
    set_perm "$TARGET_MOD/telemetry.sh" 0 0 0755
    set_perm "$TARGET_MOD/hotinstall.sh" 0 0 0755
    set_perm "$TARGET_MOD/uninstall.sh" 0 0 0755
fi

# Execute hotinstall immediately (restarts background daemon and applies clocks)
if [ -f "$MODPATH/hotinstall.sh" ]; then
    sh "$MODPATH/hotinstall.sh"
elif [ -f "$TARGET_MOD/hotinstall.sh" ]; then
    sh "$TARGET_MOD/hotinstall.sh"
fi

ui_print "- SweetClocker installation complete!"
