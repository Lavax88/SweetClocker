<div align="center">

# ⚡ SweetClocker

**Next-gen performance and battery optimizer for Snapdragon 8s Gen 4 (POCO F7 / Redmi Turbo 4)**

[![KernelSU Compatible](https://img.shields.io/badge/KernelSU-Next%20%7C%20Classic-10B981?style=for-the-badge&logo=android&logoColor=white)](https://github.com/tiann/KernelSU)
[![APatch Compatible](https://img.shields.io/badge/APatch-Supported-6366F1?style=for-the-badge&logo=android&logoColor=white)](https://github.com/bmax121/APatch)
[![Magisk Compatible](https://img.shields.io/badge/Magisk-Supported-00B4D8?style=for-the-badge&logo=magisk&logoColor=white)](https://github.com/topjohnwu/Magisk)
[![License](https://img.shields.io/badge/License-MIT-F59E0B?style=for-the-badge)](LICENSE)

*SweetClocker keeps your device running cool and smooth by capping CPU and GPU frequencies at their most efficient sweet spots, or allowing full custom cluster and governor tuning.*

</div>

---

## Key Features

- **Precision Sweet-Spot Capping**: Automatically locks CPU clusters at benchmarked efficiency sweet spots right from early boot (`post-fs-data`).
- **Custom Cluster & GPU Frequency Tuning**: Set custom min/max frequency limits and governors per CPU cluster (CPUs 0-1, 2-4, 5-6, 7) up to **3.21 GHz** on Prime, **3.01 GHz** on Big, as well as full GPU min/max frequency and governor configuration.
- **I/O Scheduler Management**: Configure storage block device I/O schedulers (`/sys/block/*`) with boot persistence, automatic factory defaults protection, and Material 3 picker dialogs.
- **One-Tap Sweetclock Reset**: Quickly revert back to predefined efficiency sweet spots with a single tap of the floating action button.
- **Daemon-Lock VFS Protection**: Applies VFS bind-mount locks on real `/sys` node paths for both CPU and GPU to prevent thermal daemons and PowerHAL from overriding settings, while allowing third-party monitoring apps (CPU-Z, DevCheck) to accurately read modified clocks.
- **Material 3 Expressive WebUI**: Embedded dashboard featuring Snapdragon design aesthetics, dynamic Monet color sync, category subviews, interactive M3 bottom sheets, and glassmorphic styling.
- **Real-Time Telemetry & Logs**: Track live per-core CPU frequencies, GPU load/thermals, and system logs with automatic 24-hour log rotation.

---

## Benchmark Sweet Spots

Discovered and benchmarked by **[iRedDragonICY](https://github.com/iRedDragonICY)** for peak efficiency vs. power draw:

| Cluster | Assigned Cores | Sweet Spot Max | Max Available HW Boost |
| :--- | :---: | :---: | :---: |
| **LITTLE** | `cpu0, cpu1` | **1286.4 MHz** | **2016.0 MHz** (2.02 GHz) |
| **BIG 1** | `cpu2 – cpu4` | **1920.0 MHz** | **3014.4 MHz** (3.01 GHz) |
| **BIG 2** | `cpu5, cpu6` | **1920.0 MHz** | **2803.2 MHz** (2.80 GHz) |
| **PRIME** | `cpu7` | **2515.2 MHz** | **3206.4 MHz** (3.21 GHz) |

---

## Installation & Usage

1. Download **SweetClocker** from [Releases](../../releases).
2. Install via **KernelSU Next**, **KernelSU Classic**, **APatch**, or **Magisk**.
3. Reboot your device.
4. Open the **SweetClocker** WebUI card inside KernelSU / APatch / MMRL to monitor thermals or customize cluster and GPU frequencies.

---

## Building from Source

The WebUI is written in strict TypeScript and bundled with Vite (no UI framework).

### Prerequisites
- Node.js 20+ / 22 LTS
- `npm` and `zip` (or `bsdtar` on Windows)

### Build Commands
```bash
# Install dependencies
npm ci

# Run local development server with mock telemetry
npm run dev

# Run strict TypeScript typecheck
npm run typecheck

# Build WebUI production bundle to webroot/
npm run build

# Package flashable module zip (SweetClocker-<version>.zip)
# On Linux / macOS / WSL:
./build.sh

# On Windows:
./build.bat
```

---

## AI Disclosure & Hardware Verification

This project is built using modern **vibe coding** workflows — combining developer direction and architectural design with agentic AI pair programming (Claude & Gemini). While scaffolding, refactoring, and UI enhancements were accelerated through AI assistance, **every single feature, kernel interface, VFS lock mechanism, frequency profile, and UI interaction has been directly tested, verified, and validated on real physical hardware** (POCO F7 / Redmi Turbo 4, Snapdragon 8s Gen 4 / SM8735).

Real-world stability, thermal behavior, power efficiency, and gesture fidelity were verified directly on-device.

---

## Credits & Third-Party Acknowledgements

SweetClocker builds upon foundational tools, research, and design systems from the open-source community:

- **[iRedDragonICY](https://github.com/iRedDragonICY)** — Benchmark research, voltage/power curve testing, and discovery of target OPP sweet spots across Snapdragon 8s Gen 4 clusters.
- **[KernelSU](https://github.com/tiann/KernelSU) & [KernelSU Next](https://github.com/rifsxd/KernelSU-Next)** — Kernel-based root solution, module packaging system, and internal WebUI bridge APIs.
- **[APatch](https://github.com/bmax121/APatch) & [Magisk](https://github.com/topjohnwu/Magisk)** — Root environments, installer frameworks, and module compatibility standards.
- **[MMRL](https://github.com/DerGoogler/MMRL)** — Modern Android root module manager and WebUI host.
- **Google Material Design 3** — Expressive Material You tokens, Monet dynamic color extraction principles, and component design patterns.
- **Outfit & Inter Typefaces** — Typography designed by Outfit Type Foundry and Rasmus Andersson, bundled offline under SIL Open Font License.
- **Vite & TypeScript** — Frontend tooling and compiler toolchain powering frameworkless WebUI performance.

---

<div align="center">
  <sub>Built with care for Snapdragon 8s Gen 4 enthusiasts.</sub>
</div>
