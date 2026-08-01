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
    console.log("[Toast Alert]:", message);
    const existing = document.getElementById("sweetclocker-toast");
    if (existing) existing.remove();

    const toastEl = document.createElement("div");
    toastEl.id = "sweetclocker-toast";
    toastEl.style.position = "fixed";
    toastEl.style.bottom = "84px";
    toastEl.style.left = "50%";
    toastEl.style.transform = "translateX(-50%) translateY(12px)";
    toastEl.style.backgroundColor = "var(--md-sys-color-primary-container)";
    toastEl.style.color = "var(--md-sys-color-on-primary-container)";
    toastEl.style.padding = "10px 20px";
    toastEl.style.borderRadius = "9999px";
    toastEl.style.fontSize = "0.85rem";
    toastEl.style.fontWeight = "600";
    toastEl.style.fontFamily = "var(--font-family)";
    toastEl.style.boxShadow = "var(--md-elevation-3)";
    toastEl.style.zIndex = "99999";
    toastEl.style.opacity = "0";
    toastEl.style.transition = "opacity 0.25s ease, transform 0.25s ease";
    toastEl.style.pointerEvents = "none";
    toastEl.style.whiteSpace = "nowrap";
    toastEl.innerText = message;
    
    document.body.appendChild(toastEl);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toastEl.style.opacity = "1";
        toastEl.style.transform = "translateX(-50%) translateY(0)";
      });
    });

    setTimeout(() => {
      toastEl.style.opacity = "0";
      toastEl.style.transform = "translateX(-50%) translateY(8px)";
      setTimeout(() => toastEl.remove(), 280);
    }, 2200);
  }

  /* Mock Data Engine for Browser/Staging Previews */
  const mockCoresState = Array.from({ length: 8 }, (_, i) => {
    let cluster = "LITTLE";
    let targetMax = 1286400;
    if (i >= 2 && i <= 6) { cluster = "BIG"; targetMax = 1920000; }
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

  let mockGpuState = {
    min: 305,
    max: 900,
    gov: "msm-adreno-tz",
    availGovs: "msm-adreno-tz performance powersave userspace simple_ondemand bw_hwmon",
    availFreqs: "305000000 401000000 480000000 550000000 640000000 750000000 900000000 1000000000"
  };

  let mockBypass = false;
  let mockLog = `[2026-07-20 00:02:18] post-fs-data.sh: boot start, log truncated
[2026-07-20 00:02:18] discovered policy0 -> cpus [0,1] -> target 1286400 kHz (LITTLE, matches expected)
[2026-07-20 00:02:18] policy0/scaling_max_freq: wrote 1286400, readback 1286400 (exact)
[2026-07-20 00:02:18] discovered policy2 -> cpus [2,3,4] -> target 1920000 kHz (BIG, matches expected)
[2026-07-20 00:02:18] policy2/scaling_max_freq: wrote 1920000, readback 1920000 (exact)
[2026-07-20 00:02:18] discovered policy5 -> cpus [5,6] -> target 1920000 kHz (BIG, matches expected)
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

    if (command.includes("gpu_busy_percent") || command.includes("gpu_model") || command.includes("gpu_dir")) {
      const busy = Math.floor(Math.random() * 40);
      const cur = Math.floor(mockGpuState.min + Math.random() * (mockGpuState.max - mockGpuState.min));
      return {
        errno: 0,
        stdout: `${busy}|${cur}|${mockGpuState.min}|${mockGpuState.max}|Adreno 735 GPU|${mockGpuState.gov}|${mockGpuState.availGovs}|${mockGpuState.availFreqs}\n`,
        stderr: ""
      };
    }

    if (command.includes(".sweetclocker_custom") && !command.includes(".sweetclocker_io_custom")) {
      const lines = command.split("\n");
      lines.forEach(l => {
        if (l.includes("_max=")) {
          const [key, val] = l.split("=");
          const maxVal = parseInt(val, 10);
          if (key.startsWith("policy0")) {
            mockCoresState[0].max = maxVal; mockCoresState[1].max = maxVal;
          } else if (key.startsWith("policy2")) {
            mockCoresState[2].max = maxVal; mockCoresState[3].max = maxVal; mockCoresState[4].max = maxVal;
          } else if (key.startsWith("policy5")) {
            mockCoresState[5].max = maxVal; mockCoresState[6].max = maxVal;
          } else if (key.startsWith("policy7")) {
            mockCoresState[7].max = maxVal;
          }
        }
        if (l.includes("_min=")) {
          const [key, val] = l.split("=");
          const minVal = parseInt(val, 10);
          if (key.startsWith("policy0")) {
            mockCoresState[0].min = minVal; mockCoresState[1].min = minVal;
          } else if (key.startsWith("policy2")) {
            mockCoresState[2].min = minVal; mockCoresState[3].min = minVal; mockCoresState[4].min = minVal;
          } else if (key.startsWith("policy5")) {
            mockCoresState[5].min = minVal; mockCoresState[6].min = minVal;
          } else if (key.startsWith("policy7")) {
            mockCoresState[7].min = minVal;
          }
        }
        if (l.includes("_gov=")) {
          const [key, val] = l.split("=");
          const govVal = val.trim();
          if (key.startsWith("policy0")) {
            mockCoresState[0].gov = govVal; mockCoresState[1].gov = govVal;
          } else if (key.startsWith("policy2")) {
            mockCoresState[2].gov = govVal; mockCoresState[3].gov = govVal; mockCoresState[4].gov = govVal;
          } else if (key.startsWith("policy5")) {
            mockCoresState[5].gov = govVal; mockCoresState[6].gov = govVal;
          } else if (key.startsWith("policy7")) {
            mockCoresState[7].gov = govVal;
          }
        }
        if (l.includes("gpu_max=")) mockGpuState.max = parseInt(l.split("=")[1], 10);
        if (l.includes("gpu_min=")) mockGpuState.min = parseInt(l.split("=")[1], 10);
        if (l.includes("gpu_gov=")) mockGpuState.gov = l.split("=")[1].trim();
      });
      mockLog += `\n[${new Date().toISOString().replace('T', ' ').slice(0,19)}] sweetspot-apply.sh: Applied custom cluster frequency limits & governor settings`;
      return { errno: 0, stdout: "", stderr: "" };
    }

    if (command.includes("---IO_CUSTOM---")) {
      const defStr = "sda=mq-deadline\nsdb=mq-deadline\nmmcblk0=mq-deadline";
      const custStr = "io_enabled=1\nio_apply_boot=1\nsda=mq-deadline\nsdb=mq-deadline\nmmcblk0=mq-deadline";
      const blocksStr = "sda|none [mq-deadline] kyber bfq\nsdb|none [mq-deadline] kyber bfq\nmmcblk0|none [mq-deadline] kyber bfq";
      const stdout = `${defStr}\n---IO_CUSTOM---\n${custStr}\n---IO_BLOCKS---\n${blocksStr}\n`;
      return { errno: 0, stdout, stderr: "" };
    }

    if (command.includes(".sweetclocker_io_custom")) {
      mockLog += `\n[${new Date().toISOString().replace('T', ' ').slice(0,19)}] sweetspot-apply.sh: Applied custom I/O scheduler configuration`;
      return { errno: 0, stdout: "", stderr: "" };
    }

    if (command.includes("--reset-io")) {
      mockLog += `\n[${new Date().toISOString().replace('T', ' ').slice(0,19)}] sweetspot-apply.sh: Reset I/O schedulers back to default system values`;
      return { errno: 0, stdout: "", stderr: "" };
    }


    if (command.includes("--reset-sweetclock")) {
      mockCoresState[0].max = 1286400; mockCoresState[1].max = 1286400;
      mockCoresState[2].max = 1920000; mockCoresState[3].max = 1920000; mockCoresState[4].max = 1920000;
      mockCoresState[5].max = 1920000; mockCoresState[6].max = 1920000;
      mockCoresState[7].max = 2515200;
      mockCoresState[0].min = 400000; mockCoresState[1].min = 400000;
      mockCoresState[2].min = 600000; mockCoresState[3].min = 600000; mockCoresState[4].min = 600000;
      mockCoresState[5].min = 600000; mockCoresState[6].min = 600000;
      mockCoresState[7].min = 800000;
      mockCoresState.forEach(c => c.gov = "schedutil");
      mockGpuState.min = 305;
      mockGpuState.max = 900;
      mockGpuState.gov = "msm-adreno-tz";
      mockLog += `\n[${new Date().toISOString().replace('T', ' ').slice(0,19)}] sweetspot-apply.sh: Reset custom cluster frequencies & governors to predefined sweetclocks`;
      return { errno: 0, stdout: "", stderr: "" };
    }

    if (command.includes("scaling_available_frequencies") || command.includes("cpuinfo_max_freq")) {
      const govs = "schedutil performance powersave userspace ondemand conservative";
      const out = `0|400000|2000000|${mockCoresState[0].gov}|${govs}|400000 600000 800000 1000000 1200000 1286400 1400000 1600000 1800000 2000000\n` +
                  `2|600000|2800000|${mockCoresState[2].gov}|${govs}|600000 900000 1200000 1500000 1800000 1920000 2100000 2400000 2600000 2800000\n` +
                  `5|600000|2800000|${mockCoresState[5].gov}|${govs}|600000 900000 1200000 1500000 1800000 1920000 2100000 2400000 2600000 2800000\n` +
                  `7|800000|3000000|${mockCoresState[7].gov}|${govs}|800000 1100000 1400000 1700000 2000000 2300000 2515200 2700000 2900000 3000000\n`;
      return { errno: 0, stdout: out, stderr: "" };
    }

    return { errno: 0, stdout: "", stderr: "" };
  }

  /**
   * Opens an external web URL in the system's default Android browser
   * @param {string} url - Target URL to open
   */
  async function openUrl(url) {
    if (!url) return;
    try {
      if (typeof window.ksu !== "undefined" && window.ksu.openUrl) {
        window.ksu.openUrl(url);
        return;
      }
    } catch (e) {
      console.warn("ksu.openUrl failed, using am start VIEW intent fallback:", e);
    }

    const safeUrl = url.replace(/'/g, "'\\''");
    const cmd = `am start -a android.intent.action.VIEW -d '${safeUrl}' 2>/dev/null`;
    const res = await exec(cmd);
    if (res.errno !== 0) {
      window.open(url, "_blank");
    }
  }

  // Expose to window namespace
  window.KsuApi = {
    exec,
    toast,
    openUrl
  };
})();
