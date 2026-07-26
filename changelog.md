# SweetClocker Changelog

## v1.1.0 (versionCode 121)

### feat: add custom cluster frequency tuning and Material 3 WebUI controls (a459010)
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


## v1.0.0 (versionCode 1)
- Initial release.
- Hardware-locked CPU sweet spot caps (1286 MHz / 1920 MHz / 2515 MHz).
- Isolated sysfs monitoring to prevent namespace-based daemon overrides.
- Real-time WebUI dashboard with CPU/GPU telemetry, logs, and Monet theme engine.
