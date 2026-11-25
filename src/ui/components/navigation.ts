import type { M3eNavBarElement, M3eNavItemElement } from '@m3e/web/nav-bar';
import type { M3eSlideElement } from '@m3e/web/core';
import type { M3eAppBarElement } from '@m3e/web/app-bar';
import { detectGesture, phase } from '@m3e/web/gestures';
import { swipe } from '@m3e/web/gestures/swipe';
import { store, type AppTab } from '../../state/store';

export const TAB_ORDER: AppTab[] = [
  'page-dashboard',
  'page-tuning',
  'page-logs',
  'page-preferences'
];

const navItemSheet = new CSSStyleSheet();
navItemSheet.replaceSync(`
  .inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .base {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition: transform 360ms cubic-bezier(0.2, 0, 0, 1);
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

  const controller = detectGesture(
    pager,
    swipe(
      phase({
        onEnd: (detail) => {
          if (store.get('currentTuningSubView') !== 'hub') return;
          if (document.querySelector('m3e-bottom-sheet[open], m3e-dialog[open]')) return;

          const currentTab = store.get('activeTab');
          const currentIndex = TAB_ORDER.indexOf(currentTab);
          if (currentIndex === -1) return;

          if (detail.direction === 'left' && currentIndex < TAB_ORDER.length - 1) {
            const nextTab = TAB_ORDER[currentIndex + 1];
            if (nextTab) onSelectTab(nextTab);
          } else if (detail.direction === 'right' && currentIndex > 0) {
            const prevTab = TAB_ORDER[currentIndex - 1];
            if (prevTab) onSelectTab(prevTab);
          }
        }
      }),
      {
        directions: ['left', 'right'],
        minDisplacement: 36,
        minVelocity: 0.25,
        directionThreshold: 18,
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
