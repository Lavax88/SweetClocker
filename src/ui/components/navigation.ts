import type { M3eNavBarElement, M3eNavItemElement } from '@m3e/web/nav-bar';
import type { M3eSlideElement } from '@m3e/web/core';
import type { M3eAppBarElement } from '@m3e/web/app-bar';
import { detectGesture, phase } from '@m3e/web/gestures';
import { pan } from '@m3e/web/gestures/pan';
import { store, type AppTab } from '../../state/store';

export const TAB_ORDER: AppTab[] = [
  'page-dashboard',
  'page-tuning',
  'page-logs',
  'page-preferences'
];

const navItemSheet = new CSSStyleSheet();
navItemSheet.replaceSync(`
  :host(:is(:state(--vertical), :--vertical)) .outer {
    align-items: center !important;
  }
  .inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  :host(:is(:state(--vertical), :--vertical)) .base {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
    row-gap: 0 !important;
    transition: transform 360ms cubic-bezier(0.2, 0, 0, 1),
                row-gap 360ms cubic-bezier(0.2, 0, 0, 1);
  }
  :host(:is(:state(--vertical), :--vertical)[selected]) .base {
    row-gap: 4px !important;
  }
  :host(:is(:state(--vertical), :--vertical)) .indicator {
    top: 0 !important;
  }
  .label {
    max-height: 0;
    opacity: 0;
    overflow: hidden;
    transform: translateY(4px);
    transition: max-height 360ms cubic-bezier(0.2, 0, 0, 1),
                opacity 320ms cubic-bezier(0.2, 0, 0, 1),
                transform 360ms cubic-bezier(0.2, 0, 0, 1);
  }
  :host([selected]) .label {
    max-height: 20px;
    opacity: 1;
    transform: translateY(0);
  }
`);

function enhanceNavItems(): void {
  customElements.whenDefined('m3e-nav-item').then(() => {
    document.querySelectorAll<M3eNavItemElement>('m3e-nav-item').forEach((item) => {
      const sr = item.shadowRoot;
      if (sr && !sr.adoptedStyleSheets.includes(navItemSheet)) {
        sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, navItemSheet];
      }
    });
  });
}

export function initNavigation(onSelectTab: (tab: AppTab) => void): () => void {
  const navBar = document.getElementById('main-nav-bar') as M3eNavBarElement | null;
  const pager = document.getElementById('main-pager') as M3eSlideElement | null;

  enhanceNavItems();

  if (navBar) {
    navBar.addEventListener('change', () => {
      const selected = navBar.selected as M3eNavItemElement | null;
      const target = selected?.getAttribute('data-target') as AppTab | null;
      if (target) {
        onSelectTab(target);
      }
    });
  }

  if (!pager) {
    return () => {};
  }

  let isDragging = false;
  let startX = 0;
  let lastDx = 0;
  let dragWidth = 400;
  let dragIdx = 0;
  let activeEl: HTMLElement | null = null;
  let prevEl: HTMLElement | null = null;
  let nextEl: HTMLElement | null = null;
  let snapTimer: ReturnType<typeof setTimeout> | null = null;

  const clearSnapTimer = () => {
    if (snapTimer !== null) {
      clearTimeout(snapTimer);
      snapTimer = null;
    }
  };

  const resetDragStyles = (animateBack = false) => {
    clearSnapTimer();
    const els = [activeEl, prevEl, nextEl].filter((el): el is HTMLElement => Boolean(el));
    if (animateBack && els.length > 0) {
      els.forEach((el) => {
        el.style.transition = 'transform 220ms cubic-bezier(0.2, 0, 0, 1)';
        el.style.transform = 'translateX(0px)';
      });
      snapTimer = setTimeout(() => {
        snapTimer = null;
        pager.style.removeProperty('--m3e-slide-animation-duration');
        els.forEach((el) => {
          el.style.removeProperty('transition');
          el.style.removeProperty('transform');
          el.style.removeProperty('visibility');
        });
      }, 230);
    } else {
      pager.style.removeProperty('--m3e-slide-animation-duration');
      els.forEach((el) => {
        el.style.removeProperty('transition');
        el.style.removeProperty('transform');
        el.style.removeProperty('visibility');
      });
    }
    activeEl = null;
    prevEl = null;
    nextEl = null;
  };

  const controller = detectGesture(
    pager,
    pan(
      phase({
        onStart: (detail) => {
          if (detail.axis !== 'x') return;
          if (store.get('currentTuningSubView') !== 'hub') return;
          if (document.querySelector('m3e-bottom-sheet[open], m3e-dialog[open]')) return;

          const currentTab = store.get('activeTab');
          const idx = TAB_ORDER.indexOf(currentTab);
          if (idx === -1) return;

          clearSnapTimer();
          isDragging = true;
          startX = detail.clientX;
          lastDx = 0;
          dragWidth = pager.clientWidth || window.innerWidth || 400;
          dragIdx = idx;

          activeEl = document.getElementById(TAB_ORDER[idx]!);
          prevEl = idx > 0 ? document.getElementById(TAB_ORDER[idx - 1]!) : null;
          nextEl = idx < TAB_ORDER.length - 1 ? document.getElementById(TAB_ORDER[idx + 1]!) : null;

          pager.style.setProperty('--m3e-slide-animation-duration', '0ms');
          [activeEl, prevEl, nextEl].forEach((el) => {
            if (el) el.style.transition = 'none';
          });
        },
        onUpdate: (detail) => {
          if (!isDragging) return;
          let dx = detail.clientX - startX;
          if ((dragIdx === 0 && dx > 0) || (dragIdx === TAB_ORDER.length - 1 && dx < 0)) {
            dx *= 0.25;
          }
          lastDx = dx;

          if (activeEl) activeEl.style.transform = `translateX(${dx}px)`;
          if (prevEl) {
            prevEl.style.visibility = dx > 0 ? 'visible' : '';
            prevEl.style.transform = `translateX(${dx}px)`;
          }
          if (nextEl) {
            nextEl.style.visibility = dx < 0 ? 'visible' : '';
            nextEl.style.transform = `translateX(${dx}px)`;
          }
        },
        onEnd: (detail) => {
          if (!isDragging) return;
          isDragging = false;

          const vx = detail.velocityX ?? 0;
          const shouldAdvance = Math.abs(lastDx) > dragWidth * 0.22 || Math.abs(vx) > 0.25;

          if (shouldAdvance && lastDx < 0 && dragIdx < TAB_ORDER.length - 1) {
            resetDragStyles(false);
            const nextTab = TAB_ORDER[dragIdx + 1];
            if (nextTab) onSelectTab(nextTab);
          } else if (shouldAdvance && lastDx > 0 && dragIdx > 0) {
            resetDragStyles(false);
            const prevTab = TAB_ORDER[dragIdx - 1];
            if (prevTab) onSelectTab(prevTab);
          } else {
            resetDragStyles(true);
          }
        },
        onCancel: () => {
          if (!isDragging) return;
          isDragging = false;
          resetDragStyles(true);
        }
      }),
      {
        activationMode: 'press',
        minDisplacement: 8,
        lockAxis: 'auto',
        axisThreshold: 8,
        inputFilter: (input) => {
          const target = input.target as HTMLElement | null;
          if (!target) return true;
          if (store.get('currentTuningSubView') !== 'hub') return false;
          if (target.closest('m3e-bottom-sheet, m3e-dialog, m3e-swipe-reveal, input, textarea, m3e-slider')) {
            return false;
          }
          return true;
        }
      }
    )
  );

  return () => {
    controller.destroy();
  };
}

export function syncNavigationState(target: AppTab): void {
  const idx = TAB_ORDER.indexOf(target);
  if (idx === -1) return;

  const pager = document.getElementById('main-pager') as M3eSlideElement | null;
  if (pager) {
    pager.selectedIndex = idx;
  }

  const navBar = document.getElementById('main-nav-bar') as M3eNavBarElement | null;
  if (navBar) {
    navBar.items.forEach((item, i) => {
      item.selected = i === idx;
    });
  }

  const appBar = document.getElementById('main-app-bar') as M3eAppBarElement | null;
  const activePage = document.getElementById(target);
  if (appBar && activePage) {
    appBar.attach(activePage);
  }
}
