/* ksu-api.js - KernelSU Bridge & Mock Data fallback (Classic Script version) */
(function() {
  let callbackCounter = 0;
  function getUniqueCallbackName(prefix) {
    return `${prefix}_callback_${Date.now()}_${callbackCounter++}`;
  }

  /**
   * Execute a shell command via KernelSU's root execution API
   * @param {string} command - Shell command to execute
   * @param {object} options - Execution options
   * @returns {Promise<{errno: number, stdout: string, stderr: string}>}
   */
  function exec(command, options = {}) {
    return new Promise((resolve, reject) => {
      // Check if we are running inside the KernelSU Manager WebView
      if (typeof window.ksu === "undefined") {
        // Fallback: mock the response for desktop/browser testing
        setTimeout(() => {
          resolve(mockExec(command));
        }, 50);
        return;
      }

      const callbackFuncName = getUniqueCallbackName("exec");
      
      window[callbackFuncName] = (errno, stdout, stderr) => {
        resolve({ errno, stdout, stderr });
        delete window[callbackFuncName];
      };

      try {
        ksu.exec(command, JSON.stringify(options), callbackFuncName);
      } catch (error) {
        reject(error);
        delete window[callbackFuncName];
      }
    });
  }

  /**
   * Display a short toast notification on screen
   * @param {string} message 
   */
  function toast(message) {
    if (typeof window.ksu !== "undefined" && typeof ksu.toast === "function") {
      try {
        ksu.toast(message);
      } catch (e) {
        console.error("Toast error:", e);
      }
    } else {
      // Browser fallback
      console.log("[Toast Alert]:", message);
      const toastEl = document.createElement("div");
      toastEl.style.position = "fixed";
      toastEl.style.bottom = "96px"; // Adjusted to sit clear of bottom nav
      toastEl.style.left = "50%";
      toastEl.style.transform = "translateX(-50%)";
      toastEl.style.backgroundColor = "var(--md-sys-color-primary-container)";
      toastEl.style.color = "var(--md-sys-color-on-primary-container)";
      toastEl.style.padding = "8px 16px";
      toastEl.style.borderRadius = "20px";
      toastEl.style.fontSize = "0.85rem";
      toastEl.style.fontWeight = "500";
      toastEl.style.boxShadow = "var(--md-elevation-2)";
      toastEl.style.zIndex = "9999";
      toastEl.innerText = message;
      document.body.appendChild(toastEl);
      setTimeout(() => toastEl.remove(), 2500);
    }
  }

  /* Mock Data Engine for Browser/Staging Previews */
  const mockCoresState = Array.from({ length: 8 }, (_, i) => {
    let cluster = "LITTLE";
    let targetMax = 1286400;
    if (i >= 2 && i <= 6) { cluster = "MID"; targetMax = 1920000; }
    else if (i === 7) { cluster = "PRIME"; targetMax = 2515200; }
    
    return {
      id: i,
      cluster,
      gov: "schedutil",
      min: 400000,
      max: targetMax,
      cur: 600000,
      temp: 38,
      user: 50000 + Math.floor(Math.random() * 10000),
      nice: 2000,
      sys: 15000 + Math.floor(Math.random() * 5000),
      idle: 500000 + Math.floor(Math.random() * 200000),
      iowait: 1000,
      irq: 500,
      softirq: 500
    };
  });

  let mockBypass = false;
  let mockLog = `[2026-07-20 00:02:18] post-fs-data.sh: boot start, log truncated
[2026-07-20 00:02:18] discovered policy0 -> cpus [0,1] -> target 1286400 kHz (LITTLE, matches expected)
[2026-07-20 00:02:18] policy0/scaling_max_freq: wrote 1286400, readback 1286400 (exact)
[2026-07-20 00:02:18] discovered policy2 -> cpus [2,3,4] -> target 1920000 kHz (MID, matches expected)
[2026-07-20 00:02:18] policy2/scaling_max_freq: wrote 1920000, readback 1920000 (exact)
[2026-07-20 00:02:18] discovered policy5 -> cpus [5,6] -> target 1920000 kHz (MID, matches expected)
[2026-07-20 00:02:18] policy5/scaling_max_freq: wrote 1920000, readback 1920000 (exact)
[2026-07-20 00:02:19] discovered policy7 -> cpus [7] -> target 2515200 kHz (PRIME, matches expected)
[2026-07-20 00:02:19] policy7/scaling_max_freq: wrote 2515200, readback 2515200 (exact)
[2026-07-20 00:02:22] service.sh: loop started, fast-poll phase (5s interval, 3min)
[2026-07-20 00:02:27] service.sh: check ok, no drift
[2026-07-20 00:02:32] service.sh: check ok, no drift
[2026-07-20 00:02:37] service.sh: drift detected on policy7, was reset to 2860800, re-applying 2515200
[2026-07-20 00:02:37] policy7/scaling_max_freq: wrote 2515200, readback 2515200 (exact)
[2026-07-20 00:02:42] service.sh: check ok, no drift
[2026-07-20 00:02:47] service.sh: check ok, no drift
[2026-07-20 00:02:52] service.sh: check ok, no drift
[2026-07-20 00:02:57] service.sh: heartbeat, no drift (check #10)
[2026-07-20 00:03:02] service.sh: check ok, no drift`;

  function mockExec(command) {
    if (command.includes("getprop ro.product.model")) {
      return { errno: 0, stdout: "POCO F7 Pro (Simulator)\n", stderr: "" };
    }
    
    if (command.includes("[ -f /data/local/tmp/sweetclocker_force ]")) {
      return { errno: mockBypass ? 0 : 1, stdout: "", stderr: "" };
    }
    if (command.includes("touch /data/local/tmp/sweetclocker_force")) {
      mockBypass = true;
      mockLog += `\n[${new Date().toISOString().replace('T', ' ').slice(0,19)}] service.sh: Force bypass activated manually`;
      return { errno: 0, stdout: "", stderr: "" };
    }
    if (command.includes("rm -f /data/local/tmp/sweetclocker_force")) {
      mockBypass = false;
      mockLog += `\n[${new Date().toISOString().replace('T', ' ').slice(0,19)}] service.sh: Force bypass deactivated`;
      return { errno: 0, stdout: "", stderr: "" };
    }

    if (command.includes("rm -f /data/local/tmp/sweetclocker.log")) {
      mockLog = `[${new Date().toISOString().replace('T', ' ').slice(0,19)}] sweetclocker.log cleared by user via WebUI`;
      return { errno: 0, stdout: "", stderr: "" };
    }

    if (command.includes("cat /data/local/tmp/sweetclocker.log")) {
      return { errno: 0, stdout: mockLog, stderr: "" };
    }
    if (command.includes("wc -c < /data/local/tmp/sweetclocker.log")) {
      return { errno: 0, stdout: `${mockLog.length}\n`, stderr: "" };
    }

    if (command.includes("pgrep -f")) {
      return { errno: 0, stdout: "1892\n", stderr: "" };
    }

    if (command.includes("settings get secure theme_customization_overlay_packages")) {
      return { 
        errno: 0, 
        stdout: `{"android.theme.customization.system_palette":"#005FAF","android.theme.customization.accent_color":"#005FAF"}\n`, 
        stderr: "" 
      };
    }

    if (command.includes("scaling_governor")) {
      const outputs = mockCoresState.map(c => c.gov).join("\n") + "\n";
      return { errno: 0, stdout: outputs, stderr: "" };
    }
    if (command.includes("scaling_min_freq")) {
      const outputs = mockCoresState.map(c => c.min).join("\n") + "\n";
      return { errno: 0, stdout: outputs, stderr: "" };
    }
    if (command.includes("scaling_max_freq")) {
      const outputs = mockCoresState.map(c => c.max).join("\n") + "\n";
      return { errno: 0, stdout: outputs, stderr: "" };
    }
    if (command.includes("scaling_cur_freq")) {
      mockCoresState.forEach(c => {
        const range = c.max - c.min;
        const usage = Math.random();
        c.cur = Math.floor(c.min + range * usage);
        c.temp = Math.floor(35 + (usage * 25) + (c.id * 1.2));
      });
      const outputs = mockCoresState.map(c => c.cur).join("\n") + "\n";
      return { errno: 0, stdout: outputs, stderr: "" };
    }
    
    if (command.includes("/sys/class/thermal/thermal_zone")) {
      const outputs = mockCoresState.map(c => c.temp * 1000).join("\n") + "\n";
      return { errno: 0, stdout: outputs, stderr: "" };
    }

    if (command.includes("cat /proc/stat")) {
      let statOutput = "";
      mockCoresState.forEach(c => {
        const activeDelta = Math.floor(Math.random() * 2000);
        const idleDelta = Math.floor(Math.random() * 4000);
        c.user += Math.floor(activeDelta * 0.7);
        c.sys += Math.floor(activeDelta * 0.3);
        c.idle += idleDelta;
        
        statOutput += `cpu${c.id} ${c.user} ${c.nice} ${c.sys} ${c.idle} ${c.iowait} ${c.irq} ${c.softirq} 0 0 0\n`;
      });
      return { errno: 0, stdout: statOutput, stderr: "" };
    }

    return { errno: 0, stdout: "", stderr: "" };
  }

  // Expose to window namespace
  window.KsuApi = {
    exec,
    toast
  };
})();
