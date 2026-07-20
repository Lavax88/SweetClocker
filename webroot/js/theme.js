/* theme.js - Monet Dynamic Color & Light/Dark Mode Manager (Classic Script version) */
(function() {
  let activeThemeMode = 'dark';
  let activeSeedColor = '#6750A4'; // default M3 purple
  let isMonetActive = false;

  /**
   * Convert Hex Color String (#RRGGBB) to HSL
   * @param {string} hex 
   * @returns {{h: number, s: number, l: number}}
   */
  function hexToHsl(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    
    let r = parseInt(hex.substring(0, 2), 16) / 255;
    let g = parseInt(hex.substring(2, 4), 16) / 255;
    let b = parseInt(hex.substring(4, 6), 16) / 255;
    
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
      h = s = 0; // achromatic
    } else {
      let d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  /**
   * Convert HSL Color values to Hex Color String
   */
  function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  function applyThemeColor(colorHex) {
    try {
      const { h, s } = hexToHsl(colorHex);
      const root = document.documentElement;
      
      root.style.setProperty('--theme-h', h);
      root.style.setProperty('--theme-s', `${s}%`);
      
      // Calculate background color dynamically to match the active mode
      const isLight = activeThemeMode === 'light';
      
      // Calculate each M3 color dynamically to override host CSS variable injections
      const primaryHex = hslToHex(h, s, isLight ? 40 : 80);
      const onPrimaryHex = isLight ? '#ffffff' : hslToHex(h, s, 20);
      const primaryContainerHex = hslToHex(h, s, isLight ? 90 : 30);
      const onPrimaryContainerHex = hslToHex(h, s, isLight ? 10 : 90);
      
      const secondaryHex = hslToHex(h, 15, isLight ? 40 : 80);
      const onSecondaryHex = isLight ? '#ffffff' : hslToHex(h, 15, 20);
      const secondaryContainerHex = hslToHex(h, 15, isLight ? 90 : 30);
      const onSecondaryContainerHex = hslToHex(h, 15, isLight ? 90 : 90);
      
      const bgHex = hslToHex(h, 12, isLight ? 96 : 10);
      const onBgHex = hslToHex(h, 10, isLight ? 10 : 90);
      
      const surfaceHex = hslToHex(h, 10, isLight ? 92 : 13);
      const onSurfaceHex = hslToHex(h, 8, isLight ? 10 : 90);
      const surfaceVarHex = hslToHex(h, 10, isLight ? 86 : 20);
      const onSurfaceVarHex = hslToHex(h, 8, isLight ? 30 : 80);
      
      const outlineHex = hslToHex(h, 8, isLight ? 50 : 45);
      const outlineVarHex = hslToHex(h, 8, isLight ? 80 : 30);

      // Set directly as elements style properties to override global injected variables
      root.style.setProperty('--theme-color-primary', primaryHex);
      root.style.setProperty('--theme-color-on-primary', onPrimaryHex);
      root.style.setProperty('--theme-color-primary-container', primaryContainerHex);
      root.style.setProperty('--theme-color-on-primary-container', onPrimaryContainerHex);
      
      root.style.setProperty('--theme-color-secondary', secondaryHex);
      root.style.setProperty('--theme-color-on-secondary', onSecondaryHex);
      root.style.setProperty('--theme-color-secondary-container', secondaryContainerHex);
      root.style.setProperty('--theme-color-on-secondary-container', onSecondaryContainerHex);
      
      root.style.setProperty('--theme-color-background', bgHex);
      root.style.setProperty('--theme-color-on-background', onBgHex);
      
      root.style.setProperty('--theme-color-surface', surfaceHex);
      root.style.setProperty('--theme-color-on-surface', onSurfaceHex);
      root.style.setProperty('--theme-color-surface-variant', surfaceVarHex);
      root.style.setProperty('--theme-color-on-surface-variant', onSurfaceVarHex);
      
      root.style.setProperty('--theme-color-outline', outlineHex);
      root.style.setProperty('--theme-color-outline-variant', outlineVarHex);
      
      // Set the html and body background directly
      document.documentElement.style.backgroundColor = bgHex;
      document.body.style.backgroundColor = bgHex;
      
      // Update the theme-color meta tag (used by some Android versions for status bar)
      const metaTheme = document.getElementById("meta-theme-color");
      if (metaTheme) {
        metaTheme.setAttribute("content", bgHex);
      }
      
      activeSeedColor = colorHex;
    } catch (e) {
      console.error("Failed to parse hex color:", colorHex, e);
    }
  }

  /**
   * Detect Android Monet color from system properties/settings
   * Supports standard AOSP Monet overlays, Xiaomi HyperOS/MIUI accent color properties, and custom ROM keys
   */
  /**
   * Helper to parse dynamic values (hex strings or 32-bit signed integers) to clean hex colors
   */
  function parseToHex(val) {
    if (!val || val === "null" || !val.trim()) return null;
    val = val.trim();
    
    if (val.match(/^#[A-Fa-f0-9]{6}$/)) return val;
    if (val.match(/^[A-Fa-f0-9]{6}$/)) return "#" + val;
    
    if (val.match(/^-?[0-9]+$/)) {
      const num = parseInt(val, 10);
      const u = num >>> 0;
      const r = (u >> 16) & 255;
      const g = (u >> 8) & 255;
      const b = u & 255;
      return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    }
    
    return null;
  }

  /**
   * Detect Android Monet color from system properties/settings
   * Supports standard AOSP Monet overlays, Xiaomi HyperOS/MIUI accent color properties, and custom ROM keys
   */
  /**
   * Detect Android Monet color from system properties/settings
   * Supports standard AOSP Monet overlays, Xiaomi HyperOS/MIUI accent color properties, custom ROM keys, and direct overlay resources lookup.
   */
  async function detectMonetColor() {
    try {
      const cmd = `
echo "aosp:\$(settings get secure theme_customization_overlay_packages 2>/dev/null)"
echo "xiaomi:\$(getprop persist.sys.theme.accentcolor 2>/dev/null)"
echo "system_accent:\$(settings get system accent_color 2>/dev/null)"
echo "secure_accent:\$(settings get secure accent_color 2>/dev/null)"
echo "theme_accent:\$(settings get system theme_accent_color 2>/dev/null)"
echo "system_accent_col:\$(settings get system system_accent_color 2>/dev/null)"
echo "overlay_300:\$(cmd overlay lookup android android:color/system_accent1_300 2>/dev/null)"
echo "overlay_600:\$(cmd overlay lookup android android:color/system_accent1_600 2>/dev/null)"
`;
      const { errno, stdout } = await KsuApi.exec(cmd);
      if (errno !== 0 || !stdout) return null;
      
      const lines = stdout.trim().split("\n");
      const values = {};
      lines.forEach(line => {
        const parts = line.split(":");
        if (parts.length >= 2) {
          values[parts[0].trim()] = parts.slice(1).join(":").trim();
        }
      });
      
      let hex = null;
      
      // 1. Try AOSP Monet JSON parse
      if (values["aosp"] && values["aosp"] !== "null" && values["aosp"].trim()) {
        const systemPaletteMatch = values["aosp"].match(/"android\.theme\.customization\.system_palette":"(#[A-Fa-f0-9]{6})"/);
        const accentColorMatch = values["aosp"].match(/"android\.theme\.customization\.accent_color":"(#[A-Fa-f0-9]{6})"/);
        if (systemPaletteMatch && systemPaletteMatch[1]) {
          hex = systemPaletteMatch[1];
        } else if (accentColorMatch && accentColorMatch[1]) {
          hex = accentColorMatch[1];
        }
      }
      
      // 2. Try Xiaomi Accent Color (HyperOS / MIUI)
      if (!hex) {
        hex = parseToHex(values["xiaomi"]);
      }
      
      // 3. Try custom ROM settings keys
      if (!hex) hex = parseToHex(values["system_accent"]);
      if (!hex) hex = parseToHex(values["secure_accent"]);
      if (!hex) hex = parseToHex(values["theme_accent"]);
      if (!hex) hex = parseToHex(values["system_accent_col"]);
      
      // 4. Try direct Android 12+ overlay manager lookup (highest compatibility)
      if (!hex && values["overlay_300"]) {
        const match = values["overlay_300"].match(/#([A-Fa-f0-9]{8})/);
        if (match && match[1]) {
          hex = "#" + match[1].substring(2);
        }
      }
      if (!hex && values["overlay_600"]) {
        const match = values["overlay_600"].match(/#([A-Fa-f0-9]{8})/);
        if (match && match[1]) {
          hex = "#" + match[1].substring(2);
        }
      }
      
      if (hex) {
        applyThemeColor(hex);
        isMonetActive = true;
        updateMonetStatusUI(true, hex);
        return hex;
      }
    } catch (err) {
      console.error("Error detecting Monet theme color:", err);
    }
    
    isMonetActive = false;
    updateMonetStatusUI(false);
    return null;
  }

  /**
   * Update the Monet Sync Status indicator
   */
  function updateMonetStatusUI(active, hex = '') {
    const indicator = document.getElementById("monet-indicator");
    const text = document.getElementById("monet-sync-text");
    
    if (!indicator || !text) return;
    
    if (active) {
      indicator.className = "status-indicator success";
      text.innerText = `Monet Sync Active: ${hex}`;
    } else {
      indicator.className = "status-indicator error";
      text.innerText = "System Monet Unavailable (Using Seed)";
    }
  }

  /**
   * Set theme mode (dark/light)
   * @param {'dark'|'light'} mode 
   */
  function setThemeMode(mode) {
    const body = document.body;
    if (mode === 'light') {
      body.classList.remove('dark-mode');
      body.classList.add('light-mode');
      activeThemeMode = 'light';
      document.documentElement.style.colorScheme = 'light';
    } else {
      body.classList.remove('light-mode');
      body.classList.add('dark-mode');
      activeThemeMode = 'dark';
      document.documentElement.style.colorScheme = 'dark';
    }
    localStorage.setItem('sweetclocker_theme_mode', mode);
    updateThemeModeUI(mode);
    
    // Re-apply current seed color to recalculate background hex for status bar
    if (activeSeedColor) {
      applyThemeColor(activeSeedColor);
    }
  }

  function updateThemeModeUI(mode) {
    const segments = document.querySelectorAll('[data-theme-mode]');
    segments.forEach(seg => {
      if (seg.getAttribute('data-theme-mode') === mode) {
        seg.classList.add('active');
      } else {
        seg.classList.remove('active');
      }
    });
  }

  /**
   * Initialize theme settings on launch
   */
  async function initTheme() {
    const savedMode = localStorage.getItem('sweetclocker_theme_mode') || 'dark';
    setThemeMode(savedMode);
    
    const savedColor = localStorage.getItem('sweetclocker_seed_color');
    if (savedColor) {
      applyThemeColor(savedColor);
      isMonetActive = false;
      updateMonetStatusUI(false);
    } else {
      const monetHex = await detectMonetColor();
      if (!monetHex) {
        applyThemeColor(activeSeedColor);
      }
    }
    
    updateColorDotUI();
  }

  function updateColorDotUI() {
    const dots = document.querySelectorAll('.color-dot');
    dots.forEach(dot => {
      const col = dot.getAttribute('data-color');
      if (col === activeSeedColor) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  function setManualSeedColor(hexCode) {
    applyThemeColor(hexCode);
    localStorage.setItem('sweetclocker_seed_color', hexCode);
    isMonetActive = false;
    updateMonetStatusUI(false);
    updateColorDotUI();
  }

  async function resetToMonet() {
    localStorage.removeItem('sweetclocker_seed_color');
    
    // Clear inline overridden styles so that the injected host theme variables can take over
    const root = document.documentElement;
    const properties = [
      '--theme-color-primary', '--theme-color-on-primary', '--theme-color-primary-container', '--theme-color-on-primary-container',
      '--theme-color-secondary', '--theme-color-on-secondary', '--theme-color-secondary-container', '--theme-color-on-secondary-container',
      '--theme-color-background', '--theme-color-on-background',
      '--theme-color-surface', '--theme-color-on-surface', '--theme-color-surface-variant', '--theme-color-on-surface-variant',
      '--theme-color-outline', '--theme-color-outline-variant'
    ];
    properties.forEach(p => root.style.removeProperty(p));
    document.documentElement.style.removeProperty('background-color');
    document.body.style.removeProperty('background-color');
    
    const rootStyles = window.getComputedStyle(document.documentElement);
    const hasHostPrimary = rootStyles.getPropertyValue('--theme-color-primary').trim();
    const hasHostBg = rootStyles.getPropertyValue('--theme-color-background').trim();
    
    if (hasHostPrimary && hasHostBg) {
      isMonetActive = true;
      updateMonetStatusUI(true, "System Default");
      KsuApi.toast("Synced color scheme to Android Monet");
    } else {
      const monetHex = await detectMonetColor();
      if (monetHex) {
        applyThemeColor(monetHex);
        KsuApi.toast("Synced color scheme to Android Monet");
      } else {
        applyThemeColor('#6750A4');
        KsuApi.toast("Monet unavailable, reset to default theme color");
      }
    }
    updateColorDotUI();
  }

  // Expose to window namespace
  window.Theme = {
    initTheme,
    setThemeMode,
    applyThemeColor,
    detectMonetColor,
    setManualSeedColor,
    resetToMonet,
    updateColorDotUI,
    getActiveSeedColor: () => activeSeedColor
  };
})();
