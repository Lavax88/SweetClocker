#!/system/bin/sh
MODDIR="${0%/*}"
[ "$MODDIR" = "$0" ] && MODDIR="."

mkdir -p "$MODDIR/logs" 2>/dev/null

LOG_FILE="/data/local/tmp/sweetclocker.log"
STATE_FILE="/data/local/tmp/.sweetclocker_state"

# Truncate/rotate the log file for fresh boot and reset state
: > "$LOG_FILE" 2>/dev/null || touch "$LOG_FILE" 2>/dev/null
chmod 666 "$LOG_FILE" 2>/dev/null
rm -f "$STATE_FILE" 2>/dev/null

TS=$(date +"%Y-%m-%d %H:%M:%S")
echo "[$TS] post-fs-data.sh: boot start, log truncated" >> "$LOG_FILE"

if [ -f "$MODDIR/sweetspot-apply.sh" ]; then
    sh "$MODDIR/sweetspot-apply.sh" --init
fi
