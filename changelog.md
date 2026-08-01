# SweetClocker Changelog

## v1.4.0 (versionCode 123)
**New Features & Enhancements**  *   **Storage I/O Scheduler Management**     *   Added dedicated **I/O Management** tuning subview in WebUI with storage category card.     *   Implemented automatic discovery of physical storage block devices (`/sys/block/*`) and supported I/O schedulers.     *   Added Master **Enable I/O Management** switch and **Apply at Boot** persistence controls with Material 3 switch styling.     *   Integrated Material 3 bottom sheet picker dialogs for selecting per-device I/O schedulers.     *   Initial factory schedulers recorded to `/data/local/tmp/.sweetclocker_io_defaults` on first read and preserved permanently.     *   Added `Default` indicator badges inside dropdown triggers and picker popups.     *   Added one-click reset to revert storage block devices to original system defaults.  *   **Module Lifecycle & Logging**     *   Added state file cleanup in `customize.sh` on module updates or reflashes.     *   Added automatic restoration of default I/O schedulers and file cleanup in `uninstall.sh`.     *   Added timestamped logging for all I/O scheduler applications, drift checks, and reset operations in `/data/local/tmp/sweetclocker.log`.  *   **User Interface & Design**     *   Updated `#icon-io` SVG vector geometry to solid-filled 24x24 architecture matching CPU & GPU icons.     *   Filtered out non-configurable virtual block devices (`loop*`, `zram*`) from UI discovery.

## v1.3.0 (versionCode 122)

**New Features & Enhancements**

*   **User Interface (UI & WebUI)**
    *   Added an Author & Credits section.
    *   Added a Floating Action Button (FAB) for copying logs.
    *   Implemented a default browser link handler.
    *   Added a tuning categories hub.
    *   Added system font selection.
    *   Added navigation controls.

*   **System Tuning (CPU & GPU)**
    *   Set the default CPU governor to `schedutil` with VFS lock on install.
    *   Added GPU frequency tuning.
    *   Introduced an `sconfig` thermal override capability.
    *   Added a dashboard governor monitor.

**Bug Fixes & Stability Improvements**

*   **GPU Fixes**
    *   Prevented thermal throttling override.
    *   Locked power levels.
    *   Fixed reset stuck clock.

---

## v1.2.0 (versionCode 121)

**New Features & Enhancements**

*   **User Interface (WebUI & Design)**
    *   Added a Cluster Frequency Tuning section (`#page-tuning`) in WebUI with per-cluster min/max controls.
    *   Implemented custom M3 Tonal Bottom Sheet frequency picker dialogs with radio selection & M3 chip badges.
    *   Added Material 3 Floating Action Buttons (FABs) with checkmark apply and refresh reset icons.
    *   Added smooth double-rAF spring fly-in / fly-out entrance animation for FAB container.

*   **System Tuning (CPU Frequency)**
    *   Supported full hardware frequency scaling up to peak boost clocks (3.21 GHz Prime, 3.01 GHz Big, 2.02 GHz Little).
    *   Included `scaling_boost_frequencies` in sysfs discovery to unlock true overclock/boost steps (3.206 GHz).
    *   Updated Little core minimum frequency default to 365 MHz (364.8 MHz / 364800 kHz).

*   **Documentation & General**
    *   Updated module description to 'A barebones kernel manager module made with love'.
    *   Cleaned up `README.md` with concise feature list and benchmark sweet spot reference table.

**Bug Fixes & Stability Improvements**

*   **Scripts & Monitoring Compatibility**
    *   Locked scaling & `cpuinfo` max/min freq paths across policy & per-cpu nodes for third-party monitoring apps.
    *   Renamed MID to BIG.

---

## v1.2.0 (versionCode 120)

*   Added Cluster Frequency Tuning section (`#page-tuning`) in WebUI with per-cluster min/max controls.
*   Supported full hardware frequency scaling up to peak boost clocks (3.21 GHz Prime, 3.01 GHz Big, 2.02 GHz Little).
*   Included `scaling_boost_frequencies` in sysfs discovery to unlock true overclock/boost steps (3.206 GHz).
*   Implemented custom M3 Tonal Bottom Sheet frequency picker dialogs with radio selection & M3 chip badges.
*   Added Material 3 Floating Action Buttons (FABs) with checkmark apply and refresh reset icons.
*   Added smooth double-rAF spring fly-in / fly-out entrance animation for FAB container.
*   Updated Little core minimum frequency default to 365 MHz (364.8 MHz / 364800 kHz).
*   Updated module description to 'A barebones kernel manager module made with love'.

---

## v1.0.0 (versionCode 1)

*   Initial release.
*   Hardware-locked CPU sweet spot caps (1286 MHz / 1920 MHz / 2515 MHz).
*   Isolated sysfs monitoring to prevent namespace-based daemon overrides.
*   Real-time WebUI dashboard with CPU/GPU telemetry, logs, and Monet theme engine.
