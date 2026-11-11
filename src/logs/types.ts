export type LogLevel = 'error' | 'warning' | 'success' | 'info' | 'normal';

export interface LogEntry {
  raw: string;
  level: LogLevel;
  highlightedHtml: string;
}

export interface LogData {
  entries: LogEntry[];
  rawText: string;
  size: number;
}
