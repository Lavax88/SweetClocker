/* logs.js - Log Reader and Visual Formatter (Classic Script version) */
(function() {
  /**
   * Fetch logs and format them for HTML view in a single high-performance shell call
   * @returns {Promise<{raw: string, html: string, size: number}>}
   */
  async function getFormattedLogs() {
    try {
      const combinedCmd = `
size=\$(wc -c < /data/local/tmp/sweetclocker.log 2>/dev/null || echo "0")
echo "\$size"
echo "---"
tail -n 250 /data/local/tmp/sweetclocker.log 2>/dev/null || cat /data/local/tmp/sweetclocker.log 2>/dev/null
`;

      const { errno, stdout, stderr } = await KsuApi.exec(combinedCmd);
      if (errno !== 0) {
        throw new Error(stderr || "Could not read log files");
      }

      const parts = stdout.trim().split("---");
      const sizeBytes = parseInt(parts[0].trim(), 10) || 0;
      const rawLogs = parts.slice(1).join("---").trim();

      if (sizeBytes === 0 || !rawLogs) {
        return {
          raw: "",
          html: `<span class="log-line-info">[System] No log entries found. Module logs are stored at /data/local/tmp/sweetclocker.log</span>`,
          size: 0
        };
      }

      const formattedHtml = parseLogToHtml(rawLogs);
      
      return {
        raw: rawLogs,
        html: formattedHtml,
        size: sizeBytes
      };
    } catch (err) {
      console.error("Error reading logs:", err);
      return {
        raw: "",
        html: `<span class="log-line-error">[Error] Failed to read log file: ${err.message}</span>`,
        size: 0
      };
    }
  }

  /**
   * Parse raw log lines and wrap them with Material 3 color classes
   */
  function parseLogToHtml(rawText) {
    if (!rawText) return "";
    
    const lines = rawText.split("\n");
    const htmlLines = lines.map(line => {
      if (!line.trim()) return "";
      
      let escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
      let logClass = "log-line-normal";
      const lowerLine = line.toLowerCase();
      
      if (lowerLine.includes("error") || lowerLine.includes("failure") || lowerLine.includes("aborting")) {
        logClass = "log-line-error";
      } else if (lowerLine.includes("warning") || lowerLine.includes("mismatch") || lowerLine.includes("drift detected")) {
        logClass = "log-line-warning";
      } else if (lowerLine.includes("success") || lowerLine.includes("exact") || lowerLine.includes("discovered") || lowerLine.includes("ok, no drift")) {
        logClass = "log-line-success";
      } else if (lowerLine.includes("heartbeat") || lowerLine.includes("started") || lowerLine.includes("switching") || lowerLine.includes("info")) {
        logClass = "log-line-info";
      }
      
      escaped = escaped
        .replace(/(drift detected|error|warning|success|exact)/gi, '<strong style="text-decoration: underline;">$1</strong>');

      return `<div class="${logClass}">${escaped}</div>`;
    });
    
    return htmlLines.join("");
  }

  /**
   * Clears the log file
   */
  async function clearLogs() {
    const { errno, stderr } = await KsuApi.exec("rm -f /data/local/tmp/sweetclocker.log");
    if (errno === 0) {
      await KsuApi.exec("touch /data/local/tmp/sweetclocker.log && chmod 666 /data/local/tmp/sweetclocker.log");
      KsuApi.toast("Logs cleared successfully");
      return true;
    } else {
      console.error("Failed to clear logs:", stderr);
      KsuApi.toast("Error: Could not clear logs");
      return false;
    }
  }

  // Expose to window namespace
  window.Logs = {
    getFormattedLogs,
    clearLogs
  };
})();
