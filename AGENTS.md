# SweetClocker Project Guidelines & Design Standards

These rules apply to all development, UI design, and build operations within the SweetClocker repository.

## 1. Material 3 Expressive UI Standards
- **Floating Action Buttons (FAB)**: Primary actions on pages and subviews (such as Add, Import, Export, Reset, Apply) must be implemented as Material 3 Speed-Dial Floating Action Buttons (`.props-fab-container` / Speed-Dial FAB) matching the rest of the app, rather than static card-header or inline buttons.
- **No Redundant Card Back Buttons**: Never place back buttons inside hero cards or content cards within a subview. Subview navigation is handled strictly by the subview top bar or navigation shell.
- **Dialogs & Bottom Sheets**:
  - All interactive dialogs and bottom sheets must follow Material 3 Expressive guidelines.
  - Action buttons must have a minimum touch target height of 44px with full pill geometry (`border-radius: var(--md-corner-full, 9999px)`).
  - Use clear visual hierarchy:
    - Primary action: `.m3e-btn-primary` (filled accent with elevation)
    - Secondary/Utility action: `.m3e-btn-tonal` (tonal surface)
    - Dismiss/Cancel: `.m3e-btn-outlined` or `.m3e-btn-text`
  - Do not use cramped 32px buttons (`.btn-small`) for sheet or dialog actions on mobile viewports.
  - On mobile, arrange dual primary actions in a balanced 2-column grid (`.m3e-export-primary-row`) with the dismiss action below, or use a flexible horizontal row.
  - When introducing button classes (e.g. `.btn-tonal`, `.btn-danger`, `.m3e-btn-*`), always verify they have explicit definitions in `src/styles/components.css`.

## 2. Windows Environment & Build Workflow
- **PowerShell Execution**: On Windows, run `npm.cmd` rather than `npm` to bypass PowerShell script execution policy restrictions on `npm.ps1`.
- **Packaging Flashable Modules**: Always compile and package via:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
  ```
- **Device Deployment**: When testing on a connected Android device, push the generated zip to `/sdcard/Download/SweetClocker-v<version>.zip` via ADB.
