import type { SystemPropItem } from '../../telemetry/types';
import { escapeHtml } from '../../utils/escape';

export interface VirtualPropListOptions {
  container: HTMLElement;
  itemHeight?: number;
  overscan?: number;
  onSelectProp: (prop: SystemPropItem) => void;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatch(text: string, query: string): string {
  if (!query) {
    return escapeHtml(text);
  }
  const escapedText = escapeHtml(text);
  const regex = new RegExp(`(${escapeRegExp(escapeHtml(query))})`, 'gi');
  return escapedText.replace(regex, '<mark>$1</mark>');
}

export class VirtualPropList {
  private container: HTMLElement;
  private itemHeight: number;
  private overscan: number;
  private onSelectProp: (prop: SystemPropItem) => void;

  private allProps: SystemPropItem[] = [];
  private filteredProps: SystemPropItem[] = [];
  private searchTerm = '';
  private filterMode: 'all' | 'modified' | 'boot' = 'all';

  private spacer: HTMLDivElement;
  private content: HTMLDivElement;
  private isTicking = false;

  constructor(options: VirtualPropListOptions) {
    this.container = options.container;
    this.itemHeight = options.itemHeight ?? 56;
    this.overscan = options.overscan ?? 6;
    this.onSelectProp = options.onSelectProp;

    this.container.innerHTML = '';
    this.container.style.position = 'relative';
    this.container.style.overflowY = 'auto';

    this.spacer = document.createElement('div');
    this.spacer.className = 'virtual-prop-spacer';
    this.spacer.style.width = '100%';

    this.content = document.createElement('div');
    this.content.className = 'virtual-prop-content';
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

    // Delegated click listener for row selections
    this.content.addEventListener('click', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('.prop-row');
      if (!row) return;

      const propKey = row.getAttribute('data-prop-key');
      if (!propKey) return;

      const prop = this.filteredProps.find((p) => p.key === propKey);
      if (prop) {
        this.onSelectProp(prop);
      }
    });
  }

  public setProps(props: SystemPropItem[]): void {
    this.allProps = props;
    this.applyFilter();
  }

  public setSearchTerm(term: string): void {
    this.searchTerm = term.toLowerCase().trim();
    this.applyFilter();
  }

  public setFilterMode(mode: 'all' | 'modified' | 'boot'): void {
    this.filterMode = mode;
    this.applyFilter();
  }

  public getFilteredCount(): number {
    return this.filteredProps.length;
  }

  public getTotalCount(): number {
    return this.allProps.length;
  }

  public scrollToTop(): void {
    requestAnimationFrame(() => {
      this.container.scrollTop = 0;
    });
  }

  public refresh(): void {
    this.applyFilter();
  }

  private applyFilter(): void {
    let result = this.allProps;

    // Filter mode
    if (this.filterMode === 'modified') {
      result = result.filter((p) => p.isModified);
    } else if (this.filterMode === 'boot') {
      result = result.filter((p) => p.applyBoot);
    }

    // Search term (matches either key or value)
    if (this.searchTerm) {
      result = result.filter(
        (p) =>
          p.key.toLowerCase().includes(this.searchTerm) ||
          p.value.toLowerCase().includes(this.searchTerm)
      );
    }

    this.filteredProps = result;

    const totalHeight = this.filteredProps.length * this.itemHeight;
    this.spacer.style.height = `${totalHeight}px`;

    this.render();
  }

  private render(): void {
    const total = this.filteredProps.length;
    if (total === 0) {
      this.content.style.transform = 'translateY(0px)';
      const emptyMsg = this.searchTerm || this.filterMode !== 'all'
        ? 'No properties match the current filter or search.'
        : 'No system properties available.';
      this.content.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: var(--md-sys-color-on-surface-variant); font-size: 0.875rem;">
          ${escapeHtml(emptyMsg)}
        </div>
      `;
      return;
    }

    const scrollTop = this.container.scrollTop;
    const clientHeight = this.container.clientHeight || 400;

    let startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.overscan);
    let endIndex = Math.min(total, Math.ceil((scrollTop + clientHeight) / this.itemHeight) + this.overscan);

    if (endIndex < startIndex) endIndex = startIndex;

    const visibleItems = this.filteredProps.slice(startIndex, endIndex);
    const offsetY = startIndex * this.itemHeight;

    this.content.style.transform = `translateY(${offsetY}px)`;

    const html = visibleItems
      .map((prop) => {
        const highlightedKey = highlightMatch(prop.key, this.searchTerm);
        const escapedVal = escapeHtml(prop.value || '(empty)');
        const valTitle = escapeHtml(prop.value || '');

        let badges = '';
        if (prop.isReadOnly) {
          badges += '<span class="badge-pill badge-ro">RO</span>';
        }
        if (prop.isCustom) {
          badges += '<span class="badge-pill badge-custom">Custom</span>';
        }
        if (prop.isModified) {
          badges += '<span class="badge-pill badge-modified">Modified</span>';
        }
        if (prop.applyBoot) {
          badges += '<span class="badge-pill badge-boot">Boot</span>';
        }

        return `
          <div class="prop-row" data-prop-key="${escapeHtml(prop.key)}" style="height: ${this.itemHeight}px;">
            <div class="prop-info">
              <div class="prop-key">${highlightedKey}</div>
              <div class="prop-value" title="${valTitle}">${escapedVal}</div>
            </div>
            <div class="prop-badges">
              ${badges}
            </div>
          </div>
        `;
      })
      .join('');

    this.content.innerHTML = html;
  }
}
