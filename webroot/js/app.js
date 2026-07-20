/* app.js - Main Application Orchestrator (Classic Script version) */
(function() {
  let activeTab = 'page-dashboard';
  let pollInterval = null;

  /**
   * Initialize application elements, settings, and listeners
   */
  async function initApp() {
    // 1. Initialize Theme (Monet / Preferences)
    await Theme.initTheme();
    
    // 2. Fetch Device Model metadata
    try {
      const { errno, stdout } = await KsuApi.exec("getprop ro.product.model");
      const modelText = document.getElementById("device-model");
      if (modelText && errno === 0 && stdout) {
        modelText.innerText = stdout.trim();
      }
    } catch (err) {
      console.error("Failed to query device model", err);
    }
    
    // 3. Bind Event Listeners
    setupNavigation();
    setupPreferencesTab();
    setupLogsControls();
    
    // Refresh button action
    document.getElementById("refresh-btn").addEventListener("click", () => {
      KsuApi.toast("Refreshing data...");
      triggerImmediateUpdate();
    });
    
    // 4. Start the live polling daemon
    startPolling();
    
    // Initial draw
    triggerImmediateUpdate();
  }

  /**
   * Navigation handler (Tab Switching on Bottom Nav Capsule)
   * Deferred command execution using setTimeout to ensure transitions are instantaneous.
   */
  function setupNavigation() {
    const navTabs = document.querySelectorAll(".nav-tab");
    const pages = document.querySelectorAll(".page-section");
    
    navTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("data-target");
        if (target === activeTab) return;
        
        // 1. Immediately toggle classes (instant visual change)
        navTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        
        pages.forEach(p => p.classList.remove("active"));
        document.getElementById(target).classList.add("active");
        
        activeTab = target;
        
        // 2. Reset polling interval
        startPolling();
        
        // 3. Defer the heavy data fetch to the next tick so the transition is instant
        setTimeout(() => {
          triggerImmediateUpdate();
        }, 50);
      });
    });
  }

  /**
   * Theming and Bypass config controls directly inside Preferences tab
   */
  function setupPreferencesTab() {
    const modeSegments = document.querySelectorAll("[data-theme-mode]");
    modeSegments.forEach(seg => {
      seg.addEventListener("click", () => {
        const mode = seg.getAttribute("data-theme-mode");
        Theme.setThemeMode(mode);
      });
    });
    
    const colorDots = document.querySelectorAll(".color-dot:not(#custom-color-indicator)");
    colorDots.forEach(dot => {
      dot.addEventListener("click", () => {
        const hex = dot.getAttribute("data-color");
        Theme.setManualSeedColor(hex);
        KsuApi.toast(`Theme accent updated`);
      });
    });
    
    const picker = document.getElementById("custom-color-picker");
    const pickerIndicator = document.getElementById("custom-color-indicator");
    
    picker.addEventListener("input", (e) => {
      const val = e.target.value;
      pickerIndicator.style.backgroundColor = val;
      Theme.setManualSeedColor(val);
    });
    
    document.getElementById("reset-monet-btn").addEventListener("click", () => {
      Theme.resetToMonet();
    });
    
    const bypassOff = document.getElementById("bypass-off-btn");
    const bypassOn = document.getElementById("bypass-on-btn");
    
    bypassOff.addEventListener("click", async () => {
      if (await Stats.setBypassMode(false)) {
        bypassOff.classList.add("active");
        bypassOn.classList.remove("active");
        KsuApi.toast("Force Bypass Disabled");
        triggerImmediateUpdate();
      }
    });
    
    bypassOn.addEventListener("click", async () => {
      if (await Stats.setBypassMode(true)) {
        bypassOn.classList.add("active");
        bypassOff.classList.remove("active");
        KsuApi.toast("Force Bypass Override Enabled!");
        triggerImmediateUpdate();
      }
    });
  }

  /**
   * Log viewer search filtering and clear controls
   */
  function setupLogsControls() {
    const searchInput = document.getElementById("log-search");
    
    searchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase();
      filterLogLines(term);
    });
    
    document.getElementById("clear-log-btn").addEventListener("click", async () => {
      if (confirm("Are you sure you want to clear the system log file? This cannot be undone.")) {
        await Logs.clearLogs();
        triggerImmediateUpdate();
      }
    });
  }

  /**
   * Start active page polling loops (800ms for Dashboard, 2000ms for Logs)
   */
  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    
    const delay = activeTab === 'page-dashboard' ? 800 : 2000;
    pollInterval = setInterval(async () => {
      await runUpdateTick();
    }, delay);
  }

  async function triggerImmediateUpdate() {
    await runUpdateTick();
  }

  async function runUpdateTick() {
    if (activeTab === 'page-dashboard') {
      await updateCpuDashboard();
    } else if (activeTab === 'page-logs') {
      await updateLogsView();
    }
  }

  /**
   * Update CPU Cores screen properties
   */
  async function updateCpuDashboard() {
    try {
      const data = await Stats.getCpuStats();
      
      // Update Hero Card elements if present
      const bypassStatus = document.getElementById("bypass-status");
      if (bypassStatus) bypassStatus.innerText = data.bypassActive ? "Yes (Active)" : "No";
      
      const totalCpuUsage = document.getElementById("total-cpu-usage");
      if (totalCpuUsage) totalCpuUsage.innerText = `${data.totalLoad}%`;
      
      const bypassOff = document.getElementById("bypass-off-btn");
      const bypassOn = document.getElementById("bypass-on-btn");
      if (bypassOff && bypassOn) {
        if (data.bypassActive) {
          bypassOn.classList.add("active");
          bypassOff.classList.remove("active");
        } else {
          bypassOff.classList.add("active");
          bypassOn.classList.remove("active");
        }
      }
      
      const svcBadge = document.getElementById("service-status");
      if (svcBadge) {
        const indicator = svcBadge.querySelector(".status-indicator");
        const label = svcBadge.querySelector(".status-text");
        if (data.serviceRunning) {
          indicator.className = "status-indicator success";
          label.innerText = "Active";
        } else {
          indicator.className = "status-indicator error";
          label.innerText = "Stopped";
        }
      }
      
      renderCoresGrid(data.cores);
      
      // Update GPU elements if data.gpu is present
      if (data.gpu) {
        const gpuName = document.getElementById("gpu-card-name");
        if (gpuName && data.gpu.model) {
          gpuName.innerText = data.gpu.model;
        }
        
        const gpuTemp = document.getElementById("gpu-temp-badge");
        if (gpuTemp) {
          gpuTemp.innerText = data.gpu.temp > 0 ? `${data.gpu.temp}°C` : "N/A";
          if (data.gpu.temp >= 70) {
            gpuTemp.style.backgroundColor = "var(--md-sys-color-error-container)";
            gpuTemp.style.color = "var(--md-sys-color-on-error-container)";
          } else if (data.gpu.temp >= 55) {
            gpuTemp.style.backgroundColor = "var(--md-sys-color-warning-container)";
            gpuTemp.style.color = "var(--md-sys-color-on-warning-container)";
          } else {
            gpuTemp.style.backgroundColor = "var(--md-sys-color-success-container)";
            gpuTemp.style.color = "var(--md-sys-color-on-success-container)";
          }
        }
        
        const gpuUsage = document.getElementById("gpu-usage-value");
        if (gpuUsage) gpuUsage.innerText = `${data.gpu.usage}%`;
        
        const gpuProgress = document.getElementById("gpu-progress-bar");
        if (gpuProgress) gpuProgress.style.width = `${data.gpu.usage}%`;
        
        const gpuFreqMin = document.getElementById("gpu-freq-min");
        if (gpuFreqMin) {
          gpuFreqMin.innerText = data.gpu.minFreq > 0 ? `${data.gpu.minFreq} MHz` : "—";
        }
        
        const gpuFreqNow = document.getElementById("gpu-freq-now");
        if (gpuFreqNow) {
          gpuFreqNow.innerText = data.gpu.curFreq > 0 ? `${data.gpu.curFreq} MHz` : "Idle";
        }
        
        const gpuFreqMax = document.getElementById("gpu-freq-max");
        if (gpuFreqMax) {
          gpuFreqMax.innerText = data.gpu.maxFreq > 0 ? `${data.gpu.maxFreq} MHz` : "—";
        }
      }
    } catch (err) {
      console.error("Dashboard update failed:", err);
    }
  }

  /**
   * Format frequency values to GHz / MHz representing core speeds cleanly
   * @param {number} khz 
   * @returns {string} formatted value
   */
  function formatFreq(khz) {
    if (!khz || khz === 0) return "—";
    const mhz = khz / 1000;
    if (mhz >= 1000) {
      return `${(mhz / 1000).toFixed(2)} GHz`;
    }
    return `${Math.round(mhz)} MHz`;
  }

  function formatFreqShort(khz) {
    if (!khz || khz === 0) return "—";
    const mhz = khz / 1000;
    if (mhz >= 1000) return `${(mhz / 1000).toFixed(1)}G`;
    return `${Math.round(mhz)}M`;
  }

  function formatFreqMinMaxShort(minKhz, maxKhz) {
    if (!minKhz || !maxKhz) return "—";
    const format = khz => {
      const mhz = khz / 1000;
      if (mhz >= 1000) return `${(mhz / 1000).toFixed(1)}G`;
      return `${Math.round(mhz)}M`;
    };
    return `${format(minKhz)}-${format(maxKhz)}`;
  }

  /**
   * Re-render or update existing elements in Core Grid to avoid browser reflow lag
   */
  function renderCoresGrid(cores) {
    const grid = document.getElementById("cores-grid");
    if (!grid) return;
    
    const existingCards = grid.querySelectorAll(".core-card");
    if (existingCards.length !== cores.length) {
      grid.innerHTML = "";
      cores.forEach(c => {
        const card = createCoreCardElement(c);
        grid.appendChild(card);
      });
      return;
    }
    
    cores.forEach((c, idx) => {
      const card = existingCards[idx];
      if (!card) return;
      
      card.querySelector(".temp-badge").innerText = c.temp > 0 ? `${c.temp}°C` : "—";
      
      let tempClass = "temp-cold";
      if (c.temp >= 45 && c.temp < 60) tempClass = "temp-warm";
      else if (c.temp >= 60) tempClass = "temp-hot";
      card.querySelector(".temp-badge").className = `temp-badge ${tempClass}`;
      
      const nameEl = card.querySelector(".core-name");
      if (nameEl) nameEl.innerHTML = `CPU ${c.id} <span class="cluster-name">${c.cluster}</span>`;
      
      const subEl = card.querySelector(".core-sub-compact");
      if (subEl) subEl.innerText = c.governor;
      
      card.querySelector(".progress-bar-fill").style.width = `${c.usage}%`;
      card.querySelector(".core-usage-lbl").innerText = `${c.usage}%`;
      card.querySelector(".min-freq-val").innerText = formatFreqShort(c.minFreq);
      card.querySelector(".cur-freq-val").innerText = formatFreq(c.curFreq);
      card.querySelector(".max-freq-val").innerText = formatFreqShort(c.maxFreq);
    });
  }

  function createCoreCardElement(core) {
    const card = document.createElement("div");
    card.className = "card card-elevated core-card";
    card.setAttribute("data-core-id", core.id);
    
    let tempClass = "temp-cold";
    if (core.temp >= 45 && core.temp < 60) tempClass = "temp-warm";
    else if (core.temp >= 60) tempClass = "temp-hot";
    
    card.innerHTML = `
      <div class="core-header-compact">
        <div style="display: flex; flex-direction: column; min-width: 0;">
          <span class="core-name">CPU ${core.id} <span class="cluster-name">${core.cluster}</span></span>
          <span class="core-sub-compact">${core.governor}</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0;">
          <span class="temp-badge ${tempClass}">${core.temp > 0 ? core.temp + '°C' : '—'}</span>
          <span class="core-usage-lbl">${core.usage}%</span>
        </div>
      </div>
      
      <div class="progress-bar-track" style="margin-top: 2px;">
        <div class="progress-bar-fill" style="width: ${core.usage}%;"></div>
      </div>
      
      <div class="freq-compact-list" style="display: flex; justify-content: space-between;">
        <span class="min-freq-val">${formatFreqShort(core.minFreq)}</span>
        <span class="cur-freq-val">${formatFreq(core.curFreq)}</span>
        <span class="max-freq-val">${formatFreqShort(core.maxFreq)}</span>
      </div>
    `;
    
    return card;
  }

  /**
   * Update Logs view and size labels
   */
  async function updateLogsView() {
    try {
      const data = await Logs.getFormattedLogs();
      document.getElementById("log-size-info").innerText = `Size: ${formatBytes(data.size)}`;
      
      const viewer = document.getElementById("log-pre");
      if (viewer) {
        viewer.innerHTML = data.html || '<span class="log-line-info">[Log empty]</span>';
        
        const search = document.getElementById("log-search");
        if (search && !search.value.trim()) {
          const viewerContainer = document.getElementById("log-viewer");
          viewerContainer.scrollTop = viewerContainer.scrollHeight;
        }
      }
    } catch (err) {
      console.error("Log update failed:", err);
    }
  }

  function filterLogLines(term) {
    const lines = document.querySelectorAll("#log-pre > div");
    lines.forEach(line => {
      const text = line.innerText.toLowerCase();
      if (text.includes(term)) {
        line.style.display = "block";
      } else {
        line.style.display = "none";
      }
    });
  }

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Launch application on DOM Load
  window.addEventListener("DOMContentLoaded", initApp);
})();
