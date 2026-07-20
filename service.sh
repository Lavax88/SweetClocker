#!/system/bin/sh
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

# Wait for boot completed before starting polling loop
until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 1
done

# Verify SoC before starting background polling loops
if ! sh "$MODDIR/sweetspot-apply.sh" --check-soc; then
    log_msg "service.sh: Aborting polling loop — incompatible device (not Snapdragon 8s Gen 4 / SM8735)."
    exit 1
fi

log_msg "service.sh: loop started, fast-poll phase (5s interval, 3min)"

fast_check=1
while [ "$fast_check" -le 36 ]; do
    sleep 5
    sh "$MODDIR/sweetspot-apply.sh" --check "$fast_check"
    fast_check=$((fast_check + 1))
done

log_msg "service.sh: switching to slow-poll (60s interval)"

slow_check=1
while true; do
    sleep 60
    
    # Auto-clear log file every 24 hours (1440 checks * 60s)
    if [ $((slow_check % 1440)) -eq 0 ]; then
        rm -f "$LOG_FILE"
        log_msg "service.sh: log file cleared automatically (24-hour retention policy)"
    fi

    sh "$MODDIR/sweetspot-apply.sh" --check-slow "$slow_check"
    slow_check=$((slow_check + 1))
done
