#!/system/bin/sh
# SweetClocker Hot Install Script
# Executed immediately upon installation in KernelSU / APatch / Magisk without reboot

MODDIR="${0%/*}"
[ "$MODDIR" = "$0" ] && MODDIR="."

# Redirect away from transient staging directories (e.g. /data/adb/modules_update)
case "$MODDIR" in
    *modules_update*)
        if [ -d "/data/adb/modules/sweetclocker" ]; then
            MODDIR="/data/adb/modules/sweetclocker"
        fi
        ;;
esac

if [ ! -f "$MODDIR/sweetspot-apply.sh" ] && [ -f "/data/adb/modules/sweetclocker/sweetspot-apply.sh" ]; then
    MODDIR="/data/adb/modules/sweetclocker"
fi

LOG_FILE="/data/local/tmp/sweetclocker.log"

log_msg() {
    if [ ! -f "$LOG_FILE" ]; then
        touch "$LOG_FILE" 2>/dev/null
        chmod 666 "$LOG_FILE" 2>/dev/null
    fi
    TS=$(date +"%Y-%m-%d %H:%M:%S")
    echo "[$TS] $*" >> "$LOG_FILE"
}

LOCK_FILE="/dev/.sweetclocker_hotinstall.lock"

# Prevent duplicate or concurrent rapid hot-installs within 5 seconds
if [ -f "$LOCK_FILE" ]; then
    lock_ts=$(cat "$LOCK_FILE" 2>/dev/null)
    now=$(date +%s)
    if [ -n "$lock_ts" ] && [ $((now - lock_ts)) -lt 5 ]; then
        log_msg "hotinstall.sh: Hot-install already executed <5s ago, skipping duplicate trigger."
        exit 0
    fi
fi
date +%s > "$LOCK_FILE" 2>/dev/null

log_msg "hotinstall.sh: module hot-installed, reloading runtime..."

# Terminate any previously running SweetClocker background monitoring loops
pkill -f "sweetspot-apply.sh" 2>/dev/null
pkill -f "service.sh" 2>/dev/null
sleep 0.5

# Re-apply sweetspot frequency caps and locks
if [ -f "$MODDIR/sweetspot-apply.sh" ]; then
    chmod 755 "$MODDIR/sweetspot-apply.sh" "$MODDIR/service.sh" "$MODDIR/telemetry.sh" 2>/dev/null
    sh "$MODDIR/sweetspot-apply.sh" --init
fi

# Spawn fresh background service.sh in the background
if [ -f "$MODDIR/service.sh" ]; then
    nohup sh "$MODDIR/service.sh" >/dev/null 2>&1 &
    log_msg "hotinstall.sh: service.sh spawned in background (PID $!)"
fi

log_msg "hotinstall.sh: hot install completed successfully without reboot"
echo "- SweetClocker hot-installed: background service reloaded without reboot!"
