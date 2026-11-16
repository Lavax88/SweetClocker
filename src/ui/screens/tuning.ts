import type {
  TelemetrySnapshot,
  IoStats,
  NetStats,
  CpuConfigLimits,
  GpuConfigLimits,
  SystemPropItem,
  PropImportDiffItem
} from '../../telemetry/types';
import {
  applyCpuConfig,
  applyGpuConfig,
  applyIoConfig,
  applyNetConfig,
  resetGpuConfig,
  resetIoConfig,
  resetNetConfig,
  resetToSweetclocks,
  getIoStats,
  getNetStats,
  sampleOnce
} from '../../telemetry/sampler';
import { propsEngine, parsePropsText } from '../../telemetry/propsEngine';
import { VirtualPropList } from '../components/virtualPropList';
import { toast } from '../../bridge/ksu';
import { formatFreqMHz } from '../formatters';
import { showGpuWarningDialog, askApplyBoot } from '../components/dialog';
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
let currentNetData: NetStats | null = null;

const TCP_ALGO_DESCRIPTIONS: Record<string, string> = {
  bbr: 'Google BBR (Bottleneck Bandwidth and RTT): Model-based congestion control that optimizes throughput and latency over Wi-Fi and mobile networks while preventing bufferbloat.',
  cubic: 'CUBIC: Window-based congestion control designed for high-bandwidth, high-latency networks. Highly stable and standard default in Android/Linux.',
  reno: 'TCP Reno: Traditional loss-based additive-increase / multiplicative-decrease (AIMD) algorithm.',
  bic: 'BIC: Binary Increase Congestion control designed for networks with large delay-bandwidth product.',
  westwood: 'TCP Westwood: Bandwidth-estimation algorithm designed for lossy wireless and mobile environments.',
  westwoodplus: 'TCP Westwood+: Improved Westwood with enhanced RTT estimation under lossy wireless conditions.',
  fq_codel: 'FQ-CoDel: Fair Queuing with Controlled Delay packet scheduler and congestion controller.',
  dctcp: 'DCTCP: Data Center TCP utilizing Explicit Congestion Notification (ECN).',
  vegas: 'TCP Vegas: Delay-based congestion avoidance algorithm that predicts packet loss by measuring RTT variations.',
  scalable: 'Scalable TCP: Algorithm designed for gigabit wide-area networks with scaled recovery.'
};

function getAlgoDescription(algo: string): string {
  const key = algo.toLowerCase();
  return (
    TCP_ALGO_DESCRIPTIONS[key] ??
    `Kernel-provided TCP congestion control module (${algo}).`
  );
}

export function showTuningSubView(viewName: TuningSubView, pushHistory = true): void {
  const hubView = document.getElementById('tuning-hub-view');
  const cpuClocksView = document.getElementById('tuning-cpu-clocks-view');
  const gpuClocksView = document.getElementById('tuning-gpu-clocks-view');
  const ioView = document.getElementById('tuning-io-view');
  const netView = document.getElementById('tuning-net-view');
  const propsView = document.getElementById('tuning-props-subview');
  const fabContainer = document.getElementById('tuning-fab-container');
  const propsFabContainer = document.getElementById('props-fab-container');
  const propsFabScrim = document.getElementById('props-fab-scrim');

  const closeSpeedDial = () => {
    if (propsFabContainer) propsFabContainer.classList.remove('speed-dial-open');
    if (propsFabScrim) propsFabScrim.classList.remove('visible');
    const trigger = document.getElementById('props-fab-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  };

  const currentView = store.get('currentTuningSubView');

  if (viewName === 'cpu-clocks') {
    closeSpeedDial();
    if (propsFabContainer) propsFabContainer.classList.remove('fab-visible');
    if (hubView) hubView.style.display = 'none';
    if (gpuClocksView) gpuClocksView.style.display = 'none';
    if (ioView) ioView.style.display = 'none';
    if (netView) netView.style.display = 'none';
    if (propsView) propsView.style.display = 'none';
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
    closeSpeedDial();
    if (propsFabContainer) propsFabContainer.classList.remove('fab-visible');
    if (hubView) hubView.style.display = 'none';
    if (cpuClocksView) cpuClocksView.style.display = 'none';
    if (ioView) ioView.style.display = 'none';
    if (netView) netView.style.display = 'none';
    if (propsView) propsView.style.display = 'none';
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
    closeSpeedDial();
    if (propsFabContainer) propsFabContainer.classList.remove('fab-visible');
    if (hubView) hubView.style.display = 'none';
    if (cpuClocksView) cpuClocksView.style.display = 'none';
    if (gpuClocksView) gpuClocksView.style.display = 'none';
    if (netView) netView.style.display = 'none';
    if (propsView) propsView.style.display = 'none';
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
  } else if (viewName === 'net-management') {
    closeSpeedDial();
    if (propsFabContainer) propsFabContainer.classList.remove('fab-visible');
    if (hubView) hubView.style.display = 'none';
    if (cpuClocksView) cpuClocksView.style.display = 'none';
    if (gpuClocksView) gpuClocksView.style.display = 'none';
    if (ioView) ioView.style.display = 'none';
    if (propsView) propsView.style.display = 'none';
    if (netView) netView.style.display = 'block';
    if (fabContainer) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fabContainer.classList.add('fab-visible'));
      });
    }
    if (pushHistory && currentView !== 'net-management') {
      try {
        history.pushState({ subview: 'net-management' }, '');
      } catch (e) {}
    }
    store.set('currentTuningSubView', 'net-management');
    renderNetView();
  } else if (viewName === 'props-management') {
    closeSpeedDial();
    if (hubView) hubView.style.display = 'none';
    if (cpuClocksView) cpuClocksView.style.display = 'none';
    if (gpuClocksView) gpuClocksView.style.display = 'none';
    if (ioView) ioView.style.display = 'none';
    if (netView) netView.style.display = 'none';
    if (propsView) propsView.style.display = 'block';
    if (fabContainer) fabContainer.classList.remove('fab-visible');
    if (propsFabContainer) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => propsFabContainer.classList.add('fab-visible'));
      });
    }
    if (pushHistory && currentView !== 'props-management') {
      try {
        history.pushState({ subview: 'props-management' }, '');
      } catch (e) {}
    }
    store.set('currentTuningSubView', 'props-management');
    renderPropsView();
  } else {
    closeSpeedDial();
    if (propsFabContainer) propsFabContainer.classList.remove('fab-visible');
    if (cpuClocksView) cpuClocksView.style.display = 'none';
    if (gpuClocksView) gpuClocksView.style.display = 'none';
    if (ioView) ioView.style.display = 'none';
    if (netView) netView.style.display = 'none';
    if (propsView) propsView.style.display = 'none';
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

export async function renderNetView(userEnabledOverride: boolean | null = null): Promise<void> {
  const grid = document.getElementById('net-tuning-grid');
  const enableToggle = document.getElementById('net-enable-toggle') as HTMLInputElement | null;

  if (!grid) return;

  const data = await getNetStats();
  currentNetData = data;

  if (!data) {
    grid.innerHTML = '<div class="grid-placeholder">Failed to query kernel TCP congestion controls.</div>';
    return;
  }

  const isEnabled =
    userEnabledOverride !== null
      ? userEnabledOverride
      : data.enabled || (enableToggle ? enableToggle.checked : false);

  if (enableToggle) enableToggle.checked = isEnabled;

  if (!isEnabled) {
    grid.innerHTML = `<div class="grid-placeholder" style="padding: 24px; text-align: center;">Network Tuning is disabled.<br><span style="font-size: 0.8rem; opacity: 0.7;">Turn ON the switch above to inspect and customize TCP congestion controls.</span></div>`;
    return;
  }

  const activeAlgo = data.customAlgo || data.currentAlgo || data.defaultAlgo;

  const radioItemsHtml = data.availAlgos
    .map((algo) => {
      const isSelected = algo === activeAlgo;
      const isDefault = algo === data.defaultAlgo;
      return `
        <div class="m3e-radio-card ${isSelected ? 'active' : ''}" data-algo="${algo}">
          <div class="m3e-radio-left">
            <div class="m3e-radio-control">
              <div class="m3e-radio-circle">
                <div class="m3e-radio-dot"></div>
              </div>
            </div>
            <div class="m3e-radio-text">
              <div class="m3e-radio-title-row">
                <span class="m3e-radio-title">${algo}</span>
                ${isDefault ? '<span class="m3-option-badge badge-default">Default</span>' : ''}
              </div>
              <span class="m3e-radio-desc">${getAlgoDescription(algo)}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  grid.innerHTML = `
    <div class="card tuning-card net-card" style="margin-bottom: 0; padding: 16px;">
      <div class="io-card-header">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span class="io-dev-title">/proc/sys/net/ipv4/tcp_congestion_control</span>
        </div>
      </div>

      <div class="tuning-stats-row" style="margin-top: 6px;">
        <span>Current Active Setting</span>
        <span class="tuning-stat-val" id="net-active-lbl">${data.currentAlgo} ${data.currentAlgo === data.defaultAlgo ? '(Default)' : ''}</span>
      </div>

      <div style="margin-top: 10px;">
        <label class="tuning-control-label">Kernel Congestion Control (${data.availAlgos.length})</label>
        <div class="m3e-radio-list" id="net-algo-radio-list">
          ${radioItemsHtml}
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const radioList = grid.querySelector<HTMLElement>('#net-algo-radio-list');
    if (radioList) {
      const cards = radioList.querySelectorAll<HTMLElement>('.m3e-radio-card');
      cards.forEach((card) => {
        card.onclick = () => {
          cards.forEach((c) => c.classList.remove('active'));
          card.classList.add('active');
        };
      });
    }
  }, 0);
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

// ==========================================
// SYSTEM PROPERTIES MANAGEMENT
// ==========================================

let virtualPropList: VirtualPropList | null = null;
let currentPropsList: SystemPropItem[] = [];
let activeEditProp: SystemPropItem | null = null;
let parsedImportDiffs: PropImportDiffItem[] = [];
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let textareaDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function escapeHtmlProps(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function renderPropsView(forceRefresh = false): Promise<void> {
  const container = document.getElementById('props-list-container');
  if (!container) return;

  if (!virtualPropList) {
    virtualPropList = new VirtualPropList({
      container,
      itemHeight: 56,
      overscan: 6,
      onSelectProp: (prop) => {
        openPropEditSheet(prop);
      }
    });
  }

  try {
    const state = await propsEngine.fetchProps(forceRefresh);
    currentPropsList = state.props;
    virtualPropList.setProps(currentPropsList);
    updatePropsCountBadge();
  } catch (err) {
    console.error('Failed to load system properties:', err);
    toast('Failed to load system properties');
  }
}

function updatePropsCountBadge(): void {
  const badge = document.getElementById('props-count-badge');
  if (!badge || !virtualPropList) return;
  const filtered = virtualPropList.getFilteredCount();
  const total = virtualPropList.getTotalCount();
  if (filtered !== total) {
    badge.innerText = `${filtered} / ${total} props`;
  } else {
    badge.innerText = `${total} props`;
  }
}

function openPropEditSheet(prop?: SystemPropItem): void {
  const backdrop = document.getElementById('prop-edit-sheet-backdrop');
  const title = document.getElementById('prop-edit-sheet-title');
  const subtitle = document.getElementById('prop-edit-sheet-subtitle');
  const keyInput = document.getElementById('prop-edit-key') as HTMLInputElement | null;
  const origVal = document.getElementById('prop-edit-orig-val');
  const liveVal = document.getElementById('prop-edit-live-val');
  const valInput = document.getElementById('prop-edit-value') as HTMLInputElement | null;
  const bootSwitch = document.getElementById('prop-edit-boot-switch') as HTMLInputElement | null;
  const resetBtn = document.getElementById('prop-edit-reset-btn');
  const deleteBtn = document.getElementById('prop-edit-delete-btn');

  if (!backdrop) return;

  if (prop) {
    activeEditProp = prop;
    if (title) title.innerText = 'Edit Property';
    if (subtitle) subtitle.innerText = prop.key;
    if (keyInput) {
      keyInput.value = prop.key;
      keyInput.readOnly = true;
      keyInput.style.opacity = '0.75';
    }
    if (origVal) origVal.innerText = prop.defaultValue || '(none)';
    if (liveVal) liveVal.innerText = prop.value || '(empty)';
    if (valInput) valInput.value = prop.customValue !== null ? prop.customValue : prop.value;
    if (bootSwitch) bootSwitch.checked = prop.applyBoot;

    if (resetBtn) {
      resetBtn.style.display = prop.isModified || prop.applyBoot ? 'inline-flex' : 'none';
    }
    if (deleteBtn) {
      deleteBtn.style.display = prop.isCustom ? 'inline-flex' : 'none';
    }
  } else {
    activeEditProp = null;
    if (title) title.innerText = 'Add Property';
    if (subtitle) subtitle.innerText = 'Create custom system property';
    if (keyInput) {
      keyInput.value = '';
      keyInput.readOnly = false;
      keyInput.style.opacity = '1';
    }
    if (origVal) origVal.innerText = '(new)';
    if (liveVal) liveVal.innerText = '(none)';
    if (valInput) valInput.value = '';
    if (bootSwitch) bootSwitch.checked = true;

    if (resetBtn) resetBtn.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = 'none';
  }

  backdrop.style.display = 'flex';
  requestAnimationFrame(() => backdrop.classList.add('active'));

  try {
    history.pushState({ modal: 'prop-edit' }, '');
  } catch (e) {}
}

function closePropEditSheet(): void {
  const backdrop = document.getElementById('prop-edit-sheet-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    setTimeout(() => {
      backdrop.style.display = 'none';
    }, 250);
  }
}

function openPropImportDialog(): void {
  const backdrop = document.getElementById('prop-import-dialog-backdrop');
  const fileInput = document.getElementById('prop-import-file-input') as HTMLInputElement | null;
  const fileName = document.getElementById('prop-import-filename');
  const textarea = document.getElementById('prop-import-paste-textarea') as HTMLTextAreaElement | null;
  const diffContainer = document.getElementById('prop-import-diff-container');
  const diffTbody = document.getElementById('prop-import-diff-tbody');

  if (fileInput) fileInput.value = '';
  if (fileName) fileName.innerText = '';
  if (textarea) textarea.value = '';
  if (diffContainer) diffContainer.style.display = 'none';
  if (diffTbody) diffTbody.innerHTML = '';
  parsedImportDiffs = [];

  if (backdrop) {
    backdrop.style.display = 'flex';
    requestAnimationFrame(() => backdrop.classList.add('active'));
    try {
      history.pushState({ modal: 'prop-import' }, '');
    } catch (e) {}
  }
}

function closePropImportDialog(): void {
  const backdrop = document.getElementById('prop-import-dialog-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    setTimeout(() => {
      backdrop.style.display = 'none';
    }, 250);
  }
}

function updateImportDiffPreview(rawText: string): void {
  const diffContainer = document.getElementById('prop-import-diff-container');
  const diffTbody = document.getElementById('prop-import-diff-tbody');
  if (!diffContainer || !diffTbody) return;

  const parsed = parsePropsText(rawText);
  const keys = Object.keys(parsed);

  if (keys.length === 0) {
    diffContainer.style.display = 'none';
    diffTbody.innerHTML = '';
    parsedImportDiffs = [];
    return;
  }

  const currentMap = new Map<string, string>();
  for (const item of currentPropsList) {
    currentMap.set(item.key, item.value);
  }

  parsedImportDiffs = keys.map((key) => {
    const currentVal = currentMap.get(key) ?? '';
    const newVal = parsed[key] ?? '';
    const status: 'add' | 'modify' | 'unchanged' = !currentMap.has(key)
      ? 'add'
      : currentVal !== newVal
      ? 'modify'
      : 'unchanged';

    return {
      key,
      currentValue: currentVal,
      newValue: newVal,
      selected: true,
      status
    };
  });

  diffContainer.style.display = 'block';
  diffTbody.innerHTML = parsedImportDiffs
    .map((diff, index) => {
      const tagClass = diff.status === 'add' ? 'diff-tag tag-add' : diff.status === 'modify' ? 'diff-tag tag-modify' : 'diff-tag tag-same';
      const tagLabel = diff.status === 'add' ? 'NEW' : diff.status === 'modify' ? 'MOD' : 'SAME';
      return `
        <tr style="border-bottom: 1px solid var(--md-sys-color-outline-variant);">
          <td style="padding: 6px 8px; vertical-align: middle;">
            <input type="checkbox" class="prop-import-item-chk" data-idx="${index}" ${diff.selected ? 'checked' : ''}>
          </td>
          <td style="padding: 6px 8px; font-family: var(--font-mono); font-weight: 500; word-break: break-all;">
            ${escapeHtmlProps(diff.key)}
            <span class="${tagClass}" style="margin-left: 4px; font-size: 0.65rem; padding: 1px 4px; border-radius: 4px;">${tagLabel}</span>
          </td>
          <td class="diff-before" style="padding: 6px 8px; font-family: var(--font-mono); color: var(--md-sys-color-on-surface-variant); word-break: break-all;">
            ${escapeHtmlProps(diff.currentValue || '(none)')}
          </td>
          <td class="diff-after" style="padding: 6px 8px; font-family: var(--font-mono); color: var(--md-sys-color-primary); font-weight: 600; word-break: break-all;">
            ${escapeHtmlProps(diff.newValue)}
          </td>
        </tr>
      `;
    })
    .join('');

  // Wire individual item checkboxes
  diffTbody.querySelectorAll<HTMLInputElement>('.prop-import-item-chk').forEach((chk) => {
    chk.addEventListener('change', () => {
      const idx = parseInt(chk.getAttribute('data-idx') ?? '-1', 10);
      if (idx >= 0 && parsedImportDiffs[idx]) {
        parsedImportDiffs[idx].selected = chk.checked;
      }
    });
  });
}

function openPropExportSheet(): void {
  const backdrop = document.getElementById('prop-export-sheet-backdrop');
  if (backdrop) {
    backdrop.style.display = 'flex';
    requestAnimationFrame(() => backdrop.classList.add('active'));
    try {
      history.pushState({ modal: 'prop-export' }, '');
    } catch (e) {}
  }
}

function closePropExportSheet(): void {
  const backdrop = document.getElementById('prop-export-sheet-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    setTimeout(() => {
      backdrop.style.display = 'none';
    }, 250);
  }
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
      } else if (feature === 'network-management') {
        showTuningSubView('net-management', true);
      } else if (feature === 'props-management') {
        showTuningSubView('props-management', true);
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

  const netBackBtn = document.getElementById('tune-net-back-btn');
  if (netBackBtn) {
    netBackBtn.addEventListener('click', () => {
      if (history.state?.subview === 'net-management') history.back();
      else showTuningSubView('hub', false);
    });
  }

  const propsBackBtn = document.getElementById('props-back-hub-btn');
  if (propsBackBtn) {
    propsBackBtn.addEventListener('click', () => {
      if (history.state?.subview === 'props-management') history.back();
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

  // Network Toggle Switch
  const netEnableToggle = document.getElementById('net-enable-toggle') as HTMLInputElement | null;
  if (netEnableToggle) {
    netEnableToggle.addEventListener('change', async (e) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      if (isChecked) {
        await renderNetView(true);
      } else {
        if (currentNetData) currentNetData.enabled = false;
        const grid = document.getElementById('net-tuning-grid');
        if (grid) {
          grid.innerHTML =
            '<div class="grid-placeholder" style="padding: 24px; text-align: center;">Network Tuning is disabled.<br><span style="font-size: 0.8rem; opacity: 0.7;">Turn ON the toggle above to inspect and customize TCP congestion controls.</span></div>';
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
        const isEnabled = ioEnable?.checked ?? false;

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

        const choice = await askApplyBoot({
          title: 'Apply at Boot?',
          message:
            'Do you want to re-apply these custom storage schedulers on system boot, or only apply them for the current session?'
        });
        if (choice === null) return;
        const applyBoot = choice;

        toast('Applying I/O scheduler configuration...');
        const ok = await applyIoConfig(configMap, applyBoot, isEnabled);
        if (ok) {
          toast(
            applyBoot
              ? 'I/O configuration applied and saved to boot!'
              : 'I/O configuration applied for current session!'
          );
          renderIoView();
        } else {
          toast('Failed to apply I/O configuration');
        }
      } else if (currentSub === 'net-management') {
        const netEnable = document.getElementById('net-enable-toggle') as HTMLInputElement | null;
        const isEnabled = netEnable?.checked ?? false;

        const activeRadio = document.querySelector<HTMLElement>(
          '#net-algo-radio-list .m3e-radio-card.active'
        );
        const selectedAlgo =
          activeRadio?.getAttribute('data-algo') ||
          currentNetData?.customAlgo ||
          currentNetData?.currentAlgo ||
          'cubic';

        const choice = await askApplyBoot({
          title: 'Apply at Boot?',
          message: `Do you want to re-apply TCP congestion control (${selectedAlgo}) on system boot, or only apply it for the current session?`
        });
        if (choice === null) return;
        const applyBoot = choice;

        toast('Applying TCP congestion control...');
        const ok = await applyNetConfig(selectedAlgo, applyBoot, isEnabled);
        if (ok) {
          toast(
            applyBoot
              ? `TCP ${selectedAlgo} applied and saved to boot!`
              : `TCP ${selectedAlgo} applied for current session!`
          );
          renderNetView();
        } else {
          toast('Failed to apply network configuration');
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
      } else if (currentSub === 'net-management') {
        toast('Resetting TCP congestion control to default...');
        const ok = await resetNetConfig();
        if (ok) {
          toast('TCP congestion control reset to default system value!');
          renderNetView();
        } else {
          toast('Failed to reset network configuration');
        }
      }
    });
  }

  // ==========================================
  // SYSTEM PROPERTIES EVENT WIRING
  // ==========================================

  // Speed Dial FAB Controls
  const propsFabContainer = document.getElementById('props-fab-container');
  const propsFabScrim = document.getElementById('props-fab-scrim');
  const propsFabTrigger = document.getElementById('props-fab-trigger');

  const closeSpeedDial = () => {
    if (propsFabContainer) propsFabContainer.classList.remove('speed-dial-open');
    if (propsFabScrim) propsFabScrim.classList.remove('visible');
    if (propsFabTrigger) propsFabTrigger.setAttribute('aria-expanded', 'false');
  };

  const toggleSpeedDial = () => {
    if (!propsFabContainer) return;
    const willOpen = !propsFabContainer.classList.contains('speed-dial-open');
    propsFabContainer.classList.toggle('speed-dial-open', willOpen);
    if (propsFabScrim) propsFabScrim.classList.toggle('visible', willOpen);
    if (propsFabTrigger) propsFabTrigger.setAttribute('aria-expanded', String(willOpen));
  };

  if (propsFabTrigger) {
    propsFabTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSpeedDial();
    });
  }

  if (propsFabScrim) {
    propsFabScrim.addEventListener('click', () => {
      closeSpeedDial();
    });
  }

  const fabAddProp = document.getElementById('fab-add-prop');
  if (fabAddProp) {
    fabAddProp.addEventListener('click', () => {
      closeSpeedDial();
      openPropEditSheet();
    });
  }

  const fabImportProps = document.getElementById('fab-import-props');
  if (fabImportProps) {
    fabImportProps.addEventListener('click', () => {
      closeSpeedDial();
      openPropImportDialog();
    });
  }

  const fabExportProps = document.getElementById('fab-export-props');
  if (fabExportProps) {
    fabExportProps.addEventListener('click', () => {
      closeSpeedDial();
      openPropExportSheet();
    });
  }

  const handleResetProps = async () => {
    closeSpeedDial();
    const confirmed = window.confirm(
      'Reset all system properties back to their factory/original defaults? This will revert all modified and custom properties and clear boot overrides.'
    );
    if (!confirmed) return;
    toast('Resetting all properties to defaults...');
    const ok = await propsEngine.resetAllProps();
    if (ok) {
      toast('All properties reset to original defaults!');
      await renderPropsView(false);
    } else {
      toast('Failed to reset all properties');
    }
  };

  const fabResetProps = document.getElementById('fab-reset-props');
  if (fabResetProps) {
    fabResetProps.addEventListener('click', handleResetProps);
  }

  // Legacy/Fallback Action Bar Buttons
  const btnAddProp = document.getElementById('btn-add-prop');
  if (btnAddProp) {
    btnAddProp.addEventListener('click', () => {
      openPropEditSheet();
    });
  }

  const btnImportProps = document.getElementById('btn-import-props');
  if (btnImportProps) {
    btnImportProps.addEventListener('click', () => {
      openPropImportDialog();
    });
  }

  const btnExportProps = document.getElementById('btn-export-props');
  if (btnExportProps) {
    btnExportProps.addEventListener('click', () => {
      openPropExportSheet();
    });
  }

  const btnResetProps = document.getElementById('btn-reset-props');
  if (btnResetProps) {
    btnResetProps.addEventListener('click', handleResetProps);
  }

  // Search input and clear button
  const propSearchInput = document.getElementById('prop-search-input') as HTMLInputElement | null;
  const propSearchClear = document.getElementById('prop-search-clear');
  if (propSearchInput) {
    propSearchInput.addEventListener('input', () => {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        const term = propSearchInput.value;
        if (virtualPropList) {
          virtualPropList.setSearchTerm(term);
          updatePropsCountBadge();
        }
        if (propSearchClear) {
          propSearchClear.style.display = term ? 'block' : 'none';
        }
      }, 150);
    });
  }

  if (propSearchClear && propSearchInput) {
    propSearchClear.addEventListener('click', () => {
      propSearchInput.value = '';
      propSearchClear.style.display = 'none';
      if (virtualPropList) {
        virtualPropList.setSearchTerm('');
        updatePropsCountBadge();
      }
      propSearchInput.focus();
    });
  }

  // Filter chips
  const filterChips = document.querySelectorAll<HTMLElement>('[data-prop-filter]');
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filterChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const mode = (chip.getAttribute('data-prop-filter') || 'all') as 'all' | 'modified' | 'boot';
      if (virtualPropList) {
        virtualPropList.setFilterMode(mode);
        updatePropsCountBadge();
      }
    });
  });

  // Edit sheet listeners
  const editBackdrop = document.getElementById('prop-edit-sheet-backdrop');
  if (editBackdrop) {
    editBackdrop.addEventListener('click', (e) => {
      if (e.target === editBackdrop) closePropEditSheet();
    });
  }

  const editCloseBtn = document.getElementById('prop-edit-sheet-close');
  if (editCloseBtn) {
    editCloseBtn.addEventListener('click', closePropEditSheet);
  }

  const editCancelBtn = document.getElementById('prop-edit-cancel-btn');
  if (editCancelBtn) {
    editCancelBtn.addEventListener('click', closePropEditSheet);
  }

  const savePropBtn = document.getElementById('prop-edit-save-btn');
  if (savePropBtn) {
    savePropBtn.addEventListener('click', async () => {
      const keyInput = document.getElementById('prop-edit-key') as HTMLInputElement | null;
      const valInput = document.getElementById('prop-edit-value') as HTMLInputElement | null;
      const bootSwitch = document.getElementById('prop-edit-boot-switch') as HTMLInputElement | null;

      const key = keyInput?.value.trim() ?? '';
      const val = valInput?.value.trim() ?? '';
      const boot = bootSwitch?.checked ?? false;

      if (!key) {
        toast('Property key cannot be empty');
        return;
      }

      toast(`Applying ${key}...`);
      const ok = await propsEngine.applyProp(key, val, boot);
      if (ok) {
        toast(`Property ${key} saved & applied!`);
        closePropEditSheet();
        await renderPropsView(false);
      } else {
        toast(`Failed to apply property ${key}`);
      }
    });
  }

  const resetPropBtn = document.getElementById('prop-edit-reset-btn');
  if (resetPropBtn) {
    resetPropBtn.addEventListener('click', async () => {
      if (!activeEditProp) return;
      const key = activeEditProp.key;
      toast(`Resetting ${key}...`);
      const ok = await propsEngine.resetProp(key);
      if (ok) {
        toast(`Property ${key} reset to default!`);
        closePropEditSheet();
        await renderPropsView(false);
      } else {
        toast(`Failed to reset ${key}`);
      }
    });
  }

  const deletePropBtn = document.getElementById('prop-edit-delete-btn');
  if (deletePropBtn) {
    deletePropBtn.addEventListener('click', async () => {
      if (!activeEditProp) return;
      const key = activeEditProp.key;
      toast(`Deleting custom property ${key}...`);
      const ok = await propsEngine.resetProp(key);
      if (ok) {
        toast(`Custom property ${key} deleted!`);
        closePropEditSheet();
        await renderPropsView(false);
      } else {
        toast(`Failed to delete ${key}`);
      }
    });
  }

  // Import dialog listeners
  const importBackdrop = document.getElementById('prop-import-dialog-backdrop');
  if (importBackdrop) {
    importBackdrop.addEventListener('click', (e) => {
      if (e.target === importBackdrop) closePropImportDialog();
    });
  }

  const importCancelBtn = document.getElementById('prop-import-cancel-btn');
  if (importCancelBtn) {
    importCancelBtn.addEventListener('click', closePropImportDialog);
  }

  const importFileInput = document.getElementById('prop-import-file-input') as HTMLInputElement | null;
  const importFilename = document.getElementById('prop-import-filename');
  const importTextarea = document.getElementById('prop-import-paste-textarea') as HTMLTextAreaElement | null;

  if (importFileInput) {
    importFileInput.addEventListener('change', () => {
      const file = importFileInput.files?.[0];
      if (file) {
        if (importFilename) importFilename.innerText = file.name;
        const reader = new FileReader();
        reader.onload = () => {
          const text = (reader.result as string) || '';
          if (importTextarea) importTextarea.value = text;
          updateImportDiffPreview(text);
        };
        reader.readAsText(file);
      }
    });
  }

  if (importTextarea) {
    importTextarea.addEventListener('input', () => {
      if (textareaDebounceTimer) clearTimeout(textareaDebounceTimer);
      textareaDebounceTimer = setTimeout(() => {
        updateImportDiffPreview(importTextarea.value);
      }, 200);
    });
  }

  const selectAllChk = document.getElementById('prop-import-select-all') as HTMLInputElement | null;
  if (selectAllChk) {
    selectAllChk.addEventListener('change', () => {
      const checked = selectAllChk.checked;
      parsedImportDiffs.forEach((d) => (d.selected = checked));
      document.querySelectorAll<HTMLInputElement>('.prop-import-item-chk').forEach((chk) => {
        chk.checked = checked;
      });
    });
  }

  const importSubmitBtn = document.getElementById('prop-import-submit-btn');
  if (importSubmitBtn) {
    importSubmitBtn.addEventListener('click', async () => {
      if (parsedImportDiffs.length === 0 && importTextarea && importTextarea.value.trim()) {
        updateImportDiffPreview(importTextarea.value);
      }

      const selectedDiffs = parsedImportDiffs.filter((d) => d.selected !== false);
      if (selectedDiffs.length === 0) {
        toast('No properties selected for import');
        return;
      }

      const applyLiveChk = document.getElementById('prop-import-apply-live') as HTMLInputElement | null;
      const setBootChk = document.getElementById('prop-import-set-boot') as HTMLInputElement | null;
      const applyLive = applyLiveChk?.checked ?? true;
      const setBoot = setBootChk?.checked ?? true;

      toast(`Importing ${selectedDiffs.length} properties...`);
      const ok = await propsEngine.importProps(selectedDiffs, setBoot, applyLive);
      if (ok) {
        toast(`Successfully imported ${selectedDiffs.length} properties!`);
        closePropImportDialog();
        await renderPropsView(false);
      } else {
        toast('Failed to import properties');
      }
    });
  }

  // Export sheet listeners
  const exportBackdrop = document.getElementById('prop-export-sheet-backdrop');
  if (exportBackdrop) {
    exportBackdrop.addEventListener('click', (e) => {
      if (e.target === exportBackdrop) closePropExportSheet();
    });
  }

  const exportCloseBtn = document.getElementById('prop-export-sheet-close');
  if (exportCloseBtn) {
    exportCloseBtn.addEventListener('click', closePropExportSheet);
  }

  const exportCloseBottomBtn = document.getElementById('prop-export-close-btn');
  if (exportCloseBottomBtn) {
    exportCloseBottomBtn.addEventListener('click', closePropExportSheet);
  }

  const exportDownloadBtn = document.getElementById('prop-export-download-btn');
  if (exportDownloadBtn) {
    exportDownloadBtn.addEventListener('click', () => {
      const selectedChoice = document.querySelector<HTMLInputElement>(
        'input[name="prop-export-choice"]:checked'
      );
      const includeAll = selectedChoice?.value === 'all';
      const text = propsEngine.exportProps(includeAll);
      downloadTextFile('sweetclocker_props.prop', text);
      toast('Properties downloaded as .prop file');
      closePropExportSheet();
    });
  }

  const exportCopyBtn = document.getElementById('prop-export-copy-btn');
  if (exportCopyBtn) {
    exportCopyBtn.addEventListener('click', async () => {
      const selectedChoice = document.querySelector<HTMLInputElement>(
        'input[name="prop-export-choice"]:checked'
      );
      const includeAll = selectedChoice?.value === 'all';
      const text = propsEngine.exportProps(includeAll);
      try {
        await navigator.clipboard.writeText(text);
        toast('Properties copied to clipboard!');
        closePropExportSheet();
      } catch (err) {
        console.error('Clipboard copy failed:', err);
        toast('Failed to copy to clipboard');
      }
    });
  }
}
