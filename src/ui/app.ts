import { initTheme } from '../theme/theme';
import { exec, toast } from '../bridge/ksu';
import { startSampler, stopSampler, sampleOnce } from '../telemetry/sampler';
import { store, type AppTab } from '../state/store';
import { renderDashboard } from './screens/dashboard';
import {
  initTuningScreen,
  renderTuningViewWithData,
  showTuningSubView
} from './screens/tuning';
import { initLogsScreen, updateLogsView } from './screens/logs';
import { initPreferencesScreen } from './screens/preferences';
import {
  initGpuWarningDialog,
  hideGpuWarningDialog,
  initApplyBootDialog,
  hideApplyBootDialog
} from './components/dialog';
import { initFloatingNav, type FloatingNavController } from './components/floatingNav';

export async function initApp(): Promise<void> {
  // 1. Initialize Theme & Modes
  await initTheme();

  // 2. Fetch Device Model metadata
  try {
    const { errno, stdout } = await exec('getprop ro.product.model');
    const modelText = document.getElementById('device-model');
    if (modelText && errno === 0 && stdout) {
      const model = stdout.trim();
      modelText.innerText = model;
      store.set('deviceModel', model);
    }
  } catch (err) {
    console.warn('Failed to query device model:', err);
  }

  // 3. Initialize Component Listeners
  initGpuWarningDialog();
  initApplyBootDialog();
  setupNavigation();
  initPreferencesScreen();
  initLogsScreen();
  initTuningScreen();

  // 4. Refresh Button Listener
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      toast('Refreshing data...');
      await triggerImmediateUpdate();
    });
  }

  // 5. Android System Back Gesture (popstate)
  window.addEventListener('popstate', () => {
    const freqBackdrop = document.getElementById('freq-sheet-backdrop');
    const govBackdrop = document.getElementById('gov-sheet-backdrop');
    const gpuWarningBackdrop = document.getElementById('gpu-warning-dialog-backdrop');
    const applyBootBackdrop = document.getElementById('apply-boot-dialog-backdrop');

    if (freqBackdrop?.classList.contains('active')) {
      freqBackdrop.classList.remove('active');
      return;
    }
    if (govBackdrop?.classList.contains('active')) {
      govBackdrop.classList.remove('active');
      return;
    }
    if (gpuWarningBackdrop?.classList.contains('active')) {
      hideGpuWarningDialog();
      return;
    }
    if (applyBootBackdrop?.classList.contains('active')) {
      hideApplyBootDialog(null);
      return;
    }

    const currentSub = store.get('currentTuningSubView');
    if (
      currentSub === 'cpu-clocks' ||
      currentSub === 'gpu-clocks' ||
      currentSub === 'io-management' ||
      currentSub === 'net-management'
    ) {
      showTuningSubView('hub', false);
    }
  });

  // 6. Connect State Store to Dashboard & Tuning renderers
  store.subscribe('telemetry', (data) => {
    if (!data) return;
    const activeTab = store.get('activeTab');
    if (activeTab === 'page-dashboard') {
      renderDashboard(data);
    } else if (activeTab === 'page-tuning') {
      renderTuningViewWithData(data);
    }
  });

  // 7. Start Telemetry Sampler with Polling Discipline
  startActiveTabPolling(store.get('activeTab'));
}

function startActiveTabPolling(tab: AppTab): void {
  if (tab === 'page-dashboard' || tab === 'page-tuning') {
    startSampler((snapshot) => {
      store.set('telemetry', snapshot);
    });
  } else {
    // Polling discipline: stop sampling when on Logs or Preferences
    stopSampler();
  }

  if (tab === 'page-logs') {
    updateLogsView();
  }
}

async function triggerImmediateUpdate(): Promise<void> {
  const activeTab = store.get('activeTab');
  if (activeTab === 'page-dashboard' || activeTab === 'page-tuning') {
    const snapshot = await sampleOnce();
    if (snapshot) store.set('telemetry', snapshot);
  } else if (activeTab === 'page-logs') {
    await updateLogsView();
  }
}

let floatingNavController: FloatingNavController | null = null;

export function selectTab(target: AppTab): void {
  const currentTab = store.get('activeTab');
  if (target === currentTab) {
    if (target === 'page-tuning' && store.get('currentTuningSubView') !== 'hub') {
      showTuningSubView('hub', false);
    }
    return;
  }

  // Clear any subview history state
  if (history.state?.subview) {
    try {
      history.replaceState(null, '');
    } catch (e) {}
  }

  // 1. Immediately update visual classes
  const navTabs = document.querySelectorAll<HTMLElement>('.nav-tab');
  const pages = document.querySelectorAll<HTMLElement>('.page-section');
  const fabContainer = document.getElementById('tuning-fab-container');
  const logsFab = document.getElementById('logs-fab-container');

  navTabs.forEach((t) => {
    const isTarget = t.getAttribute('data-target') === target;
    t.classList.toggle('active', isTarget);
  });

  pages.forEach((p) => p.classList.remove('active'));
  const targetPage = document.getElementById(target);
  if (targetPage) targetPage.classList.add('active');

  if (target === 'page-tuning') {
    showTuningSubView('hub', false);
    logsFab?.classList.remove('fab-visible');
  } else if (target === 'page-logs') {
    fabContainer?.classList.remove('fab-visible');
    logsFab?.classList.add('fab-visible');
  } else {
    fabContainer?.classList.remove('fab-visible');
    logsFab?.classList.remove('fab-visible');
  }

  store.set('activeTab', target);

  // 2. Adjust polling discipline
  startActiveTabPolling(target);

  // 3. Update floating highlighter position smoothly
  floatingNavController?.updatePosition(false);
}

function setupNavigation(): void {
  const navTabs = document.querySelectorAll<HTMLElement>('.nav-tab');

  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-target') as AppTab | null;
      if (target) selectTab(target);
    });
  });

  floatingNavController = initFloatingNav((target) => {
    selectTab(target);
  });
}
