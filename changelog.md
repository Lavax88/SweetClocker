# SweetClocker Changelog

## v1.3.0 (versionCode 122)

### feat(ui): add Author & Credits section, copy log FAB, and default browser link handler (00f7bfd)


### fix(gpu): prevent thermal throttling override, lock power levels, and fix reset stuck clock (6cdb2d2)


### feat(cpu): set default CPU governor to schedutil with VFS lock on install (4c7854f)


### feat(gpu): add GPU frequency tuning, sconfig thermal override, and dashboard governor monitor (3d1fa11)


### feat(webui): add tuning categories hub, system font selection, and navigation controls (e77b2c7)


## v1.2.0 (versionCode 121)

### feat: add custom cluster frequency tuning and Material 3 WebUI controls (bdd97e4)
- Add Cluster Frequency Tuning section (#page-tuning) in WebUI with per-cluster min/max controls.
- Support full hardware frequency scaling up to peak boost clocks (3.21 GHz Prime, 3.01 GHz Big, 2.02 GHz Little).
- Include scaling_boost_frequencies in sysfs discovery to unlock true overclock/boost steps (3.206 GHz).
- Implement custom M3 Tonal Bottom Sheet frequency picker dialogs with radio selection & M3 chip badges.
- Add Material 3 Floating Action Buttons (FABs) with checkmark apply and refresh reset icons.
- Add smooth double-rAF spring fly-in / fly-out entrance animation for FAB container.
- Update Little core minimum frequency default to 365 MHz (364.8 MHz / 364800 kHz).
- Update module description to 'A barebones kernel manager module made with love'.
- Clean up README.md with concise feature list and benchmark sweet spot reference table.


### fix(script): lock scaling & cpuinfo max/min freq paths across policy & per-cpu nodes for third-party monitoring apps; rename MID to BIG (ac0705c)


## v1.2.0 (versionCode 120)
- Add Cluster Frequency Tuning section (#page-tuning) in WebUI with per-cluster min/max controls.
- Support full hardware frequency scaling up to peak boost clocks (3.21 GHz Prime, 3.01 GHz Big, 2.02 GHz Little).
- Include scaling_boost_frequencies in sysfs discovery to unlock true overclock/boost steps (3.206 GHz).
- Implement custom M3 Tonal Bottom Sheet frequency picker dialogs with radio selection & M3 chip badges.
- Add Material 3 Floating Action Buttons (FABs) with checkmark apply and refresh reset icons.
- Add smooth double-rAF spring fly-in / fly-out entrance animation for FAB container.
- Update Little core minimum frequency default to 365 MHz (364.8 MHz / 364800 kHz).
- Update module description to 'A barebones kernel manager module made with love'.

## v1.0.0 (versionCode 1)
- Initial release.
- Hardware-locked CPU sweet spot caps (1286 MHz / 1920 MHz / 2515 MHz).
- Isolated sysfs monitoring to prevent namespace-based daemon overrides.
- Real-time WebUI dashboard with CPU/GPU telemetry, logs, and Monet theme engine.
