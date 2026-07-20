<div align="center">

# ⚡ SweetClocker

**Next-gen performance and battery optimizer for Snapdragon 8s Gen 4 (POCO F7 / Redmi Turbo 4) devices**

[![KernelSU Compatible](https://img.shields.io/badge/KernelSU-Next%20%7C%20Classic-10B981?style=for-the-badge&logo=android&logoColor=white)](https://github.com/tiann/KernelSU)
[![APatch Compatible](https://img.shields.io/badge/APatch-Supported-6366F1?style=for-the-badge&logo=android&logoColor=white)](https://github.com/bmax121/APatch)
[![Magisk Compatible](https://img.shields.io/badge/Magisk-Supported-00B4D8?style=for-the-badge&logo=magisk&logoColor=white)](https://github.com/topjohnwu/Magisk)
[![License](https://img.shields.io/badge/License-MIT-F59E0B?style=for-the-badge)](LICENSE)

*SweetClocker is a lightweight performance and battery optimizer designed specifically for Snapdragon 8s Gen 4 devices like the POCO F7. It keeps your device running cool and smooth by capping CPU frequencies at their most efficient sweet spots, preventing overheating and battery drain during heavy gaming or daily use.*

</div>

---

## Credits & Acknowledgements

> [!IMPORTANT]
> **All credit for discovering, benchmarking, and testing the exact hardware frequency sweet spots goes to [iRedDragonICY](https://github.com/iRedDragonICY).**  
> **iRedDragonICY** conducted deep-dive efficiency, voltage curve, and power-draw analysis across every Snapdragon 8s Gen 4 cluster. They identified the exact OPP (Operating Performance Point) thresholds where performance gains plateau while power consumption and heat generation skyrocket. Without their rigorous testing and community contributions, this module would not exist.

---

## Key Features

### Precision Sweet-Spot Capping
Enforces exact hardware-aligned `scaling_max_freq` boundaries on every CPU cluster right from early boot (`post-fs-data`). It strictly manages upper scaling limits without altering minimum frequencies, governors, or stock voltage tables—preserving natural idle efficiency and responsiveness.

### Namespace-Immune Enforcement
Standard root bind-mounts are easily bypassed by Android system daemons (`thermal-engine`, `powerhal`, `mpdecision`) running inside private mount namespaces spawned by `init`. SweetClocker mounts an isolated secondary instance of `sysfs` to `/dev/sweetclocker/sysfs`, allowing its daemon to detect and revert hardware-level frequency overrides in real time.

### WebUI Dashboard
Access an interactive, edge-to-edge WebUI dashboard directly from inside **KernelSU Next**, **APatch**, or **MMRL**:
- **Real-Time Telemetry:** Live per-core CPU usage, frequencies, and temperature tracking.
- **GPU Metrics:** Dedicated GPU frequency, load, and thermal readouts.
- **Dynamic Theme Sync:** Seamless Android 12+ Monet / Material You color scheme syncing with dark and light modes.
- **Live Logs:** Built-in log viewer with automatic 24-hour log rotation to keep your filesystem clean.

---

## Target Sweet-Spot Configuration

These exact hardware OPP thresholds have been benchmarked by **[iRedDragonICY](https://github.com/iRedDragonICY)** to deliver the optimal balance of sustained performance and battery life:

| Cluster | Assigned Cores | Target Max Frequency | Exact OPP (`sysfs` Value) | Policy Paths |
| :--- | :---: | :---: | :---: | :--- |
| **LITTLE** *(Efficiency)* | `cpu0, cpu1` | **1286.4 MHz** | `1286400` | `/sys/devices/system/cpu/cpufreq/policy0` |
| **MID** *(Performance)* | `cpu2 – cpu6` | **1920.0 MHz** | `1920000` | `/sys/devices/system/cpu/cpufreq/policy2`<br>`/sys/devices/system/cpu/cpufreq/policy5` |
| **PRIME** *(Ultra)* | `cpu7` | **2515.2 MHz** | `2515200` | `/sys/devices/system/cpu/cpufreq/policy7` |

---

## How It Works (Under the Hood)

When you launch games or switch applications, Android's system daemons and hardware abstraction layers (HALs) aggressively write to `scaling_max_freq` to boost performance. 

Because these daemons are spawned directly by `init` inside **isolated private mount namespaces**, standard root bind-mount overlays applied in the shared namespace do not propagate to them. Furthermore, traditional monitoring scripts get blinded because reading from the standard `/sys/devices/system/cpu/...` path returns the locked overlay value, hiding the true hardware frequency drift underneath.

### The SweetClocker Solution
1. **Secondary `sysfs` Mount:** During boot, the module mounts a fresh, clean instance of `sysfs` to `/dev/sweetclocker/sysfs`. This alternative path bypasses all shared namespace bind-mount overlays.
2. **Dual-Path Inspection:** Our background daemon fast-polls (`service.sh`) the true underlying hardware state directly from `/dev/sweetclocker/sysfs/...`.
3. **Instant Remediation:** If a system daemon in a private namespace overwrites the hardware limit, SweetClocker instantly detects the drift and forces the hardware value back to the assigned sweet spot.
4. **Automatic Maintenance:** To ensure zero storage bloat, the service automatically rotates and clears the diagnostics log (`/data/local/tmp/sweetclocker.log`) every 24 hours.

---

## Module Directory Structure

Everything required for the module to function cleanly lives directly in the root directory:

```text
SweetClocker/
├── module.prop          # Module metadata & version info for root managers
├── post-fs-data.sh      # Early-boot initialization & initial frequency capping
├── service.sh           # Background enforcer loop with adaptive polling & 24h log rotation
├── sweetspot-apply.sh   # Core shared engine: dual-path mounts, OPP checks & namespace locks
└── webroot/             # Interactive Material You WebUI dashboard (HTML, CSS, JS)
```

---

## Installation & Usage

### 1. Installation
1. Download the latest `SweetClocker-*.zip` release from the [Releases page](../../releases).
2. Open your root manager of choice (**KernelSU Next**, **KernelSU Classic**, **APatch**, or **Magisk**).
3. Navigate to the **Modules** tab and select **Install from storage**.
4. Choose the downloaded zip and reboot your device once installation completes.

### 2. Accessing the WebUI Dashboard
- **KernelSU Next / APatch / MMRL:** Tap on the **SweetClocker** card inside the modules list to open the embedded, real-time dashboard.
- Check live CPU/GPU thermals, verify that sweet-spot caps are active (`1286 MHz / 1920 MHz / 2515 MHz`), and inspect system logs directly from the UI.

---

## Verification & Debugging Commands

You can manually verify that the frequency limits are locked at the hardware level using terminal or `adb shell`:

### Check Active Hardware Limits
```bash
adb shell cat /sys/devices/system/cpu/cpufreq/policy0/scaling_max_freq
adb shell cat /sys/devices/system/cpu/cpufreq/policy2/scaling_max_freq
adb shell cat /sys/devices/system/cpu/cpufreq/policy5/scaling_max_freq
adb shell cat /sys/devices/system/cpu/cpufreq/policy7/scaling_max_freq
```

### Check Live Diagnostic Logs
```bash
adb shell cat /data/local/tmp/sweetclocker.log
```

---

<div align="center">
  <sub>Built with care for Snapdragon 8s Gen 4 enthusiasts.</sub>
</div>
