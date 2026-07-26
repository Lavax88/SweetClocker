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
    setupTuningControls();
    
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
    const fabContainer = document.getElementById("tuning-fab-container");
    
    navTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("data-target");
        if (target === activeTab) return;
        
        // 1. Immediately toggle classes (instant visual change)
        navTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        
        pages.forEach(p => p.classList.remove("active"));
        const targetPage = document.getElementById(target);
        if (targetPage) targetPage.classList.add("active");
        
        if (fabContainer) {
          if (target === "page-tuning") {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                fabContainer.classList.add("fab-visible");
              });
            });
          } else {
            fabContainer.classList.remove("fab-visible");
          }
        }

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
    } else if (activeTab === 'page-tuning') {
      await updateTuningView();
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

  const CLUSTERS_CONFIG = [
    {
      id: "cluster-0",
      name: "Cluster 0 (CPUs 0-1)",
      clusterLabel: "LITTLE",
      policy: "policy0",
      cpus: [0, 1],
      sweetclockMax: 1286400,
      defaultMin: 364800,
      fallbackHwMax: 2016000,
      fallbackAvail: [364800, 441600, 614400, 748800, 883200, 979200, 1075200, 1190400, 1286400, 1401600, 1516800, 1632000, 1785600, 1900800, 2016000]
    },
    {
      id: "cluster-1",
      name: "Cluster 1 (CPUs 2-4)",
      clusterLabel: "BIG 1",
      policy: "policy2",
      cpus: [2, 3, 4],
      sweetclockMax: 1920000,
      defaultMin: 480000,
      fallbackHwMax: 3014400,
      fallbackAvail: [480000, 633600, 787200, 940800, 1056000, 1190400, 1286400, 1401600, 1516800, 1632000, 1728000, 1824000, 1920000, 2073600, 2208000, 2323200, 2438400, 2515200, 2611200, 2707200, 2803200, 2918400, 3014400]
    },
    {
      id: "cluster-2",
      name: "Cluster 2 (CPUs 5-6)",
      clusterLabel: "BIG 2",
      policy: "policy5",
      cpus: [5, 6],
      sweetclockMax: 1920000,
      defaultMin: 480000,
      fallbackHwMax: 2803200,
      fallbackAvail: [480000, 633600, 787200, 940800, 1056000, 1190400, 1286400, 1401600, 1516800, 1632000, 1728000, 1824000, 1920000, 2073600, 2208000, 2323200, 2438400, 2515200, 2611200, 2707200, 2803200]
    },
    {
      id: "cluster-3",
      name: "Cluster 3 (CPU 7)",
      clusterLabel: "PRIME",
      policy: "policy7",
      cpus: [7],
      sweetclockMax: 2515200,
      defaultMin: 480000,
      fallbackHwMax: 3206400,
      fallbackAvail: [480000, 633600, 787200, 960000, 1094400, 1228800, 1363200, 1478400, 1670400, 1785600, 1920000, 2054400, 2169600, 2284800, 2400000, 2515200, 2630400, 2745600, 2841600, 2956800, 3072000, 3206400]
    }
  ];

  function setupTuningControls() {
    const applyBtn = document.getElementById("apply-tuning-btn");
    if (applyBtn) {
      applyBtn.addEventListener("click", async () => {
        const config = {};
        CLUSTERS_CONFIG.forEach(cluster => {
          const minTrigger = document.getElementById(`${cluster.id}-min-trigger`);
          const maxTrigger = document.getElementById(`${cluster.id}-max-trigger`);
          if (minTrigger && maxTrigger) {
            config[cluster.policy] = {
              min: parseInt(minTrigger.getAttribute("data-val"), 10),
              max: parseInt(maxTrigger.getAttribute("data-val"), 10)
            };
          }
        });

        KsuApi.toast("Applying custom cluster frequencies...");
        const ok = await Stats.applyCustomClusterFreqs(config);
        if (ok) {
          KsuApi.toast("Custom frequencies applied!");
          triggerImmediateUpdate();
        } else {
          KsuApi.toast("Failed to apply custom frequencies");
        }
      });
    }

    const resetBtn = document.getElementById("reset-sweetclock-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", async () => {
        KsuApi.toast("Resetting to predefined sweetclocks...");
        const ok = await Stats.resetToSweetclocks();
        if (ok) {
          KsuApi.toast("Reset to sweetclocks complete!");
          triggerImmediateUpdate();
        } else {
          KsuApi.toast("Failed to reset sweetclocks");
        }
      });
    }
  }

  async function updateTuningView() {
    try {
      const data = await Stats.getCpuStats();
      const grid = document.getElementById("tuning-grid");
      if (!grid) return;

      const existingCards = grid.querySelectorAll(".tuning-card");
      if (existingCards.length !== CLUSTERS_CONFIG.length) {
        grid.innerHTML = "";
        CLUSTERS_CONFIG.forEach(cluster => {
          const card = renderClusterTuningCard(cluster, data);
          grid.appendChild(card);
        });
      } else {
        CLUSTERS_CONFIG.forEach((cluster, idx) => {
          const card = existingCards[idx];
          if (!card) return;
          updateClusterTuningCardValues(card, cluster, data);
        });
      }
    } catch (err) {
      console.error("Tuning view update failed:", err);
    }
  }

  // Material 3 Frequency Selector Sheet Handler
  function openFreqSheet({ title, subtitle, availFreqs, currentVal, sweetclockMax, hwMax, onSelect }) {
    const backdrop = document.getElementById("freq-sheet-backdrop");
    const sheetTitle = document.getElementById("freq-sheet-title");
    const sheetSubtitle = document.getElementById("freq-sheet-subtitle");
    const sheetOptions = document.getElementById("freq-sheet-options");
    const closeBtn = document.getElementById("freq-sheet-close");

    if (!backdrop || !sheetOptions) return;

    sheetTitle.innerText = title;
    sheetSubtitle.innerText = subtitle;
    sheetOptions.innerHTML = "";

    availFreqs.forEach(freq => {
      const isSelected = freq === currentVal;
      const isSweet = freq === sweetclockMax;
      const isHwMax = freq === hwMax;

      const opt = document.createElement("div");
      opt.className = `m3-sheet-option ${isSelected ? 'active' : ''}`;
      
      let badgeHtml = "";
      if (isSweet) badgeHtml += `<span class="m3-option-badge badge-sweet">★ Sweetclock</span>`;
      if (isHwMax) badgeHtml += `<span class="m3-option-badge badge-hwmax">HW Max</span>`;

      opt.innerHTML = `
        <span class="m3-option-freq">${formatFreq(freq)}</span>
        <div class="m3-option-right">
          ${badgeHtml}
          <span class="m3-radio-icon"></span>
        </div>
      `;

      opt.addEventListener("click", () => {
        backdrop.classList.remove("active");
        if (onSelect) onSelect(freq);
      });

      sheetOptions.appendChild(opt);
    });

    backdrop.onclick = (e) => {
      if (e.target === backdrop) backdrop.classList.remove("active");
    };

    if (closeBtn) {
      closeBtn.onclick = () => backdrop.classList.remove("active");
    }

    backdrop.classList.add("active");

    setTimeout(() => {
      const activeOpt = sheetOptions.querySelector(".m3-sheet-option.active");
      if (activeOpt) activeOpt.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
  }

  function renderClusterTuningCard(cluster, data) {
    const card = document.createElement("div");
    card.className = "tuning-card";
    card.setAttribute("data-cluster-id", cluster.id);

    const coreData = data.cores ? data.cores.find(c => c.id === cluster.cpus[0]) : null;
    const curMin = coreData ? coreData.minFreq : cluster.defaultMin;
    const curMax = coreData ? coreData.maxFreq : cluster.sweetclockMax;
    
    const polData = data.clusters ? data.clusters[cluster.policy] : null;
    let avail = (polData && polData.availFreqs && polData.availFreqs.length > 0) ? [...polData.availFreqs] : [...cluster.fallbackAvail];
    const realHwMax = (polData && polData.hwMax > 0) ? Math.max(polData.hwMax, avail[avail.length - 1]) : (avail.length > 0 ? avail[avail.length - 1] : cluster.fallbackHwMax);

    if (realHwMax > 0) {
      avail = avail.filter(f => f <= realHwMax);
    }

    if (!avail.includes(curMin)) avail.push(curMin);
    if (!avail.includes(curMax) && curMax <= realHwMax) avail.push(curMax);
    if (!avail.includes(cluster.sweetclockMax) && cluster.sweetclockMax <= realHwMax) avail.push(cluster.sweetclockMax);
    avail = Array.from(new Set(avail)).sort((a, b) => a - b);
    const hwMax = avail.length > 0 ? avail[avail.length - 1] : realHwMax;

    card._clusterData = { cluster, avail, sweetclockMax: cluster.sweetclockMax, hwMax };

    let maxLabel = formatFreq(curMax);
    if (curMax === cluster.sweetclockMax) maxLabel += " ★ Sweetclock";
    else if (curMax === hwMax) maxLabel += " (HW Max)";

    card.innerHTML = `
      <div class="tuning-card-header">
        <div class="tuning-card-title-group">
          <span class="tuning-card-title">${cluster.name}</span>
          <span class="cluster-name">${cluster.clusterLabel}</span>
        </div>
        <span class="sweetclock-badge">Sweet: ${formatFreqShort(cluster.sweetclockMax)}</span>
      </div>

      <div class="tuning-stats-row">
        <span>Current Active Limits</span>
        <span class="tuning-stat-val" id="${cluster.id}-active-lbl">${formatFreqShort(curMin)} - ${formatFreqShort(curMax)}</span>
      </div>

      <div class="tuning-controls">
        <div class="tuning-control-group">
          <label class="tuning-control-label">Min Frequency</label>
          <div class="m3-picker-trigger" id="${cluster.id}-min-trigger" data-val="${curMin}">
            <span class="m3-picker-val" id="${cluster.id}-min-val">${formatFreq(curMin)}</span>
            <svg class="m3-picker-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
          </div>
        </div>

        <div class="tuning-control-group">
          <label class="tuning-control-label">Max Frequency</label>
          <div class="m3-picker-trigger" id="${cluster.id}-max-trigger" data-val="${curMax}">
            <span class="m3-picker-val" id="${cluster.id}-max-val">${maxLabel}</span>
            <svg class="m3-picker-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
          </div>
        </div>
      </div>
    `;

    // Wire up custom M3 Bottom Sheet triggers
    setTimeout(() => {
      const minTrigger = card.querySelector(`#${cluster.id}-min-trigger`);
      const maxTrigger = card.querySelector(`#${cluster.id}-max-trigger`);
      const minValLbl = card.querySelector(`#${cluster.id}-min-val`);
      const maxValLbl = card.querySelector(`#${cluster.id}-max-val`);

      if (minTrigger) {
        minTrigger.onclick = () => {
          const currentMinVal = parseInt(minTrigger.getAttribute("data-val"), 10) || curMin;
          openFreqSheet({
            title: `Select Min Frequency`,
            subtitle: `${cluster.name} • ${cluster.clusterLabel}`,
            availFreqs: avail,
            currentVal: currentMinVal,
            sweetclockMax: cluster.sweetclockMax,
            hwMax,
            onSelect: (selectedFreq) => {
              minTrigger.setAttribute("data-val", selectedFreq);
              if (minValLbl) minValLbl.innerText = formatFreq(selectedFreq);
            }
          });
        };
      }

      if (maxTrigger) {
        maxTrigger.onclick = () => {
          const currentMaxVal = parseInt(maxTrigger.getAttribute("data-val"), 10) || curMax;
          openFreqSheet({
            title: `Select Max Frequency`,
            subtitle: `${cluster.name} • ${cluster.clusterLabel}`,
            availFreqs: avail,
            currentVal: currentMaxVal,
            sweetclockMax: cluster.sweetclockMax,
            hwMax,
            onSelect: (selectedFreq) => {
              maxTrigger.setAttribute("data-val", selectedFreq);
              let lbl = formatFreq(selectedFreq);
              if (selectedFreq === cluster.sweetclockMax) lbl += " ★ Sweetclock";
              else if (selectedFreq === hwMax) lbl += " (HW Max)";
              if (maxValLbl) maxValLbl.innerText = lbl;
            }
          });
        };
      }
    }, 0);

    return card;
  }

  function updateClusterTuningCardValues(card, cluster, data) {
    const coreData = data.cores ? data.cores.find(c => c.id === cluster.cpus[0]) : null;
    if (!coreData) return;
    const curMin = coreData.minFreq;
    const curMax = coreData.maxFreq;

    const activeLbl = card.querySelector(`#${cluster.id}-active-lbl`);
    if (activeLbl) {
      activeLbl.innerText = `${formatFreqShort(curMin)} - ${formatFreqShort(curMax)}`;
    }
  }

  // Launch application on DOM Load
  window.addEventListener("DOMContentLoaded", initApp);
})();
