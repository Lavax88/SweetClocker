#!/system/bin/sh
# SweetClocker Hot Install Script
# Executed immediately upon installation in KernelSU / APatch / Magisk without reboot

MODDIR="${0%/*}"
[ "$MODDIR" = "$0" ] && MODDIR="."

LOG_FILE="/data/local/tmp/sweetclocker.log"

log_msg() {
    if [ ! -f "$LOG_FILE" ]; then
        touch "$LOG_FILE" 2>/dev/null
        chmod 666 "$LOG_FILE" 2>/dev/null
    fi
    TS=$(date +"%Y-%m-%d %H:%M:%S")
    echo "[$TS] $*" >> "$LOG_FILE"
}

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
