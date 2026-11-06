import type {
  TelemetrySnapshot,
  IoStats,
  CpuConfigLimits,
  GpuConfigLimits
} from '../../telemetry/types';
import {
  applyCpuConfig,
  applyGpuConfig,
  applyIoConfig,
  resetGpuConfig,
  resetIoConfig,
  resetToSweetclocks,
  getIoStats,
  sampleOnce
} from '../../telemetry/sampler';
import { toast } from '../../bridge/ksu';
import { formatFreqMHz } from '../formatters';
import { showGpuWarningDialog } from '../components/dialog';
import { store, type TuningSubView } from '../../state/store';

export interface ClusterConfig {
  id: string;
  name: string;
  clusterLabel: string;
  policy: string;
  cpus: number[];
  sweetclockMax: number;
  defaultMin: number;
  fallbackHwMax: number;
  fallbackAvail: number[];
}

export const CLUSTERS_CONFIG: ClusterConfig[] = [
  {
    id: 'cluster-0',
    name: 'Cluster 0 (CPUs 0-1)',
    clusterLabel: 'LITTLE',
    policy: 'policy0',
    cpus: [0, 1],
    sweetclockMax: 1286400,
    defaultMin: 364800,
    fallbackHwMax: 2016000,
    fallbackAvail: [
      364800, 441600, 614400, 748800, 883200, 979200, 1075200, 1190400, 1286400, 1401600,
      1516800, 1632000, 1785600, 1900800, 2016000
    ]
  },
  {
    id: 'cluster-1',
    name: 'Cluster 1 (CPUs 2-4)',
    clusterLabel: 'BIG 1',
    policy: 'policy2',
    cpus: [2, 3, 4],
    sweetclockMax: 1920000,
    defaultMin: 480000,
    fallbackHwMax: 3014400,
    fallbackAvail: [
      480000, 633600, 787200, 940800, 1056000, 1190400, 1286400, 1401600, 1516800, 1632000,
      1728000, 1824000, 1920000, 2073600, 2208000, 2323200, 2438400, 2515200, 2611200,
      2707200, 2803200, 2918400, 3014400
    ]
  },
  {
    id: 'cluster-2',
    name: 'Cluster 2 (CPUs 5-6)',
    clusterLabel: 'BIG 2',
    policy: 'policy5',
    cpus: [5, 6],
    sweetclockMax: 1920000,
    defaultMin: 480000,
    fallbackHwMax: 2803200,
    fallbackAvail: [
      480000, 633600, 787200, 940800, 1056000, 1190400, 1286400, 1401600, 1516800, 1632000,
      1728000, 1824000, 1920000, 2073600, 2208000, 2323200, 2438400, 2515200, 2611200,
      2707200, 2803200
    ]
  },
  {
    id: 'cluster-3',
    name: 'Cluster 3 (CPU 7)',
    clusterLabel: 'PRIME',
    policy: 'policy7',
    cpus: [7],
    sweetclockMax: 2515200,
    defaultMin: 480000,
    fallbackHwMax: 3206400,
    fallbackAvail: [
      480000, 633600, 787200, 960000, 1094400, 1228800, 1363200, 1478400, 1670400, 1785600,
      1920000, 2054400, 2169600, 2284800, 2400000, 2515200, 2630400, 2745600, 2841600,
      2956800, 3072000, 3206400
    ]
  }
];

let currentIoData: IoStats | null = null;

export function showTuningSubView(viewName: TuningSubView, pushHistory = true): void {
  const hubView = document.getElementById('tuning-hub-view');
  const cpuClocksView = document.getElementById('tuning-cpu-clocks-view');
  const gpuClocksView = document.getElementById('tuning-gpu-clocks-view');
  const ioView = document.getElementById('tuning-io-view');
  const fabContainer = document.getElementById('tuning-fab-container');

  const currentView = store.get('currentTuningSubView');

  if (viewName === 'cpu-clocks') {
    if (hubView) hubView.style.display = 'none';
    if (gpuClocksView) gpuClocksView.style.display = 'none';
    if (ioView) ioView.style.display = 'none';
    if (cpuClocksView) cpuClocksView.style.display = 'block';
    if (fabContainer) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fabContainer.classList.add('fab-visible'));
      });
    }
    if (pushHistory && currentView !== 'cpu-clocks') {
      try {
        history.pushState({ subview: 'cpu-clocks' }, '');
      } catch (e) {}
    }
    store.set('currentTuningSubView', 'cpu-clocks');
  } else if (viewName === 'gpu-clocks') {
    if (hubView) hubView.style.display = 'none';
    if (cpuClocksView) cpuClocksView.style.display = 'none';
    if (ioView) ioView.style.display = 'none';
    if (gpuClocksView) gpuClocksView.style.display = 'block';
    if (fabContainer) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fabContainer.classList.add('fab-visible'));
      });
    }
    if (pushHistory && currentView !== 'gpu-clocks') {
      try {
        history.pushState({ subview: 'gpu-clocks' }, '');
      } catch (e) {}
    }
    store.set('currentTuningSubView', 'gpu-clocks');
  } else if (viewName === 'io-management') {
    if (hubView) hubView.style.display = 'none';
    if (cpuClocksView) cpuClocksView.style.display = 'none';
    if (gpuClocksView) gpuClocksView.style.display = 'none';
    if (ioView) ioView.style.display = 'block';
    if (fabContainer) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fabContainer.classList.add('fab-visible'));
      });
    }
    if (pushHistory && currentView !== 'io-management') {
      try {
        history.pushState({ subview: 'io-management' }, '');
      } catch (e) {}
    }
    store.set('currentTuningSubView', 'io-management');
    renderIoView();
  } else {
    if (cpuClocksView) cpuClocksView.style.display = 'none';
    if (gpuClocksView) gpuClocksView.style.display = 'none';
    if (ioView) ioView.style.display = 'none';
    if (hubView) hubView.style.display = 'block';
    if (fabContainer) fabContainer.classList.remove('fab-visible');
    store.set('currentTuningSubView', 'hub');
  }
}

export function updateGpuControlsLockState(): void {
  const checkbox = document.getElementById('gpu-acknowledge-checkbox') as HTMLInputElement | null;
  const gpuGrid = document.getElementById('gpu-tuning-grid');
  if (!gpuGrid) return;
  if (checkbox && checkbox.checked) {
    gpuGrid.classList.remove('gpu-controls-disabled');
  } else {
    gpuGrid.classList.add('gpu-controls-disabled');
  }
}

export function renderTuningViewWithData(
  data: TelemetrySnapshot,
  forceUpdateTriggers = false
): void {
  const grid = document.getElementById('tuning-grid');
  if (grid) {
    const existingCards = grid.querySelectorAll<HTMLDivElement>('.tuning-card');
    if (existingCards.length !== CLUSTERS_CONFIG.length) {
      grid.innerHTML = '';
      for (const cluster of CLUSTERS_CONFIG) {
        const card = renderClusterTuningCard(cluster, data);
        grid.appendChild(card);
      }
    } else {
      CLUSTERS_CONFIG.forEach((cluster, idx) => {
        const card = existingCards[idx];
        if (!card) return;
        updateClusterTuningCardValues(card, cluster, data, forceUpdateTriggers);
      });
    }
  }

  const gpuGrid = document.getElementById('gpu-tuning-grid');
  if (gpuGrid) {
    const gpuCard = gpuGrid.querySelector<HTMLDivElement>('.tuning-card');
    if (!gpuCard) {
      gpuGrid.innerHTML = '';
      gpuGrid.appendChild(renderGpuTuningCard(data));
    } else {
      updateGpuTuningCardValues(gpuCard, data, forceUpdateTriggers);
    }
  }
}

function renderClusterTuningCard(
  cluster: ClusterConfig,
  data: TelemetrySnapshot
): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'tuning-card';
  card.setAttribute('data-cluster-id', cluster.id);

  const coreData = data.cores.find((c) => c.id === cluster.cpus[0]);
  const curMin = coreData ? coreData.minFreq : cluster.defaultMin;
  const curMax = coreData ? coreData.maxFreq : cluster.sweetclockMax;

  const polData = data.clusters[cluster.policy];
  const curGov = polData?.governor ?? coreData?.governor ?? 'schedutil';
  const availGovs =
    polData && polData.availGovs.length > 0
      ? [...polData.availGovs]
      : ['schedutil', 'performance', 'powersave', 'userspace', 'ondemand', 'conservative'];

  let avail =
    polData && polData.availFreqs.length > 0
      ? [...polData.availFreqs]
      : [...cluster.fallbackAvail];
  const lastAvailFreq = avail[avail.length - 1];
  const realHwMax =
    polData && polData.hwMax > 0
      ? Math.max(polData.hwMax, lastAvailFreq ?? cluster.fallbackHwMax)
      : lastAvailFreq ?? cluster.fallbackHwMax;

  if (realHwMax > 0) {
    avail = avail.filter((f) => f <= realHwMax);
  }

  if (!avail.includes(curMin)) avail.push(curMin);
  if (!avail.includes(curMax) && curMax <= realHwMax) avail.push(curMax);
  if (!avail.includes(cluster.sweetclockMax) && cluster.sweetclockMax <= realHwMax) {
    avail.push(cluster.sweetclockMax);
  }
  avail = Array.from(new Set(avail)).sort((a, b) => a - b);
  const hwMax = avail[avail.length - 1] ?? realHwMax;

  let maxBadge = '';
  if (curMax === cluster.sweetclockMax) {
    maxBadge = '<span class="m3-option-badge badge-sweet">★ Sweetclock</span>';
  } else if (curMax === hwMax) {
    maxBadge = '<span class="m3-option-badge badge-hwmax">HW Max</span>';
  }

  card.innerHTML = `
    <div class="tuning-card-header">
      <div class="tuning-card-title-group">
        <span class="tuning-card-title">${cluster.name}</span>
        <span class="cluster-name">${cluster.clusterLabel}</span>
      </div>
    </div>

    <div class="tuning-stats-row">
      <span>Current Active Settings</span>
      <span class="tuning-stat-val" id="${cluster.id}-active-lbl">${formatFreqMHz(curMin)} – ${formatFreqMHz(curMax)} [${curGov}]</span>
    </div>

    <div class="tuning-controls">
      <div class="tuning-control-group">
        <label class="tuning-control-label">Governor</label>
        <div class="m3-picker-trigger" id="${cluster.id}-gov-trigger" data-val="${curGov}">
          <span class="m3-picker-val" id="${cluster.id}-gov-val">${curGov}</span>
          <svg class="m3-picker-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
        </div>
      </div>

      <div class="tuning-control-group">
        <label class="tuning-control-label">Min Frequency</label>
        <div class="m3-picker-trigger" id="${cluster.id}-min-trigger" data-val="${curMin}">
          <span class="m3-picker-val" id="${cluster.id}-min-val">${formatFreqMHz(curMin)}</span>
          <svg class="m3-picker-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
        </div>
      </div>

      <div class="tuning-control-group">
        <label class="tuning-control-label">Max Frequency</label>
        <div class="m3-picker-trigger" id="${cluster.id}-max-trigger" data-val="${curMax}">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="m3-picker-val" id="${cluster.id}-max-val">${formatFreqMHz(curMax)}</span>
            ${maxBadge}
          </div>
          <svg class="m3-picker-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const minTrigger = card.querySelector<HTMLElement>(`#${cluster.id}-min-trigger`);
    const maxTrigger = card.querySelector<HTMLElement>(`#${cluster.id}-max-trigger`);
    const govTrigger = card.querySelector<HTMLElement>(`#${cluster.id}-gov-trigger`);
    const minValLbl = card.querySelector<HTMLElement>(`#${cluster.id}-min-val`);
    const govValLbl = card.querySelector<HTMLElement>(`#${cluster.id}-gov-val`);

    if (govTrigger) {
      govTrigger.onclick = () => {
        const currentGovVal = govTrigger.getAttribute('data-val') || curGov;
        openGovernorSheetDialog({
          title: 'Select Governor',
          subtitle: `${cluster.name} (${cluster.clusterLabel})`,
          availGovs,
          currentGov: currentGovVal,
          onSelect: (selectedGov) => {
            govTrigger.setAttribute('data-val', selectedGov);
            if (govValLbl) govValLbl.innerText = selectedGov;
          }
        });
      };
    }

    if (minTrigger) {
      minTrigger.onclick = () => {
        const currentMinVal = parseInt(minTrigger.getAttribute('data-val') ?? '0', 10) || curMin;
        openFrequencySheetDialog({
          title: 'Select Min Frequency',
          subtitle: `${cluster.name} (${cluster.clusterLabel})`,
          availFreqs: avail,
          currentVal: currentMinVal,
          sweetclockMax: cluster.sweetclockMax,
          hwMax,
          onSelect: (selectedFreq) => {
            minTrigger.setAttribute('data-val', String(selectedFreq));
            if (minValLbl) minValLbl.innerText = formatFreqMHz(selectedFreq);
          }
        });
      };
    }

    if (maxTrigger) {
      maxTrigger.onclick = () => {
        const currentMaxVal = parseInt(maxTrigger.getAttribute('data-val') ?? '0', 10) || curMax;
        openFrequencySheetDialog({
          title: 'Select Max Frequency',
          subtitle: `${cluster.name} (${cluster.clusterLabel})`,
          availFreqs: avail,
          currentVal: currentMaxVal,
          sweetclockMax: cluster.sweetclockMax,
          hwMax,
          onSelect: (selectedFreq) => {
            maxTrigger.setAttribute('data-val', String(selectedFreq));
            const container = maxTrigger.querySelector('div');
            let badge =
              selectedFreq === cluster.sweetclockMax
                ? '<span class="m3-option-badge badge-sweet">★ Sweetclock</span>'
                : selectedFreq === hwMax
                ? '<span class="m3-option-badge badge-hwmax">HW Max</span>'
                : '';
            if (container) {
              container.innerHTML = `<span class="m3-picker-val" id="${cluster.id}-max-val">${formatFreqMHz(selectedFreq)}</span>${badge}`;
            }
          }
        });
      };
    }
  }, 0);

  return card;
}

function updateClusterTuningCardValues(
  card: HTMLDivElement,
  cluster: ClusterConfig,
  data: TelemetrySnapshot,
  forceUpdateTriggers = false
): void {
  const coreData = data.cores.find((c) => c.id === cluster.cpus[0]);
  if (!coreData) return;
  const curMin = coreData.minFreq;
  const curMax = coreData.maxFreq;
  const polData = data.clusters[cluster.policy];
  const curGov = polData?.governor ?? coreData.governor;

  const activeLbl = card.querySelector<HTMLElement>(`#${cluster.id}-active-lbl`);
  if (activeLbl) {
    activeLbl.innerText = `${formatFreqMHz(curMin)} – ${formatFreqMHz(curMax)} [${curGov}]`;
  }

  if (forceUpdateTriggers) {
    const minTrig = card.querySelector<HTMLElement>(`#${cluster.id}-min-trigger`);
    const minValLbl = card.querySelector<HTMLElement>(`#${cluster.id}-min-val`);
    if (minTrig) minTrig.setAttribute('data-val', String(curMin));
    if (minValLbl) minValLbl.innerText = formatFreqMHz(curMin);

    const maxTrig = card.querySelector<HTMLElement>(`#${cluster.id}-max-trigger`);
    if (maxTrig) {
      maxTrig.setAttribute('data-val', String(curMax));
      const container = maxTrig.querySelector('div');
      let badge =
        curMax === cluster.sweetclockMax
          ? '<span class="m3-option-badge badge-sweet">★ Sweetclock</span>'
          : '';
      if (container) {
        container.innerHTML = `<span class="m3-picker-val" id="${cluster.id}-max-val">${formatFreqMHz(curMax)}</span>${badge}`;
      }
    }

    const govTrig = card.querySelector<HTMLElement>(`#${cluster.id}-gov-trigger`);
    const govValLbl = card.querySelector<HTMLElement>(`#${cluster.id}-gov-val`);
    if (govTrig) govTrig.setAttribute('data-val', curGov);
    if (govValLbl) govValLbl.innerText = curGov;
  }
}

function renderGpuTuningCard(data: TelemetrySnapshot): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'tuning-card';
  card.setAttribute('data-gpu-card', 'true');

  const gpuData = data.gpu;
  const curMin = gpuData.minFreq || 264;
  const curMax = gpuData.maxFreq || 937;
  const curGov = gpuData.governor || 'msm-adreno-tz';
  const availGovs =
    gpuData.availGovs.length > 0
      ? gpuData.availGovs
      : ['msm-adreno-tz', 'performance', 'powersave', 'userspace', 'simple_ondemand', 'bw_hwmon'];
  const availFreqs =
    gpuData.availFreqs.length > 0
      ? gpuData.availFreqs
      : [264, 355, 443, 540, 650, 738, 855, 937];

  const hwMax = gpuData.hwMax || availFreqs[availFreqs.length - 1] || 937;

  let minBadge = curMin === 264 ? '<span class="m3-option-badge badge-default">Default</span>' : '';
  let maxBadge =
    curMax === hwMax
      ? '<span class="m3-option-badge badge-hwmax">HW Max</span>'
      : curMax === 937
      ? '<span class="m3-option-badge badge-default">Default</span>'
      : '';

  card.innerHTML = `
    <div class="tuning-card-header">
      <div class="tuning-card-title-group">
        <span class="tuning-card-title">${gpuData.model || 'Adreno GPU'}</span>
        <span class="cluster-name">GPU clock limits</span>
      </div>
    </div>

    <div class="tuning-stats-row">
      <span>Current Active Settings</span>
      <span class="tuning-stat-val" id="gpu-active-lbl">${curMin} MHz – ${curMax} MHz [${curGov}]</span>
    </div>

    <div class="tuning-controls">
      <div class="tuning-control-group">
        <label class="tuning-control-label">Governor</label>
        <div class="m3-picker-trigger" id="gpu-gov-trigger" data-val="${curGov}">
          <span class="m3-picker-val" id="gpu-gov-val">${curGov}</span>
          <svg class="m3-picker-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
        </div>
      </div>

      <div class="tuning-control-group">
        <label class="tuning-control-label">Min Frequency</label>
        <div class="m3-picker-trigger" id="gpu-min-trigger" data-val="${curMin}">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="m3-picker-val" id="gpu-min-val">${curMin} MHz</span>
            ${minBadge}
          </div>
          <svg class="m3-picker-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
        </div>
      </div>

      <div class="tuning-control-group">
        <label class="tuning-control-label">Max Frequency</label>
        <div class="m3-picker-trigger" id="gpu-max-trigger" data-val="${curMax}">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="m3-picker-val" id="gpu-max-val">${curMax} MHz</span>
            ${maxBadge}
          </div>
          <svg class="m3-picker-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const minTrigger = card.querySelector<HTMLElement>('#gpu-min-trigger');
    const maxTrigger = card.querySelector<HTMLElement>('#gpu-max-trigger');
    const govTrigger = card.querySelector<HTMLElement>('#gpu-gov-trigger');
    const govValLbl = card.querySelector<HTMLElement>('#gpu-gov-val');

    if (govTrigger) {
      govTrigger.onclick = () => {
        const currentGovVal = govTrigger.getAttribute('data-val') || curGov;
        openGovernorSheetDialog({
          title: 'Select GPU Governor',
          subtitle: `${gpuData.model || 'Adreno GPU'} (Governor)`,
          availGovs,
          currentGov: currentGovVal,
          onSelect: (selectedGov) => {
            govTrigger.setAttribute('data-val', selectedGov);
            if (govValLbl) govValLbl.innerText = selectedGov;
          }
        });
      };
    }

    if (minTrigger) {
      minTrigger.onclick = () => {
        const currentMinVal = parseInt(minTrigger.getAttribute('data-val') ?? '0', 10) || curMin;
        openFrequencySheetDialog({
          title: 'Select GPU Min Frequency',
          subtitle: `${gpuData.model || 'Adreno GPU'} (Min Clock)`,
          availFreqs,
          currentVal: currentMinVal,
          hwMax,
          isGpu: true,
          onSelect: (selectedFreq) => {
            minTrigger.setAttribute('data-val', String(selectedFreq));
            const container = minTrigger.querySelector('div');
            let badge =
              selectedFreq === 264
                ? '<span class="m3-option-badge badge-default">Default</span>'
                : '';
            if (container) {
              container.innerHTML = `<span class="m3-picker-val" id="gpu-min-val">${selectedFreq} MHz</span>${badge}`;
            }
          }
        });
      };
    }

    if (maxTrigger) {
      maxTrigger.onclick = () => {
        const currentMaxVal = parseInt(maxTrigger.getAttribute('data-val') ?? '0', 10) || curMax;
        openFrequencySheetDialog({
          title: 'Select GPU Max Frequency',
          subtitle: `${gpuData.model || 'Adreno GPU'} (Max Clock)`,
          availFreqs,
          currentVal: currentMaxVal,
          hwMax,
          isGpu: true,
          onSelect: (selectedFreq) => {
            maxTrigger.setAttribute('data-val', String(selectedFreq));
            const container = maxTrigger.querySelector('div');
            let badge =
              selectedFreq === hwMax
                ? '<span class="m3-option-badge badge-hwmax">HW Max</span>'
                : selectedFreq === 937
                ? '<span class="m3-option-badge badge-default">Default</span>'
                : '';
            if (container) {
              container.innerHTML = `<span class="m3-picker-val" id="gpu-max-val">${selectedFreq} MHz</span>${badge}`;
            }
          }
        });
      };
    }

    updateGpuControlsLockState();
  }, 0);

  return card;
}

function updateGpuTuningCardValues(
  card: HTMLDivElement,
  data: TelemetrySnapshot,
  forceUpdateTriggers = false
): void {
  const gpuData = data.gpu;
  const curMin = gpuData.minFreq || 264;
  const curMax = gpuData.maxFreq || 937;
  const curGov = gpuData.governor || 'msm-adreno-tz';

  const activeLbl = card.querySelector<HTMLElement>('#gpu-active-lbl');
  if (activeLbl) {
    activeLbl.innerText = `${curMin} MHz – ${curMax} MHz [${curGov}]`;
  }

  if (forceUpdateTriggers) {
    const minTrig = card.querySelector<HTMLElement>('#gpu-min-trigger');
    if (minTrig) {
      minTrig.setAttribute('data-val', String(curMin));
      const container = minTrig.querySelector('div');
      let badge = curMin === 264 ? '<span class="m3-option-badge badge-default">Default</span>' : '';
      if (container) {
        container.innerHTML = `<span class="m3-picker-val" id="gpu-min-val">${curMin} MHz</span>${badge}`;
      }
    }

    const maxTrig = card.querySelector<HTMLElement>('#gpu-max-trigger');
    if (maxTrig) {
      maxTrig.setAttribute('data-val', String(curMax));
      const container = maxTrig.querySelector('div');
      const lastFreq = gpuData.availFreqs[gpuData.availFreqs.length - 1];
      const hwMax = lastFreq !== undefined ? lastFreq : 937;
      let badge =
        curMax === hwMax
          ? '<span class="m3-option-badge badge-hwmax">HW Max</span>'
          : curMax === 937
          ? '<span class="m3-option-badge badge-default">Default</span>'
          : '';
      if (container) {
        container.innerHTML = `<span class="m3-picker-val" id="gpu-max-val">${curMax} MHz</span>${badge}`;
      }
    }

    const govTrig = card.querySelector<HTMLElement>('#gpu-gov-trigger');
    const govValLbl = card.querySelector<HTMLElement>('#gpu-gov-val');
    if (govTrig) govTrig.setAttribute('data-val', curGov);
    if (govValLbl) govValLbl.innerText = curGov;
  }
}

export async function renderIoView(userEnabledOverride: boolean | null = null): Promise<void> {
  const grid = document.getElementById('io-tuning-grid');
  const enableToggle = document.getElementById('io-enable-toggle') as HTMLInputElement | null;
  const applyBootToggle = document.getElementById(
    'io-apply-boot-toggle'
  ) as HTMLInputElement | null;

  if (!grid) return;

  const data = await getIoStats();
  currentIoData = data;

  if (!data) {
    grid.innerHTML = '<div class="grid-placeholder">Failed to query storage block devices.</div>';
    return;
  }

  const isEnabled =
    userEnabledOverride !== null
      ? userEnabledOverride
      : data.enabled || (enableToggle ? enableToggle.checked : false);

  if (enableToggle) enableToggle.checked = isEnabled;
  if (applyBootToggle) applyBootToggle.checked = data.applyBoot;

  if (!isEnabled) {
    grid.innerHTML = `<div class="grid-placeholder" style="padding: 24px; text-align: center;">I/O Management is disabled.<br><span style="font-size: 0.8rem; opacity: 0.7;">Turn ON the switch above to inspect and customize block device schedulers.</span></div>`;
    return;
  }

  const validBlocks = data.blocks.filter(
    (b) => !b.dev.startsWith('loop') && !b.dev.startsWith('zram')
  );

  if (validBlocks.length === 0) {
    grid.innerHTML = '<div class="grid-placeholder">No configurable storage block devices found.</div>';
    return;
  }

  grid.innerHTML = '';

  for (const blk of validBlocks) {
    const card = document.createElement('div');
    card.className = 'card tuning-card io-card';
    card.setAttribute('data-dev', blk.dev);

    const activeSched = blk.customSched || blk.active || blk.defaultSched;
    const isDefault = activeSched === blk.defaultSched;

    card.innerHTML = `
      <div class="io-card-header">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span class="io-dev-title">/sys/block/${blk.dev}</span>
        </div>
      </div>

      <div class="tuning-controls" style="margin-top: 8px;">
        <div class="tuning-control-group">
          <label class="tuning-control-label">I/O Scheduler</label>
          <div class="m3-picker-trigger io-sched-trigger" id="io-trigger-${blk.dev}" data-val="${activeSched}">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="m3-picker-val" id="io-val-${blk.dev}">${activeSched}</span>
              <span class="m3-option-badge badge-default" id="io-badge-${blk.dev}" style="${isDefault ? '' : 'display: none;'}">Default</span>
            </div>
            <svg class="m3-picker-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      const trigger = card.querySelector<HTMLElement>(`#io-trigger-${blk.dev}`);
      const valLbl = card.querySelector<HTMLElement>(`#io-val-${blk.dev}`);
      const badgeEl = card.querySelector<HTMLElement>(`#io-badge-${blk.dev}`);

      if (trigger) {
        trigger.onclick = () => {
          const currentVal = trigger.getAttribute('data-val') || activeSched;
          openGovernorSheetDialog({
            title: 'Select I/O Scheduler',
            subtitle: `/sys/block/${blk.dev} (Storage Scheduler)`,
            availGovs: blk.avail,
            currentGov: currentVal,
            defaultGov: blk.defaultSched,
            onSelect: (selectedSched) => {
              trigger.setAttribute('data-val', selectedSched);
              if (valLbl) valLbl.innerText = selectedSched;
              if (badgeEl) {
                badgeEl.style.display =
                  selectedSched === blk.defaultSched ? 'inline-block' : 'none';
              }
            }
          });
        };
      }
    }, 0);

    grid.appendChild(card);
  }
}

// Frequency Bottom Sheet Helper
function openFrequencySheetDialog(opts: {
  title: string;
  subtitle: string;
  availFreqs: number[];
  currentVal: number;
  sweetclockMax?: number;
  hwMax?: number;
  isGpu?: boolean;
  onSelect: (freq: number) => void;
}): void {
  const backdrop = document.getElementById('freq-sheet-backdrop');
  const sheetTitle = document.getElementById('freq-sheet-title');
  const sheetSubtitle = document.getElementById('freq-sheet-subtitle');
  const sheetOptions = document.getElementById('freq-sheet-options');
  const closeBtn = document.getElementById('freq-sheet-close');

  if (!backdrop || !sheetOptions) return;

  try {
    history.pushState({ modal: true }, '');
  } catch (e) {}

  if (sheetTitle) sheetTitle.innerText = opts.title;
  if (sheetSubtitle) sheetSubtitle.innerText = opts.subtitle;
  sheetOptions.innerHTML = '';

  for (const freq of opts.availFreqs) {
    const isSelected = freq === opts.currentVal;
    const isSweet = !opts.isGpu && freq === opts.sweetclockMax;
    const isHwMax = freq === opts.hwMax;
    const isDefault =
      opts.isGpu &&
      ((opts.title.includes('Min') && freq === 264) ||
        (opts.title.includes('Max') && freq === 937));

    const opt = document.createElement('div');
    opt.className = `m3-sheet-option ${isSelected ? 'active' : ''}`;

    let badgeHtml = '';
    if (isSweet) badgeHtml += '<span class="m3-option-badge badge-sweet">★ Sweetclock</span>';
    if (isDefault) badgeHtml += '<span class="m3-option-badge badge-hwmax">Default</span>';
    if (isHwMax) badgeHtml += '<span class="m3-option-badge badge-hwmax">HW Max</span>';

    const freqLabel = opts.isGpu ? `${freq} MHz` : formatFreqMHz(freq);

    opt.innerHTML = `
      <span class="m3-option-freq">${freqLabel}</span>
      <div class="m3-option-right">
        ${badgeHtml}
        <span class="m3-radio-icon"></span>
      </div>
    `;

    opt.addEventListener('click', () => {
      backdrop.classList.remove('active');
      opts.onSelect(freq);
    });

    sheetOptions.appendChild(opt);
  }

  backdrop.onclick = (e) => {
    if (e.target === backdrop) backdrop.classList.remove('active');
  };

  if (closeBtn) {
    closeBtn.onclick = () => backdrop.classList.remove('active');
  }

  backdrop.classList.add('active');

  setTimeout(() => {
    const activeOpt = sheetOptions.querySelector('.m3-sheet-option.active');
    if (activeOpt) activeOpt.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 80);
}

// Governor Bottom Sheet Helper
function openGovernorSheetDialog(opts: {
  title: string;
  subtitle: string;
  availGovs: string[];
  currentGov: string;
  defaultGov?: string;
  onSelect: (gov: string) => void;
}): void {
  const backdrop = document.getElementById('gov-sheet-backdrop');
  const sheetTitle = document.getElementById('gov-sheet-title');
  const sheetSubtitle = document.getElementById('gov-sheet-subtitle');
  const sheetOptions = document.getElementById('gov-sheet-options');
  const closeBtn = document.getElementById('gov-sheet-close');

  if (!backdrop || !sheetOptions) return;

  try {
    history.pushState({ modal: true }, '');
  } catch (e) {}

  if (sheetTitle) sheetTitle.innerText = opts.title;
  if (sheetSubtitle) sheetSubtitle.innerText = opts.subtitle;
  sheetOptions.innerHTML = '';

  for (const gov of opts.availGovs) {
    const isSelected = gov === opts.currentGov;

    const opt = document.createElement('div');
    opt.className = `m3-sheet-option ${isSelected ? 'active' : ''}`;

    let badgeHtml = '';
    if (opts.defaultGov && gov === opts.defaultGov) {
      badgeHtml = '<span class="m3-option-badge badge-default">Default</span>';
    } else if (gov === 'schedutil') {
      badgeHtml = '<span class="m3-option-badge badge-sweet">Recommended</span>';
    }

    opt.innerHTML = `
      <span class="m3-option-freq" style="font-family: var(--font-family); text-transform: lowercase;">${gov}</span>
      <div class="m3-option-right">
        ${badgeHtml}
        <span class="m3-radio-icon"></span>
      </div>
    `;

    opt.addEventListener('click', () => {
      backdrop.classList.remove('active');
      opts.onSelect(gov);
    });

    sheetOptions.appendChild(opt);
  }

  backdrop.onclick = (e) => {
    if (e.target === backdrop) backdrop.classList.remove('active');
  };

  if (closeBtn) {
    closeBtn.onclick = () => backdrop.classList.remove('active');
  }

  backdrop.classList.add('active');

  setTimeout(() => {
    const activeOpt = sheetOptions.querySelector('.m3-sheet-option.active');
    if (activeOpt) activeOpt.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 80);
}

export function initTuningScreen(): void {
  // Feature Cards in Tuning Hub
  const tuneCards = document.querySelectorAll<HTMLElement>('[data-tune-feature]');
  tuneCards.forEach((card) => {
    card.addEventListener('click', () => {
      const feature = card.getAttribute('data-tune-feature');
      if (feature === 'performance-profile') {
        showTuningSubView('cpu-clocks', true);
      } else if (feature === 'gpu-clocks') {
        showTuningSubView('gpu-clocks', true);
        showGpuWarningDialog();
        updateGpuControlsLockState();
      } else if (feature === 'io-management') {
        showTuningSubView('io-management', true);
      }
    });
  });

  // Back buttons
  const backBtn = document.getElementById('tune-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (history.state?.subview === 'cpu-clocks') history.back();
      else showTuningSubView('hub', false);
    });
  }

  const gpuBackBtn = document.getElementById('tune-gpu-back-btn');
  if (gpuBackBtn) {
    gpuBackBtn.addEventListener('click', () => {
      if (history.state?.subview === 'gpu-clocks') history.back();
      else showTuningSubView('hub', false);
    });
  }

  const ioBackBtn = document.getElementById('tune-io-back-btn');
  if (ioBackBtn) {
    ioBackBtn.addEventListener('click', () => {
      if (history.state?.subview === 'io-management') history.back();
      else showTuningSubView('hub', false);
    });
  }

  // I/O Toggle Switch
  const ioEnableToggle = document.getElementById('io-enable-toggle') as HTMLInputElement | null;
  if (ioEnableToggle) {
    ioEnableToggle.addEventListener('change', async (e) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      if (isChecked) {
        await renderIoView(true);
      } else {
        if (currentIoData) currentIoData.enabled = false;
        const grid = document.getElementById('io-tuning-grid');
        if (grid) {
          grid.innerHTML =
            '<div class="grid-placeholder" style="padding: 24px; text-align: center;">I/O Management is disabled.<br><span style="font-size: 0.8rem; opacity: 0.7;">Turn ON the toggle above to inspect and customize block device schedulers.</span></div>';
        }
      }
    });
  }

  // Apply Action
  const applyBtn = document.getElementById('apply-tuning-btn');
  if (applyBtn) {
    applyBtn.addEventListener('click', async () => {
      const currentSub = store.get('currentTuningSubView');

      if (currentSub === 'gpu-clocks') {
        const checkbox = document.getElementById(
          'gpu-acknowledge-checkbox'
        ) as HTMLInputElement | null;
        if (!checkbox || !checkbox.checked) {
          toast("Please check 'I know what am doing' before applying GPU custom clocks");
          showGpuWarningDialog();
          return;
        }

        const gpuMinTrig = document.getElementById('gpu-min-trigger');
        const gpuMaxTrig = document.getElementById('gpu-max-trigger');
        const gpuGovTrig = document.getElementById('gpu-gov-trigger');

        const gpuConfig: GpuConfigLimits = {
          min: gpuMinTrig ? parseInt(gpuMinTrig.getAttribute('data-val') ?? '0', 10) : undefined,
          max: gpuMaxTrig ? parseInt(gpuMaxTrig.getAttribute('data-val') ?? '0', 10) : undefined,
          gov: gpuGovTrig ? gpuGovTrig.getAttribute('data-val') ?? undefined : undefined
        };

        toast('Applying GPU configuration...');
        const ok = await applyGpuConfig(gpuConfig);
        if (ok) {
          toast('GPU configuration applied!');
          const snapshot = await sampleOnce();
          if (snapshot) renderTuningViewWithData(snapshot, true);
        } else {
          toast('Failed to apply GPU configuration');
        }
      } else if (currentSub === 'cpu-clocks') {
        const config: Record<string, CpuConfigLimits> = {};
        for (const cluster of CLUSTERS_CONFIG) {
          const minTrigger = document.getElementById(`${cluster.id}-min-trigger`);
          const maxTrigger = document.getElementById(`${cluster.id}-max-trigger`);
          const govTrigger = document.getElementById(`${cluster.id}-gov-trigger`);

          if (minTrigger && maxTrigger) {
            config[cluster.policy] = {
              min: parseInt(minTrigger.getAttribute('data-val') ?? '0', 10),
              max: parseInt(maxTrigger.getAttribute('data-val') ?? '0', 10),
              gov: govTrigger ? govTrigger.getAttribute('data-val') ?? undefined : undefined
            };
          }
        }

        toast('Applying CPU configuration...');
        const ok = await applyCpuConfig(config);
        if (ok) {
          toast('CPU configuration applied!');
          const snapshot = await sampleOnce();
          if (snapshot) renderTuningViewWithData(snapshot, true);
        } else {
          toast('Failed to apply CPU configuration');
        }
      } else if (currentSub === 'io-management') {
        const ioEnable = document.getElementById('io-enable-toggle') as HTMLInputElement | null;
        const ioApplyBoot = document.getElementById(
          'io-apply-boot-toggle'
        ) as HTMLInputElement | null;
        const isEnabled = ioEnable?.checked ?? false;
        const applyBoot = ioApplyBoot?.checked ?? false;

        const configMap: Record<string, string> = {};
        const ioCards = document.querySelectorAll<HTMLElement>('#io-tuning-grid .io-card');
        ioCards.forEach((card) => {
          const dev = card.getAttribute('data-dev');
          const trigger = card.querySelector<HTMLElement>('.io-sched-trigger');
          if (dev && trigger) {
            const val = trigger.getAttribute('data-val');
            if (val) configMap[dev] = val;
          }
        });

        toast('Applying I/O scheduler configuration...');
        const ok = await applyIoConfig(configMap, applyBoot, isEnabled);
        if (ok) {
          toast('I/O scheduler configuration applied!');
          renderIoView();
        } else {
          toast('Failed to apply I/O configuration');
        }
      }
    });
  }

  // Reset Sweetclock Action
  const resetBtn = document.getElementById('reset-sweetclock-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const currentSub = store.get('currentTuningSubView');

      if (currentSub === 'gpu-clocks') {
        toast('Resetting GPU to defaults...');
        const ok = await resetGpuConfig();
        if (ok) {
          toast('GPU reset to defaults & thermal limit!');
          const snapshot = await sampleOnce();
          if (snapshot) renderTuningViewWithData(snapshot, true);
        } else {
          toast('Failed to reset GPU configuration');
        }
      } else if (currentSub === 'cpu-clocks') {
        toast('Resetting CPU to sweetclocks...');
        const ok = await resetToSweetclocks();
        if (ok) {
          toast('CPU reset to sweetclocks!');
          const snapshot = await sampleOnce();
          if (snapshot) renderTuningViewWithData(snapshot, true);
        } else {
          toast('Failed to reset CPU configuration');
        }
      } else if (currentSub === 'io-management') {
        toast('Resetting I/O schedulers to defaults...');
        const ok = await resetIoConfig();
        if (ok) {
          toast('I/O schedulers reset to default system values!');
          renderIoView();
        } else {
          toast('Failed to reset I/O configuration');
        }
      }
    });
  }
}
