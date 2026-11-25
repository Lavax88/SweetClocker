import type { M3eBottomSheetElement } from '@m3e/web/bottom-sheet';
import type { M3eDialogElement } from '@m3e/web/dialog';
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
import { initGpuWarningDialog, initApplyBootDialog } from './components/dialog';
import { initNavigation, syncNavigationState } from './components/navigation';

export async function initApp(): Promise<void> {
  // 1. Initialize M3E Theme & Modes
  await initTheme();

  // 2. Fetch Device Model metadata
  try {
    const { errno, stdout } = await exec('getprop ro.product.model');
    if (errno === 0 && stdout) {
      store.set('deviceModel', stdout.trim());
    }
  } catch (err) {
    console.warn('Failed to query device model:', err);
  }

  // 3. Initialize Component Listeners
  initGpuWarningDialog();
  initApplyBootDialog();
  initNavigation((target) => selectTab(target));
  initPreferencesScreen();
  initLogsScreen();
  initTuningScreen();

  // Ensure initial navigation & app-bar attachment
  syncNavigationState(store.get('activeTab'));

  // 4. Refresh Button Listener
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      toast('Refreshing data...');
      await triggerImmediateUpdate();
    });
  }

  // 5. Top App Bar Subview Back Button
  const subviewBackBtn = document.getElementById('subview-back-btn');
  if (subviewBackBtn) {
    subviewBackBtn.addEventListener('click', () => {
      if (history.state?.subview) {
        history.back();
      } else {
        showTuningSubView('hub', false);
      }
    });
  }

  // 6. Android System Back Gesture (popstate)
  window.addEventListener('popstate', () => {
    const openSheet = document.querySelector<M3eBottomSheetElement>('m3e-bottom-sheet[open]');
    if (openSheet) {
      openSheet.hide();
      return;
    }

    const openDialog = document.querySelector<M3eDialogElement>('m3e-dialog[open]');
    if (openDialog) {
      openDialog.hide('cancel');
      return;
    }

    const currentSub = store.get('currentTuningSubView');
    if (currentSub !== 'hub') {
      showTuningSubView('hub', false);
    }
  });

  // 7. Connect State Store to Dashboard & Tuning renderers
  store.subscribe('telemetry', (data) => {
    if (!data) return;
    const activeTab = store.get('activeTab');
    if (activeTab === 'page-dashboard') {
      renderDashboard(data);
    } else if (activeTab === 'page-tuning') {
      renderTuningViewWithData(data);
    }
  });

  // 8. Start Telemetry Sampler with Polling Discipline
  startActiveTabPolling(store.get('activeTab'));
}

function startActiveTabPolling(tab: AppTab): void {
  if (tab === 'page-dashboard' || tab === 'page-tuning') {
    startSampler((snapshot) => {
      store.set('telemetry', snapshot);
    });
  } else {
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

export function selectTab(target: AppTab): void {
  const currentTab = store.get('activeTab');
  if (target === currentTab) {
    if (target === 'page-tuning' && store.get('currentTuningSubView') !== 'hub') {
      showTuningSubView('hub', false);
    }
    syncNavigationState(target);
    return;
  }

  if (history.state?.subview) {
    try {
      history.replaceState(null, '');
    } catch (_) {}
  }

  const pages = document.querySelectorAll<HTMLElement>('.page-section');
  pages.forEach((p) => {
    p.classList.toggle('active', p.id === target);
  });

  const fabContainer = document.getElementById('tuning-fab-container');
  const logsFab = document.getElementById('logs-fab-container');
  const propsFab = document.getElementById('props-fab-container');

  if (target === 'page-tuning') {
    showTuningSubView('hub', false);
    if (logsFab) logsFab.style.display = 'none';
    if (propsFab) propsFab.style.display = 'none';
  } else {
    if (store.get('currentTuningSubView') !== 'hub') {
      showTuningSubView('hub', false);
    }
    if (fabContainer) fabContainer.style.display = 'none';
    if (propsFab) propsFab.style.display = 'none';
    if (logsFab) logsFab.style.display = target === 'page-logs' ? 'flex' : 'none';
  }

  store.set('activeTab', target);
  syncNavigationState(target);
  startActiveTabPolling(target);
}
