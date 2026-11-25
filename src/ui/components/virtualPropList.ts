import type { SystemPropItem } from '../../telemetry/types';
import { escapeHtml } from '../../utils/escape';

export interface VirtualPropListOptions {
  container: HTMLElement;
  itemHeight?: number;
  overscan?: number;
  onSelectProp: (prop: SystemPropItem) => void;
  onResetProp?: (prop: SystemPropItem) => void;
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
  private onResetProp?: (prop: SystemPropItem) => void;

  private allProps: SystemPropItem[] = [];
  private filteredProps: SystemPropItem[] = [];
  private searchTerm = '';
  private filterMode: 'all' | 'modified' | 'boot' = 'all';

  private spacer: HTMLDivElement;
  private content: HTMLDivElement;
  private swipeGroup: HTMLElement;
  private listEl: HTMLElement;
  private isTicking = false;
  private lastStartIndex = -1;
  private lastEndIndex = -1;
  private readonly rowGap = 6;

  private get stride(): number {
    return this.itemHeight + this.rowGap;
  }

  constructor(options: VirtualPropListOptions) {
    this.container = options.container;
    this.itemHeight = options.itemHeight ?? 66;
    this.overscan = options.overscan ?? 8;
    this.onSelectProp = options.onSelectProp;
    this.onResetProp = options.onResetProp;

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

    this.swipeGroup = document.createElement('m3e-swipe-reveal-group');
    this.listEl = document.createElement('m3e-list');
    this.listEl.setAttribute('variant', 'segmented');
    this.listEl.className = 'props-segmented-list';
    this.swipeGroup.appendChild(this.listEl);
    this.content.appendChild(this.swipeGroup);

    this.container.appendChild(this.spacer);
    this.container.appendChild(this.content);

    this.container.addEventListener('scroll', () => {
      if (!this.isTicking) {
        this.isTicking = true;
        requestAnimationFrame(() => {
          this.render(false);
          this.isTicking = false;
        });
      }
    });

    this.content.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;

      const resetBtn = target.closest<HTMLElement>('.prop-swipe-reset');
      if (resetBtn) {
        event.stopPropagation();
        const key = resetBtn.getAttribute('data-prop-key');
        const prop = key ? this.filteredProps.find((p) => p.key === key) : undefined;
        if (prop && this.onResetProp) {
          this.onResetProp(prop);
        }
        return;
      }

      const editBtn = target.closest<HTMLElement>('.prop-swipe-edit');
      if (editBtn) {
        event.stopPropagation();
        const key = editBtn.getAttribute('data-prop-key');
        const prop = key ? this.filteredProps.find((p) => p.key === key) : undefined;
        if (prop) this.onSelectProp(prop);
        return;
      }

      const row = target.closest<HTMLElement>('.prop-row');
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

    if (this.filterMode === 'modified') {
      result = result.filter((p) => p.isModified);
    } else if (this.filterMode === 'boot') {
      result = result.filter((p) => p.applyBoot);
    }

    if (this.searchTerm) {
      result = result.filter(
        (p) =>
          p.key.toLowerCase().includes(this.searchTerm) ||
          p.value.toLowerCase().includes(this.searchTerm)
      );
    }

    this.filteredProps = result;
    this.lastStartIndex = -1;
    this.lastEndIndex = -1;

    const totalHeight = result.length > 0 ? result.length * this.stride - this.rowGap : 0;
    this.spacer.style.height = `${totalHeight}px`;

    this.render(true);
  }

  private render(force = false): void {
    const total = this.filteredProps.length;
    if (total === 0) {
      this.content.style.transform = 'translateY(0px)';
      const emptyMsg =
        this.searchTerm || this.filterMode !== 'all'
          ? 'No properties match the current filter or search.'
          : 'No system properties available.';
      this.listEl.innerHTML = `
        <div class="grid-placeholder">
          ${escapeHtml(emptyMsg)}
        </div>
      `;
      return;
    }

    const scrollTop = this.container.scrollTop;
    const clientHeight = this.container.clientHeight || 400;

    const rawStart = Math.floor(scrollTop / this.stride);
    const rawEnd = Math.ceil((scrollTop + clientHeight) / this.stride);
    const startIndex = Math.max(0, rawStart - this.overscan);
    const endIndex = Math.min(total, Math.max(startIndex, rawEnd + this.overscan));

    if (
      !force &&
      this.lastStartIndex >= 0 &&
      rawStart >= this.lastStartIndex &&
      rawEnd <= this.lastEndIndex
    ) {
      return;
    }

    this.lastStartIndex = startIndex;
    this.lastEndIndex = endIndex;

    const visibleItems = this.filteredProps.slice(startIndex, endIndex);
    const offsetY = startIndex * this.stride;

    this.content.style.transform = `translateY(${offsetY}px)`;

    const itemsHtml = visibleItems
      .map((prop) => {
        const escapedKey = escapeHtml(prop.key);
        const highlightedKey = highlightMatch(prop.key, this.searchTerm);
        const escapedVal = escapeHtml(prop.value || '(empty)');
        const valTitle = escapeHtml(prop.value || '');

        let badges = '';
        if (prop.isReadOnly) {
          badges += '<m3e-badge size="large" class="m3e-tag-ro">RO</m3e-badge>';
        }
        if (prop.isCustom) {
          badges += '<m3e-badge size="large" class="m3e-tag-custom">Custom</m3e-badge>';
        }
        if (prop.isModified) {
          badges += '<m3e-badge size="large" class="m3e-tag-modified">Modified</m3e-badge>';
        }
        if (prop.applyBoot) {
          badges += '<m3e-badge size="large" class="m3e-tag-boot">Boot</m3e-badge>';
        }

        const resetAction =
          prop.isModified || prop.applyBoot
            ? `<m3e-icon-button slot="trailing" class="prop-swipe-reset" data-prop-key="${escapedKey}" variant="filled" aria-label="Reset property">
                 <m3e-icon name="restart_alt"></m3e-icon>
               </m3e-icon-button>`
            : '';

        return `
          <m3e-swipe-reveal style="height: ${this.itemHeight}px;">
            <m3e-list-action class="prop-row" data-prop-key="${escapedKey}" style="height: ${this.itemHeight}px;">
              ${highlightedKey}
              <span slot="supporting-text" title="${valTitle}">${escapedVal}</span>
              <div slot="trailing" class="prop-badges">${badges}</div>
            </m3e-list-action>
            <m3e-icon-button slot="trailing" class="prop-swipe-edit" data-prop-key="${escapedKey}" variant="tonal" aria-label="Edit property">
              <m3e-icon name="tune"></m3e-icon>
            </m3e-icon-button>
            ${resetAction}
          </m3e-swipe-reveal>
        `;
      })
      .join('');

    this.listEl.innerHTML = itemsHtml;
  }
}
