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
PID_FILE="/dev/.sweetclocker_service.pid"

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

stop_existing_service() {
    if [ -f "$PID_FILE" ]; then
        old_pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$old_pid" ] && [ "$old_pid" != "$$" ] && kill -0 "$old_pid" 2>/dev/null; then
            cmdline=$(tr '\0' ' ' < "/proc/$old_pid/cmdline" 2>/dev/null)
            case "$cmdline" in
                *service.sh*)
                    kill -TERM "$old_pid" 2>/dev/null
                    wait_i=0
                    while [ "$wait_i" -lt 20 ]; do
                        kill -0 "$old_pid" 2>/dev/null || break
                        sleep 0.1
                        wait_i=$((wait_i + 1))
                    done
                    if kill -0 "$old_pid" 2>/dev/null; then
                        kill -KILL "$old_pid" 2>/dev/null
                    fi
                    ;;
            esac
        fi
        rm -f "$PID_FILE" 2>/dev/null
    else
        # Fallback for upgrades from older versions without a PID file
        pkill -f "sweetclocker/sweetspot-apply.sh" 2>/dev/null
        pkill -f "sweetclocker/service.sh" 2>/dev/null
        sleep 0.5
    fi
}

stop_existing_service

# Live-load system.prop without requiring a reboot
if [ -f "$MODDIR/system.prop" ] && command -v resetprop >/dev/null 2>&1; then
    resetprop --file "$MODDIR/system.prop" 2>/dev/null
    log_msg "hotinstall.sh: loaded system.prop via resetprop --file"
fi

# Re-apply sweetspot frequency caps and locks
if [ -f "$MODDIR/sweetspot-apply.sh" ]; then
    chmod 755 "$MODDIR/sweetspot-apply.sh" "$MODDIR/service.sh" "$MODDIR/telemetry.sh" 2>/dev/null
    sh "$MODDIR/sweetspot-apply.sh" --init
fi

# Spawn fresh background service.sh detached in a new session with standard FDs redirected
if [ -f "$MODDIR/service.sh" ]; then
    if command -v setsid >/dev/null 2>&1; then
        setsid sh "$MODDIR/service.sh" </dev/null >/dev/null 2>&1 &
    else
        nohup sh "$MODDIR/service.sh" </dev/null >/dev/null 2>&1 &
    fi
    log_msg "hotinstall.sh: service.sh spawned in background (PID $!)"
fi

log_msg "hotinstall.sh: hot install completed successfully without reboot"
echo "- SweetClocker hot-installed: background service reloaded without reboot!"
