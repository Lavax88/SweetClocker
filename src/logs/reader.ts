import type { LogData, LogEntry, LogLevel } from './types';
import { exec, toast } from '../bridge/ksu';

const LOG_FILE = '/data/local/tmp/sweetclocker.log';

export function parseLineToEntry(line: string): LogEntry {
  let escaped = line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let level: LogLevel = 'normal';
  const lowerLine = line.toLowerCase();

  if (
    lowerLine.includes('error') ||
    lowerLine.includes('failure') ||
    lowerLine.includes('aborting')
  ) {
    level = 'error';
  } else if (
    lowerLine.includes('warning') ||
    lowerLine.includes('mismatch') ||
    lowerLine.includes('drift detected')
  ) {
    level = 'warning';
  } else if (
    lowerLine.includes('success') ||
    lowerLine.includes('exact') ||
    lowerLine.includes('discovered') ||
    lowerLine.includes('ok, no drift')
  ) {
    level = 'success';
  } else if (
    lowerLine.includes('heartbeat') ||
    lowerLine.includes('started') ||
    lowerLine.includes('switching') ||
    lowerLine.includes('info')
  ) {
    level = 'info';
  }

  escaped = escaped.replace(
    /(drift detected|error|warning|success|exact)/gi,
    '<strong style="text-decoration: underline;">$1</strong>'
  );

  return {
    raw: line,
    level,
    highlightedHtml: escaped
  };
}

/**
 * Fetch logs using tail reading for high-performance retrieval
 */
export async function getLogs(tailLines = 250): Promise<LogData> {
  try {
    const combinedCmd = `
size=$(wc -c < ${LOG_FILE} 2>/dev/null || echo "0")
echo "$size"
echo "---"
tail -n ${tailLines} ${LOG_FILE} 2>/dev/null || cat ${LOG_FILE} 2>/dev/null
`;

    const { errno, stdout, stderr } = await exec(combinedCmd, { timeoutMs: 5000 });
    if (errno !== 0 && !stdout) {
      throw new Error(stderr || 'Could not read log files');
    }

    const parts = stdout.trim().split('---');
    const sizeBytes = parseInt(parts[0]?.trim() ?? '0', 10) || 0;
    const rawLogs = parts.slice(1).join('---').trim();

    if (sizeBytes === 0 || !rawLogs) {
      return {
        entries: [
          {
            raw: '[System] No log entries found.',
            level: 'info',
            highlightedHtml: `[System] No log entries found. Module logs are stored at ${LOG_FILE}`
          }
        ],
        rawText: '',
        size: 0
      };
    }

    const lines = rawLogs.split('\n').filter((l) => l.trim().length > 0);
    const entries = lines.map(parseLineToEntry);

    return {
      entries,
      rawText: rawLogs,
      size: sizeBytes
    };
  } catch (err) {
    console.error('Error reading logs:', err);
    return {
      entries: [
        {
          raw: `[Error] Failed to read log file: ${err instanceof Error ? err.message : String(err)}`,
          level: 'error',
          highlightedHtml: `[Error] Failed to read log file: ${err instanceof Error ? err.message : String(err)}`
        }
      ],
      rawText: '',
      size: 0
    };
  }
}

/**
 * Clear log file
 */
export async function clearLogs(): Promise<boolean> {
  const { errno, stderr } = await exec(`rm -f ${LOG_FILE}`);
  if (errno === 0) {
    await exec(`touch ${LOG_FILE} && chmod 666 ${LOG_FILE}`);
    toast('Logs cleared successfully');
    return true;
  } else {
    console.error('Failed to clear logs:', stderr);
    toast('Error: Could not clear logs');
    return false;
  }
}

/**
 * Copy logs to clipboard
 */
export async function copyLogs(textToCopy?: string): Promise<boolean> {
  try {
    let text = textToCopy;
    if (!text) {
      const data = await getLogs(500);
      text = data.rawText;
    }

    if (!text) {
      toast('Log is empty');
      return false;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      toast('Logs copied to clipboard!');
      return true;
    }

    // Fallback for older WebViews
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    toast('Logs copied to clipboard!');
    return true;
  } catch (err) {
    console.error('Failed to copy logs:', err);
    toast('Failed to copy logs');
    return false;
  }
}
