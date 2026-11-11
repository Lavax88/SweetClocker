import type { LogEntry } from './types';

export interface VirtualListOptions {
  container: HTMLElement;
  itemHeight?: number;
  overscan?: number;
}

export class VirtualLogList {
  private container: HTMLElement;
  private itemHeight: number;
  private overscan: number;
  private allEntries: LogEntry[] = [];
  private filteredEntries: LogEntry[] = [];
  private searchTerm = '';

  private spacer: HTMLDivElement;
  private content: HTMLDivElement;
  private isTicking = false;

  constructor(options: VirtualListOptions) {
    this.container = options.container;
    this.itemHeight = options.itemHeight ?? 22;
    this.overscan = options.overscan ?? 8;

    this.container.innerHTML = '';
    this.container.style.position = 'relative';
    this.container.style.overflowY = 'auto';

    this.spacer = document.createElement('div');
    this.spacer.className = 'virtual-log-spacer';
    this.spacer.style.width = '100%';

    this.content = document.createElement('div');
    this.content.className = 'virtual-log-content';
    this.content.style.position = 'absolute';
    this.content.style.top = '0';
    this.content.style.left = '0';
    this.content.style.right = '0';

    this.container.appendChild(this.spacer);
    this.container.appendChild(this.content);

    this.container.addEventListener('scroll', () => {
      if (!this.isTicking) {
        this.isTicking = true;
        requestAnimationFrame(() => {
          this.render();
          this.isTicking = false;
        });
      }
    });
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

    const totalHeight = this.filteredEntries.length * this.itemHeight;
    this.spacer.style.height = `${totalHeight}px`;
    this.render();
  }

  private render(): void {
    const total = this.filteredEntries.length;
    if (total === 0) {
      this.content.style.transform = 'translateY(0px)';
      this.content.innerHTML = '<div class="log-line-info" style="padding: 12px;">No matching log lines.</div>';
      return;
    }

    const scrollTop = this.container.scrollTop;
    const clientHeight = this.container.clientHeight || 400;

    let startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.overscan);
    let endIndex = Math.min(total, Math.ceil((scrollTop + clientHeight) / this.itemHeight) + this.overscan);

    if (endIndex < startIndex) endIndex = startIndex;

    const visibleItems = this.filteredEntries.slice(startIndex, endIndex);
    const offsetY = startIndex * this.itemHeight;

    this.content.style.transform = `translateY(${offsetY}px)`;

    const html = visibleItems
      .map((entry) => `<div class="log-line-${entry.level}">${entry.highlightedHtml}</div>`)
      .join('');

    this.content.innerHTML = html;
  }
}
