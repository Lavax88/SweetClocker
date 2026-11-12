import { store, type AppTab } from '../../state/store';

export const TAB_ORDER: AppTab[] = [
  'page-dashboard',
  'page-tuning',
  'page-logs',
  'page-preferences'
];

export interface PageSwipeOptions {
  onSettle: (tab: AppTab) => void;
  onAnimateHighlighter: (tab: AppTab) => void;
  onProgress: (fromTab: AppTab, toTab: AppTab, progress: number) => void;
  onOverscroll: (overscrollPx: number) => void;
  onResetSprings: () => void;
}

let activeSlideToTab: ((targetTab: AppTab, immediate?: boolean) => void) | null = null;

export function slideToTab(targetTab: AppTab, immediate = false): void {
  if (activeSlideToTab) {
    activeSlideToTab(targetTab, immediate);
  }
}

export function initPageSwipe(options: PageSwipeOptions): () => void {
  const container = document.getElementById('viewpager-container');
  const track = document.getElementById('viewpager-track');
  if (!container || !track) return () => {};

  let isPointerDown = false;
  let isTracking = false;
  let gestureType: 'none' | 'horizontal' | 'vertical' = 'none';
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0;
  let currentDeltaX = 0;

  function moveToTab(targetTab: AppTab, immediate = false) {
    if (!track || !container) return;
    const targetIndex = TAB_ORDER.indexOf(targetTab);
    if (targetIndex === -1) return;

    const width = container.offsetWidth;
    const targetOffset = -targetIndex * width;

    if (immediate) {
      track.style.transition = 'none';
      track.style.transform = `translate3d(${targetOffset}px, 0, 0)`;
      return;
    }

    track.style.transition = 'transform 0.38s cubic-bezier(0.28, 1.18, 0.5, 1)';
    track.style.transform = `translate3d(${targetOffset}px, 0, 0)`;
    setTimeout(() => {
      if (!isPointerDown && track) {
        track.style.transition = '';
      }
    }, 400);
  }

  activeSlideToTab = moveToTab;

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;

    // 1. Skip when inside tuning subview (CPU/GPU clocks, IO, Net)
    if (store.get('currentTuningSubView') !== 'hub') {
      isPointerDown = false;
      isTracking = false;
      gestureType = 'none';
      return;
    }

    const target = e.target as HTMLElement | null;
    if (!target) return;

    // 2. Skip modal overlays and true horizontal sliders
    if (
      target.closest(
        '.m3-bottom-sheet, .m3-dialog, .m3-sheet-backdrop, .m3-dialog-backdrop, input[type="range"]'
      )
    ) {
      isPointerDown = false;
      isTracking = false;
      gestureType = 'none';
      return;
    }

    const touch = e.touches[0];
    if (!touch) return;

    if (track) {
      track.style.transition = 'none';
    }

    isPointerDown = true;
    isTracking = true;
    gestureType = 'none';
    startX = touch.clientX;
    startY = touch.clientY;
    lastX = touch.clientX;
    lastTime = performance.now();
    velocity = 0;
    currentDeltaX = 0;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isTracking || !isPointerDown || e.touches.length !== 1) return;

    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    const now = performance.now();
    const dt = Math.max(1, now - lastTime);
    const instantVelocity = (touch.clientX - lastX) / dt;
    velocity = velocity * 0.65 + instantVelocity * 0.35;
    lastX = touch.clientX;
    lastTime = now;

    // 3. Slope check on initial drag
    if (gestureType === 'none') {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (absX > 8 || absY > 8) {
        if (absX > absY * 1.2) {
          gestureType = 'horizontal';
          document.querySelector('.bottom-nav')?.classList.add('nav-swiping');
        } else {
          // Vertical dominant -> surrender gesture to native vertical scroll
          gestureType = 'vertical';
          isTracking = false;
          return;
        }
      } else {
        return;
      }
    }

    if (gestureType !== 'horizontal') return;

    // Lock horizontal gesture: prevent native vertical scrolling while swiping
    if (e.cancelable) e.preventDefault();

    const containerWidth = container!.offsetWidth;
    const currentTab = store.get('activeTab');
    const currentIndex = TAB_ORDER.indexOf(currentTab);

    // 4. Elastic rubber-band resistance at boundaries
    let effectiveDeltaX = dx;
    let isOverscrolling = false;

    if (currentIndex === 0 && dx > 0) {
      isOverscrolling = true;
      effectiveDeltaX = Math.pow(dx, 0.78) * 1.8;
    } else if (currentIndex === TAB_ORDER.length - 1 && dx < 0) {
      isOverscrolling = true;
      effectiveDeltaX = -Math.pow(Math.abs(dx), 0.78) * 1.8;
    }

    currentDeltaX = effectiveDeltaX;

    // 5. Update ViewPager track live
    const baseOffset = -currentIndex * containerWidth;
    track!.style.transition = 'none';
    track!.style.transform = `translate3d(${baseOffset + effectiveDeltaX}px, 0, 0)`;

    // 6. Update Floating Navbar live
    if (isOverscrolling) {
      options.onOverscroll(effectiveDeltaX);
    } else {
      options.onOverscroll(0);
      const fromTab = TAB_ORDER[currentIndex] || currentTab;
      let toTab: AppTab = fromTab;
      let progress = 0;

      if (dx < 0 && currentIndex < TAB_ORDER.length - 1) {
        toTab = TAB_ORDER[currentIndex + 1] ?? fromTab;
        progress = Math.min(1, Math.abs(dx) / containerWidth);
      } else if (dx > 0 && currentIndex > 0) {
        toTab = TAB_ORDER[currentIndex - 1] ?? fromTab;
        progress = Math.min(1, Math.abs(dx) / containerWidth);
      }

      options.onProgress(fromTab, toTab, progress);
    }
  }

  function handleTouchEnd() {
    document.querySelector('.bottom-nav')?.classList.remove('nav-swiping');

    if (!isPointerDown) return;
    isPointerDown = false;

    if (gestureType !== 'horizontal') {
      isTracking = false;
      gestureType = 'none';
      options.onResetSprings();
      return;
    }

    isTracking = false;
    gestureType = 'none';

    const containerWidth = container!.offsetWidth;
    const currentTab = store.get('activeTab');
    const currentIndex = TAB_ORDER.indexOf(currentTab);

    const dx = currentDeltaX;
    const isFlick = Math.abs(velocity) > 0.35;
    const distanceThreshold = containerWidth * 0.35;

    let targetIndex = currentIndex;

    if (currentIndex === 0 && dx > 0) {
      // Release from left boundary overscroll
      targetIndex = 0;
    } else if (currentIndex === TAB_ORDER.length - 1 && dx < 0) {
      // Release from right boundary overscroll
      targetIndex = TAB_ORDER.length - 1;
    } else if (isFlick) {
      // Quick flick takes priority
      if (velocity < -0.35 && currentIndex < TAB_ORDER.length - 1) {
        targetIndex = currentIndex + 1;
      } else if (velocity > 0.35 && currentIndex > 0) {
        targetIndex = currentIndex - 1;
      }
    } else if (Math.abs(dx) > distanceThreshold) {
      // Drag distance exceeded 35%
      if (dx < 0 && currentIndex < TAB_ORDER.length - 1) {
        targetIndex = currentIndex + 1;
      } else if (dx > 0 && currentIndex > 0) {
        targetIndex = currentIndex - 1;
      }
    }

    const targetTab = TAB_ORDER[targetIndex] || currentTab;

    // 1. Immediately animate highlighter to target tab in sync with track
    options.onAnimateHighlighter(targetTab);

    // 2. Animate track to target tab
    track!.style.transition = 'transform 0.35s cubic-bezier(0.28, 1.18, 0.5, 1)';
    track!.style.transform = `translate3d(${-targetIndex * containerWidth}px, 0, 0)`;

    // 3. Spring capsule back to rest
    options.onResetSprings();

    // 4. Update store and active classes immediately so next gesture knows state
    options.onSettle(targetTab);

    setTimeout(() => {
      if (!isPointerDown && track) track.style.transition = '';
    }, 360);
  }

  function handleTouchCancel() {
    document.querySelector('.bottom-nav')?.classList.remove('nav-swiping');
    if (!isPointerDown) return;
    isPointerDown = false;
    isTracking = false;
    gestureType = 'none';

    const currentTab = store.get('activeTab');
    const currentIndex = TAB_ORDER.indexOf(currentTab);
    const containerWidth = container!.offsetWidth;

    track!.style.transition = 'transform 0.35s cubic-bezier(0.28, 1.18, 0.5, 1)';
    track!.style.transform = `translate3d(${-currentIndex * containerWidth}px, 0, 0)`;
    options.onAnimateHighlighter(currentTab);
    options.onResetSprings();

    setTimeout(() => {
      if (!isPointerDown && track) track.style.transition = '';
    }, 360);
  }

  container.addEventListener('touchstart', handleTouchStart, { passive: true });
  container.addEventListener('touchmove', handleTouchMove, { passive: false });
  container.addEventListener('touchend', handleTouchEnd, { passive: true });
  container.addEventListener('touchcancel', handleTouchCancel, { passive: true });

  const handleResize = () => {
    const activeTab = store.get('activeTab');
    moveToTab(activeTab, true);
  };
  window.addEventListener('resize', handleResize);

  return () => {
    container.removeEventListener('touchstart', handleTouchStart);
    container.removeEventListener('touchmove', handleTouchMove);
    container.removeEventListener('touchend', handleTouchEnd);
    container.removeEventListener('touchcancel', handleTouchCancel);
    window.removeEventListener('resize', handleResize);
    activeSlideToTab = null;
  };
}
