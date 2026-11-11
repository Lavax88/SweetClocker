import { store, type AppTab } from '../../state/store';

const TAB_ORDER: AppTab[] = [
  'page-dashboard',
  'page-tuning',
  'page-logs',
  'page-preferences'
];

function getTabMetrics(bottomNav: HTMLElement | null, tab: AppTab): number {
  if (bottomNav) {
    const el = bottomNav.querySelector<HTMLElement>(`.nav-tab[data-target="${tab}"]`);
    if (el && el.classList.contains('active')) {
      const w = el.getBoundingClientRect().width;
      if (w > 50) return Math.round(w);
    }
  }
  switch (tab) {
    case 'page-preferences': return 144;
    case 'page-tuning': return 114;
    case 'page-dashboard': return 106;
    case 'page-logs': return 102;
    default: return 100;
  }
}

function computeOverscrollSquash(overscroll: number) {
  const compression = Math.min(0.26, Math.abs(overscroll) / 160);
  const scaleX = Math.max(0.74, 1 - compression);
  const scaleY = 1 / Math.sqrt(scaleX);
  return {
    finalScaleX: scaleX,
    finalScaleY: scaleY,
    finalSkew: 0
  };
}

export interface FloatingNavController {
  updatePosition: (immediate?: boolean) => void;
  destroy: () => void;
}

export function initFloatingNav(
  onSelectTab: (tab: AppTab) => void
): FloatingNavController {
  const bottomNav = document.querySelector<HTMLElement>('.bottom-nav');
  const highlighter = document.getElementById('nav-highlighter');

  if (!bottomNav || !highlighter) {
    return {
      updatePosition: () => {},
      destroy: () => {}
    };
  }

  let isPointerDown = false;
  let isDragging = false;
  let pointerTarget: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0;
  let currentPreviewTab: AppTab | null = null;
  let isFloatingActive = document.documentElement.classList.contains('nav-floating');

  function resetCapsuleSpring() {
    if (!bottomNav) return;
    bottomNav.style.transition = 'transform 0.44s cubic-bezier(0.34, 1.56, 0.64, 1)';
    bottomNav.style.transform = 'translateX(-50%) scale(1)';
    setTimeout(() => {
      if (!isDragging && bottomNav) {
        bottomNav.style.transition = '';
      }
    }, 440);
  }

  function calculateTabSlots(activeTab: AppTab) {
    const navRect = bottomNav!.getBoundingClientRect();
    const navWidth = navRect.width;
    const activeWidth = getTabMetrics(bottomNav, activeTab);
    const totalTabsWidth = activeWidth + 3 * 48;
    const innerWidth = Math.max(0, navWidth - 12); // 6px padding on each side
    const availableSpace = Math.max(0, innerWidth - totalTabsWidth);
    const space = availableSpace / 3;

    const slots = {} as Record<AppTab, { left: number; width: number; center: number }>;

    let currentX = 6;
    for (let i = 0; i < TAB_ORDER.length; i++) {
      const tab = TAB_ORDER[i];
      if (!tab) continue;
      const isThisActive = tab === activeTab;
      const width = isThisActive ? getTabMetrics(bottomNav, tab) : 48;

      let left: number;
      if (i === 0) {
        left = 6;
      } else if (i === TAB_ORDER.length - 1) {
        left = Math.max(6, navWidth - 6 - width);
      } else {
        left = currentX;
      }

      slots[tab] = {
        left,
        width,
        center: left + width / 2
      };

      currentX = left + width + space;
    }

    return { navWidth, slots };
  }

  function snapToActiveTab(immediate = false) {
    if (!isFloatingActive || isDragging) return;

    const activeTab = (store.get('activeTab') as AppTab) || 'page-dashboard';
    const { slots } = calculateTabSlots(activeTab);
    const slot = slots[activeTab] || slots['page-dashboard'];

    if (immediate) {
      highlighter!.style.transition = 'none';
    } else {
      highlighter!.style.transition =
        'transform 0.42s cubic-bezier(0.34, 1.45, 0.64, 1), width 0.42s cubic-bezier(0.34, 1.45, 0.64, 1)';
    }

    highlighter!.style.transformOrigin = 'center center';
    highlighter!.style.width = `${slot.width}px`;
    highlighter!.style.transform = `translate3d(${slot.left}px, 0, 0) scaleX(1) scaleY(1) skewX(0deg)`;
  }

  function getClosestTab(touchX: number, activeTabForGeometry: AppTab): AppTab {
    const { slots } = calculateTabSlots(activeTabForGeometry);
    let closestTab: AppTab = 'page-dashboard';
    let minDistance = Infinity;

    for (const tab of TAB_ORDER) {
      if (!tab || !slots[tab]) continue;
      const dist = Math.abs(touchX - slots[tab].center);
      if (dist < minDistance) {
        minDistance = dist;
        closestTab = tab;
      }
    }

    return closestTab;
  }

  function setPreviewActiveTab(tab: AppTab) {
    const navTabs = bottomNav!.querySelectorAll<HTMLElement>('.nav-tab');
    navTabs.forEach((t) => {
      const target = t.getAttribute('data-target') as AppTab | null;
      t.classList.toggle('active', target === tab);
    });
  }

  // Pointer / Touch Drag handlers
  function handlePointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!document.documentElement.classList.contains('nav-floating')) return;

    isPointerDown = true;
    isDragging = false;
    pointerTarget = e.target as HTMLElement;
    startX = e.clientX;
    startY = e.clientY;
    lastX = e.clientX;
    lastTime = performance.now();
    velocity = 0;
    currentPreviewTab = (store.get('activeTab') as AppTab) || 'page-dashboard';

    try {
      if (pointerTarget && pointerTarget.setPointerCapture) {
        pointerTarget.setPointerCapture(e.pointerId);
      }
    } catch (_) {}
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isPointerDown) return;
    if (!document.documentElement.classList.contains('nav-floating')) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    // Distinguish intentional drag from simple tap (6px threshold)
    if (!isDragging) {
      if (Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
        isDragging = true;
        bottomNav!.classList.add('nav-dragging');
      } else {
        return;
      }
    }

    e.preventDefault();

    const now = performance.now();
    const dt = Math.max(1, now - lastTime);
    const instantVelocity = (e.clientX - lastX) / dt;
    velocity = velocity * 0.65 + instantVelocity * 0.35;
    lastX = e.clientX;
    lastTime = now;

    const navRect = bottomNav!.getBoundingClientRect();
    const touchX = e.clientX - navRect.left;

    // Elastic jelly stretch & squash based on drag velocity
    const speed = Math.abs(velocity);
    const baseStretch = Math.min(1.22, 1 + speed * 0.1);
    const squash = 1 / Math.sqrt(baseStretch);
    const skew = Math.max(-5, Math.min(5, -velocity * 1.2));

    // Determine closest tab under current touch position
    const closest = getClosestTab(touchX, currentPreviewTab || 'page-dashboard');
    if (closest !== currentPreviewTab) {
      currentPreviewTab = closest;
      setPreviewActiveTab(closest);
    }

    // 1. Base highlighter metrics
    const baseWidth = getTabMetrics(bottomNav, currentPreviewTab || 'page-dashboard');
    const minLeft = 6;
    const maxLeft = Math.max(minLeft, navRect.width - baseWidth - 6);

    // Theoretical center of finger
    const rawLeft = touchX - baseWidth / 2;

    // 2. Boundary-Anchored Elastic Squash & Containment
    let overscroll = 0;
    let targetLeft = rawLeft;
    let finalScaleX = baseStretch;
    let finalScaleY = squash;
    let finalSkew = skew;
    let transformOrigin = 'center center';

    if (rawLeft < minLeft) {
      overscroll = rawLeft - minLeft; // Negative
      targetLeft = minLeft;
      transformOrigin = 'left center';
      const squashRes = computeOverscrollSquash(overscroll);
      finalScaleX = squashRes.finalScaleX;
      finalScaleY = squashRes.finalScaleY;
      finalSkew = squashRes.finalSkew;
    } else if (rawLeft > maxLeft) {
      overscroll = rawLeft - maxLeft; // Positive
      targetLeft = maxLeft;
      transformOrigin = 'right center';
      const squashRes = computeOverscrollSquash(overscroll);
      finalScaleX = squashRes.finalScaleX;
      finalScaleY = squashRes.finalScaleY;
      finalSkew = squashRes.finalSkew;
    } else {
      transformOrigin = 'center center';
      const halfExpansion = (baseWidth * (baseStretch - 1)) / 2;
      if (targetLeft - halfExpansion < minLeft) {
        targetLeft = minLeft + halfExpansion;
      } else if (targetLeft + baseWidth + halfExpansion > navRect.width - 6) {
        targetLeft = navRect.width - 6 - baseWidth - halfExpansion;
      }
    }

    // 3. Elastic background capsule jelly stretch at the ends
    if (overscroll !== 0) {
      const sign = Math.sign(overscroll);
      const absOver = Math.abs(overscroll);
      const containerDisp = sign * Math.min(28, Math.pow(absOver, 0.72) * 1.5);
      const containerStretch = 1 + Math.min(0.08, Math.abs(containerDisp) / 320);
      const containerSquash = 1 - Math.min(0.04, Math.abs(containerDisp) / 640);

      bottomNav!.style.transition = 'none';
      bottomNav!.style.transform = `translateX(calc(-50% + ${containerDisp}px)) scaleX(${containerStretch}) scaleY(${containerSquash})`;
    } else {
      bottomNav!.style.transition = 'none';
      bottomNav!.style.transform = 'translateX(-50%) scale(1)';
    }

    // 4. Apply hardware-accelerated transform to highlighter
    highlighter!.style.transition = 'none';
    highlighter!.style.transformOrigin = transformOrigin;
    highlighter!.style.width = `${baseWidth}px`;
    highlighter!.style.transform = `translate3d(${targetLeft}px, 0, 0) scaleX(${finalScaleX}) scaleY(${finalScaleY}) skewX(${finalSkew}deg)`;
  }

  function handlePointerUp(e: PointerEvent) {
    if (!isPointerDown) return;
    isPointerDown = false;

    try {
      if (pointerTarget && pointerTarget.releasePointerCapture) {
        pointerTarget.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    resetCapsuleSpring();

    if (isDragging) {
      // Intercept and swallow the synthetic click event that follows pointer release
      bottomNav!.addEventListener(
        'click',
        (clickEvt) => {
          clickEvt.preventDefault();
          clickEvt.stopPropagation();
        },
        { capture: true, once: true }
      );

      isDragging = false;
      bottomNav!.classList.remove('nav-dragging');

      const navRect = bottomNav!.getBoundingClientRect();
      const touchX = e.clientX - navRect.left;
      const targetTab = getClosestTab(touchX, currentPreviewTab || 'page-dashboard');

      onSelectTab(targetTab);
      snapToActiveTab(false);
    } else {
      snapToActiveTab(false);
    }
  }

  function handlePointerCancel(_e: PointerEvent) {
    if (!isPointerDown) return;
    isPointerDown = false;
    isDragging = false;
    bottomNav!.classList.remove('nav-dragging');

    resetCapsuleSpring();
    snapToActiveTab(false);
  }

  // Attach event listeners to bottomNav
  bottomNav.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointermove', handlePointerMove, { passive: false });
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerCancel);

  // Resize / Orientation change listeners
  const handleResize = () => snapToActiveTab(true);
  window.addEventListener('resize', handleResize);

  const handleNavStyleChange = (e: Event) => {
    const customEvt = e as CustomEvent<{ style: string; animate: boolean } | string>;
    const detail = customEvt.detail;
    const style = typeof detail === 'string' ? detail : detail?.style;
    const animate = typeof detail === 'object' && detail?.animate;

    isFloatingActive = style === 'floating';

    if (animate && bottomNav) {
      bottomNav.classList.add('nav-switching');
      setTimeout(() => bottomNav?.classList.remove('nav-switching'), 450);
    }

    if (isFloatingActive) {
      setTimeout(() => snapToActiveTab(true), 50);
    }
  };
  window.addEventListener('nav-style-changed', handleNavStyleChange);

  // Initial positioning
  setTimeout(() => snapToActiveTab(true), 80);

  return {
    updatePosition: (immediate = false) => snapToActiveTab(immediate),
    destroy: () => {
      bottomNav.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('nav-style-changed', handleNavStyleChange);
    }
  };
}
