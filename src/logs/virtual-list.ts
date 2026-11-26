import type { LogEntry } from './types';

export interface VirtualListOptions {
  container: HTMLElement;
  itemHeight?: number;
  overscan?: number;
}

export class VirtualLogList {
  private container: HTMLElement;
  private allEntries: LogEntry[] = [];
  private filteredEntries: LogEntry[] = [];
  private searchTerm = '';
  private content: HTMLDivElement;

  constructor(options: VirtualListOptions) {
    this.container = options.container;
    this.container.innerHTML = '';

    this.content = document.createElement('div');
    this.content.className = 'virtual-log-content';
    this.container.appendChild(this.content);
  }

  public setEntries(entries: LogEntry[], autoScrollBottom = false): void {
    this.allEntries = entries;
    this.applyFilter();
    if (autoScrollBottom && !this.searchTerm) {
      this.scrollToBottom();
    }
  }

  public setSearchTerm(term: string): void {
    this.searchTerm = term.toLowerCase().trim();
    this.applyFilter();
  }

  public scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.container.scrollTop = this.container.scrollHeight;
    });
  }

  private applyFilter(): void {
    if (!this.searchTerm) {
      this.filteredEntries = this.allEntries;
    } else {
      this.filteredEntries = this.allEntries.filter((e) =>
        e.raw.toLowerCase().includes(this.searchTerm)
      );
    }

    this.render();
  }

  private render(): void {
    if (this.filteredEntries.length === 0) {
      this.content.innerHTML = '<div class="log-line log-line-info">No matching log lines.</div>';
      return;
    }

    this.content.innerHTML = this.filteredEntries
      .map((entry) => `<div class="log-line log-line-${entry.level}">${entry.highlightedHtml}</div>`)
      .join('');
  }
}
