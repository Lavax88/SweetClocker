import type { M3eBottomSheetElement } from '@m3e/web/bottom-sheet';
import type { M3eSelectionListElement } from '@m3e/web/list';
import type { M3eSwitchElement } from '@m3e/web/switch';
import type { M3eCheckboxElement } from '@m3e/web/checkbox';
import type {
  TelemetrySnapshot,
  IoStats,
  NetStats,
  CpuConfigLimits,
  GpuConfigLimits
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
import { renderPropsView, setupPropsListeners, closePropsSpeedDial } from './props';
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

const SUBVIEW_TITLES: Record<TuningSubView, string> = {
  hub: 'SweetClocker',
  'cpu-clocks': 'CPU Configuration',
  'gpu-clocks': 'GPU Configuration',
  'io-management': 'I/O Management',
  'net-management': 'Network Configuration',
  'props-management': 'System Properties'
};

const TCP_ALGO_DESCRIPTIONS: Record<string, string> = {
  bbr: 'Google BBR: Model-based congestion control optimizing throughput and latency over Wi-Fi and mobile networks.',
  cubic: 'CUBIC: Window-based congestion control designed for high-bandwidth, high-latency networks.',
  reno: 'TCP Reno: Traditional loss-based additive-increase / multiplicative-decrease (AIMD) algorithm.',
  bic: 'BIC: Binary Increase Congestion control for networks with large delay-bandwidth product.',
  westwood: 'TCP Westwood: Bandwidth-estimation algorithm for lossy wireless environments.',
  westwoodplus: 'TCP Westwood+: Improved Westwood with enhanced RTT estimation.',
  fq_codel: 'FQ-CoDel: Fair Queuing with Controlled Delay packet scheduler.',
  dctcp: 'DCTCP: Data Center TCP utilizing Explicit Congestion Notification (ECN).',
  vegas: 'TCP Vegas: Delay-based congestion avoidance measuring RTT variations.',
  scalable: 'Scalable TCP: Algorithm designed for gigabit wide-area networks.'
};

function getAlgoDescription(algo: string): string {
  const key = algo.toLowerCase();
  return TCP_ALGO_DESCRIPTIONS[key] ?? `Kernel-provided TCP congestion control module (${algo}).`;
}

function syncAppBarForSubview(viewName: TuningSubView): void {
  const backBtn = document.getElementById('subview-back-btn');
  const statusChip = document.getElementById('service-status');
  const brandIcon = document.getElementById('app-bar-brand-icon');
  const titleText = document.getElementById('app-bar-title-text');

  const inSubview = viewName !== 'hub';
  if (backBtn) backBtn.style.display = inSubview ? 'inline-flex' : 'none';
  if (statusChip) statusChip.style.display = inSubview ? 'none' : 'inline-flex';
  if (brandIcon) brandIcon.style.display = inSubview ? 'none' : 'inline-flex';
  if (titleText) titleText.innerText = SUBVIEW_TITLES[viewName];
}

export function showTuningSubView(viewName: TuningSubView, pushHistory = true): void {
  closePropsSpeedDial();

  const views: Record<TuningSubView, HTMLElement | null> = {
    hub: document.getElementById('tuning-hub-view'),
    'cpu-clocks': document.getElementById('tuning-cpu-clocks-view'),
    'gpu-clocks': document.getElementById('tuning-gpu-clocks-view'),
    'io-management': document.getElementById('tuning-io-view'),
    'net-management': document.getElementById('tuning-net-view'),
    'props-management': document.getElementById('tuning-props-subview')
  };

  (Object.keys(views) as TuningSubView[]).forEach((key) => {
    const el = views[key];
    if (el) el.style.display = key === viewName ? 'flex' : 'none';
  });

  const fabContainer = document.getElementById('tuning-fab-container');
  const propsFabContainer = document.getElementById('props-fab-container');

  if (viewName === 'props-management') {
    if (fabContainer) fabContainer.style.display = 'none';
    if (propsFabContainer) propsFabContainer.style.display = 'flex';
  } else if (viewName !== 'hub') {
    if (propsFabContainer) propsFabContainer.style.display = 'none';
    if (fabContainer) fabContainer.style.display = 'flex';
  } else {
    if (propsFabContainer) propsFabContainer.style.display = 'none';
    if (fabContainer) fabContainer.style.display = 'none';
  }

  syncAppBarForSubview(viewName);

  const currentView = store.get('currentTuningSubView');
  if (pushHistory && currentView !== viewName) {
    try {
      history.pushState({ subview: viewName }, '');
    } catch (_) {}
  }
  store.set('currentTuningSubView', viewName);

  if (viewName === 'io-management') renderIoView();
  else if (viewName === 'net-management') renderNetView();
  else if (viewName === 'props-management') renderPropsView();
}

export function updateGpuControlsLockState(): void {
  const checkbox = document.getElementById('gpu-acknowledge-checkbox') as M3eCheckboxElement | null;
  const gpuGrid = document.getElementById('gpu-tuning-grid');
  if (!gpuGrid) return;
  gpuGrid.classList.toggle('gpu-controls-disabled', !(checkbox && checkbox.checked));
}

export function renderTuningViewWithData(
  data: TelemetrySnapshot,
  forceUpdateTriggers = false
): void {
  const grid = document.getElementById('tuning-grid');
  if (grid) {
    const existingCards = grid.querySelectorAll<HTMLElement>('.tuning-card[data-cluster-id]');
    if (existingCards.length !== CLUSTERS_CONFIG.length) {
      grid.innerHTML = '';
      for (const cluster of CLUSTERS_CONFIG) {
        grid.appendChild(renderClusterTuningCard(cluster, data));
      }
    } else {
      CLUSTERS_CONFIG.forEach((cluster, idx) => {
        const card = existingCards[idx];
        if (card) updateClusterTuningCardValues(card, cluster, data, forceUpdateTriggers);
      });
    }
  }

  const gpuGrid = document.getElementById('gpu-tuning-grid');
  if (gpuGrid) {
    const gpuCard = gpuGrid.querySelector<HTMLElement>('.tuning-card[data-gpu-card]');
    if (!gpuCard) {
      gpuGrid.innerHTML = '';
      gpuGrid.appendChild(renderGpuTuningCard(data));
    } else {
      updateGpuTuningCardValues(gpuCard, data, forceUpdateTriggers);
    }
  }
}

function renderClusterTuningCard(cluster: ClusterConfig, data: TelemetrySnapshot): HTMLElement {
  const card = document.createElement('m3e-card');
  card.setAttribute('variant', 'elevated');
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

  if (realHwMax > 0) avail = avail.filter((f) => f <= realHwMax);
  if (!avail.includes(curMin)) avail.push(curMin);
  if (!avail.includes(curMax) && curMax <= realHwMax) avail.push(curMax);
  if (!avail.includes(cluster.sweetclockMax) && cluster.sweetclockMax <= realHwMax) {
    avail.push(cluster.sweetclockMax);
  }
  avail = Array.from(new Set(avail)).sort((a, b) => a - b);
  const hwMax = avail[avail.length - 1] ?? realHwMax;

  const maxBadge =
    curMax === cluster.sweetclockMax
      ? '<m3e-badge size="large" class="m3e-tag-modified">★ Sweetclock</m3e-badge>'
      : curMax === hwMax
        ? '<m3e-badge size="large" class="m3e-tag-ro">HW Max</m3e-badge>'
        : '';

  card.innerHTML = `
    <div slot="content" class="tuning-card-inner">
      <div class="tuning-card-header">
        <span class="tuning-card-title">${cluster.name}</span>
        <m3e-badge size="large" class="cluster-badge">${cluster.clusterLabel}</m3e-badge>
      </div>

      <div class="tuning-stats-row">
        <span>Active</span>
        <span class="tuning-stat-val" id="${cluster.id}-active-lbl">${formatFreqMHz(curMin)} – ${formatFreqMHz(curMax)} [${curGov}]</span>
      </div>

      <m3e-action-list variant="segmented">
        <m3e-list-action id="${cluster.id}-gov-trigger" data-val="${curGov}">
          Governor
          <span slot="supporting-text" id="${cluster.id}-gov-val">${curGov}</span>
          <m3e-icon slot="trailing" name="arrow_drop_down"></m3e-icon>
        </m3e-list-action>
        <m3e-list-action id="${cluster.id}-min-trigger" data-val="${curMin}">
          Min Frequency
          <span slot="supporting-text" id="${cluster.id}-min-val">${formatFreqMHz(curMin)}</span>
          <m3e-icon slot="trailing" name="arrow_drop_down"></m3e-icon>
        </m3e-list-action>
        <m3e-list-action id="${cluster.id}-max-trigger" data-val="${curMax}">
          Max Frequency
          <span slot="supporting-text" id="${cluster.id}-max-val">${formatFreqMHz(curMax)}</span>
          <span slot="trailing" id="${cluster.id}-max-badge" style="display: inline-flex; align-items: center; gap: 6px;">
            ${maxBadge}
            <m3e-icon name="arrow_drop_down"></m3e-icon>
          </span>
        </m3e-list-action>
      </m3e-action-list>
    </div>
  `;

  setTimeout(() => {
    const minTrigger = card.querySelector<HTMLElement>(`#${cluster.id}-min-trigger`);
    const maxTrigger = card.querySelector<HTMLElement>(`#${cluster.id}-max-trigger`);
    const govTrigger = card.querySelector<HTMLElement>(`#${cluster.id}-gov-trigger`);
    const minValLbl = card.querySelector<HTMLElement>(`#${cluster.id}-min-val`);
    const maxValLbl = card.querySelector<HTMLElement>(`#${cluster.id}-max-val`);
    const maxBadgeWrap = card.querySelector<HTMLElement>(`#${cluster.id}-max-badge`);
    const govValLbl = card.querySelector<HTMLElement>(`#${cluster.id}-gov-val`);

    govTrigger?.addEventListener('click', () => {
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
    });

    minTrigger?.addEventListener('click', () => {
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
    });

    maxTrigger?.addEventListener('click', () => {
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
          if (maxValLbl) maxValLbl.innerText = formatFreqMHz(selectedFreq);
          const badge =
            selectedFreq === cluster.sweetclockMax
              ? '<m3e-badge size="large" class="m3e-tag-modified">★ Sweetclock</m3e-badge>'
              : selectedFreq === hwMax
                ? '<m3e-badge size="large" class="m3e-tag-ro">HW Max</m3e-badge>'
                : '';
          if (maxBadgeWrap) {
            maxBadgeWrap.innerHTML = `${badge}<m3e-icon name="arrow_drop_down"></m3e-icon>`;
          }
        }
      });
    });
  }, 0);

  return card;
}

function updateClusterTuningCardValues(
  card: HTMLElement,
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
    const maxValLbl = card.querySelector<HTMLElement>(`#${cluster.id}-max-val`);
    const maxBadgeWrap = card.querySelector<HTMLElement>(`#${cluster.id}-max-badge`);
    if (maxTrig) maxTrig.setAttribute('data-val', String(curMax));
    if (maxValLbl) maxValLbl.innerText = formatFreqMHz(curMax);
    if (maxBadgeWrap) {
      const badge =
        curMax === cluster.sweetclockMax
          ? '<m3e-badge size="large" class="m3e-tag-modified">★ Sweetclock</m3e-badge>'
          : '';
      maxBadgeWrap.innerHTML = `${badge}<m3e-icon name="arrow_drop_down"></m3e-icon>`;
    }

    const govTrig = card.querySelector<HTMLElement>(`#${cluster.id}-gov-trigger`);
    const govValLbl = card.querySelector<HTMLElement>(`#${cluster.id}-gov-val`);
    if (govTrig) govTrig.setAttribute('data-val', curGov);
    if (govValLbl) govValLbl.innerText = curGov;
  }
}

function renderGpuTuningCard(data: TelemetrySnapshot): HTMLElement {
  const card = document.createElement('m3e-card');
  card.setAttribute('variant', 'elevated');
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
  const minBadge = curMin === 264 ? '<m3e-badge size="large" class="m3e-tag-boot">Default</m3e-badge>' : '';
  const maxBadge =
    curMax === hwMax
      ? '<m3e-badge size="large" class="m3e-tag-ro">HW Max</m3e-badge>'
      : curMax === 937
        ? '<m3e-badge size="large" class="m3e-tag-boot">Default</m3e-badge>'
        : '';

  card.innerHTML = `
    <div slot="content" class="tuning-card-inner">
      <div class="tuning-card-header">
        <span class="tuning-card-title">${gpuData.model || 'Adreno GPU'}</span>
      </div>

      <div class="tuning-stats-row">
        <span>Active</span>
        <span class="tuning-stat-val" id="gpu-active-lbl">${curMin} MHz – ${curMax} MHz [${curGov}]</span>
      </div>

      <m3e-action-list variant="segmented">
        <m3e-list-action id="gpu-gov-trigger" data-val="${curGov}">
          Governor
          <span slot="supporting-text" id="gpu-gov-val">${curGov}</span>
          <m3e-icon slot="trailing" name="arrow_drop_down"></m3e-icon>
        </m3e-list-action>
        <m3e-list-action id="gpu-min-trigger" data-val="${curMin}">
          Min Frequency
          <span slot="supporting-text" id="gpu-min-val">${curMin} MHz</span>
          <span slot="trailing" id="gpu-min-badge" style="display: inline-flex; align-items: center; gap: 6px;">
            ${minBadge}
            <m3e-icon name="arrow_drop_down"></m3e-icon>
          </span>
        </m3e-list-action>
        <m3e-list-action id="gpu-max-trigger" data-val="${curMax}">
          Max Frequency
          <span slot="supporting-text" id="gpu-max-val">${curMax} MHz</span>
          <span slot="trailing" id="gpu-max-badge" style="display: inline-flex; align-items: center; gap: 6px;">
            ${maxBadge}
            <m3e-icon name="arrow_drop_down"></m3e-icon>
          </span>
        </m3e-list-action>
      </m3e-action-list>
    </div>
  `;

  setTimeout(() => {
    const minTrigger = card.querySelector<HTMLElement>('#gpu-min-trigger');
    const maxTrigger = card.querySelector<HTMLElement>('#gpu-max-trigger');
    const govTrigger = card.querySelector<HTMLElement>('#gpu-gov-trigger');
    const govValLbl = card.querySelector<HTMLElement>('#gpu-gov-val');
    const minValLbl = card.querySelector<HTMLElement>('#gpu-min-val');
    const minBadgeWrap = card.querySelector<HTMLElement>('#gpu-min-badge');
    const maxValLbl = card.querySelector<HTMLElement>('#gpu-max-val');
    const maxBadgeWrap = card.querySelector<HTMLElement>('#gpu-max-badge');

    govTrigger?.addEventListener('click', () => {
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
    });

    minTrigger?.addEventListener('click', () => {
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
          if (minValLbl) minValLbl.innerText = `${selectedFreq} MHz`;
          const badge = selectedFreq === 264 ? '<m3e-badge size="large" class="m3e-tag-boot">Default</m3e-badge>' : '';
          if (minBadgeWrap) {
            minBadgeWrap.innerHTML = `${badge}<m3e-icon name="arrow_drop_down"></m3e-icon>`;
          }
        }
      });
    });

    maxTrigger?.addEventListener('click', () => {
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
          if (maxValLbl) maxValLbl.innerText = `${selectedFreq} MHz`;
          const badge =
            selectedFreq === hwMax
              ? '<m3e-badge size="large" class="m3e-tag-ro">HW Max</m3e-badge>'
              : selectedFreq === 937
                ? '<m3e-badge size="large" class="m3e-tag-boot">Default</m3e-badge>'
                : '';
          if (maxBadgeWrap) {
            maxBadgeWrap.innerHTML = `${badge}<m3e-icon name="arrow_drop_down"></m3e-icon>`;
          }
        }
      });
    });

    updateGpuControlsLockState();
  }, 0);

  return card;
}

function updateGpuTuningCardValues(
  card: HTMLElement,
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
    const minValLbl = card.querySelector<HTMLElement>('#gpu-min-val');
    const minBadgeWrap = card.querySelector<HTMLElement>('#gpu-min-badge');
    if (minTrig) minTrig.setAttribute('data-val', String(curMin));
    if (minValLbl) minValLbl.innerText = `${curMin} MHz`;
    if (minBadgeWrap) {
      const badge = curMin === 264 ? '<m3e-badge size="large" class="m3e-tag-boot">Default</m3e-badge>' : '';
      minBadgeWrap.innerHTML = `${badge}<m3e-icon name="arrow_drop_down"></m3e-icon>`;
    }

    const maxTrig = card.querySelector<HTMLElement>('#gpu-max-trigger');
    const maxValLbl = card.querySelector<HTMLElement>('#gpu-max-val');
    const maxBadgeWrap = card.querySelector<HTMLElement>('#gpu-max-badge');
    const lastFreq = gpuData.availFreqs[gpuData.availFreqs.length - 1];
    const hwMax = lastFreq !== undefined ? lastFreq : 937;
    if (maxTrig) maxTrig.setAttribute('data-val', String(curMax));
    if (maxValLbl) maxValLbl.innerText = `${curMax} MHz`;
    if (maxBadgeWrap) {
      const badge =
        curMax === hwMax
          ? '<m3e-badge size="large" class="m3e-tag-ro">HW Max</m3e-badge>'
          : curMax === 937
            ? '<m3e-badge size="large" class="m3e-tag-boot">Default</m3e-badge>'
            : '';
      maxBadgeWrap.innerHTML = `${badge}<m3e-icon name="arrow_drop_down"></m3e-icon>`;
    }

    const govTrig = card.querySelector<HTMLElement>('#gpu-gov-trigger');
    const govValLbl = card.querySelector<HTMLElement>('#gpu-gov-val');
    if (govTrig) govTrig.setAttribute('data-val', curGov);
    if (govValLbl) govValLbl.innerText = curGov;
  }
}

export async function renderIoView(userEnabledOverride: boolean | null = null): Promise<void> {
  const grid = document.getElementById('io-tuning-grid');
  const enableToggle = document.getElementById('io-enable-toggle') as M3eSwitchElement | null;
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
    grid.innerHTML =
      '<div class="grid-placeholder">I/O Management is disabled. Turn ON the switch above to inspect and customize block device schedulers.</div>';
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
    const card = document.createElement('m3e-card');
    card.setAttribute('variant', 'elevated');
    card.className = 'tuning-card io-card';
    card.setAttribute('data-dev', blk.dev);

    const activeSched = blk.customSched || blk.active || blk.defaultSched;
    const isDefault = activeSched === blk.defaultSched;

    card.innerHTML = `
      <div slot="content" class="tuning-card-inner">
        <div class="tuning-card-header">
          <span class="tuning-card-title">/sys/block/${blk.dev}</span>
        </div>
        <m3e-action-list variant="segmented">
          <m3e-list-action class="io-sched-trigger" id="io-trigger-${blk.dev}" data-val="${activeSched}">
            I/O Scheduler
            <span slot="supporting-text" id="io-val-${blk.dev}">${activeSched}</span>
            <span slot="trailing" id="io-badge-${blk.dev}" style="display: inline-flex; align-items: center; gap: 6px;">
              ${isDefault ? '<m3e-badge size="large" class="m3e-tag-boot">Default</m3e-badge>' : ''}
              <m3e-icon name="arrow_drop_down"></m3e-icon>
            </span>
          </m3e-list-action>
        </m3e-action-list>
      </div>
    `;

    setTimeout(() => {
      const trigger = card.querySelector<HTMLElement>(`#io-trigger-${blk.dev}`);
      const valLbl = card.querySelector<HTMLElement>(`#io-val-${blk.dev}`);
      const badgeWrap = card.querySelector<HTMLElement>(`#io-badge-${blk.dev}`);

      trigger?.addEventListener('click', () => {
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
            if (badgeWrap) {
              const badge =
                selectedSched === blk.defaultSched
                  ? '<m3e-badge size="large" class="m3e-tag-boot">Default</m3e-badge>'
                  : '';
              badgeWrap.innerHTML = `${badge}<m3e-icon name="arrow_drop_down"></m3e-icon>`;
            }
          }
        });
      });
    }, 0);

    grid.appendChild(card);
  }
}

export async function renderNetView(userEnabledOverride: boolean | null = null): Promise<void> {
  const grid = document.getElementById('net-tuning-grid');
  const enableToggle = document.getElementById('net-enable-toggle') as M3eSwitchElement | null;
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
    grid.innerHTML =
      '<div class="grid-placeholder">Network Tuning is disabled. Turn ON the switch above to inspect and customize TCP congestion controls.</div>';
    return;
  }

  const activeAlgo = data.customAlgo || data.currentAlgo || data.defaultAlgo;

  const optionsHtml = data.availAlgos
    .map((algo) => {
      const isSelected = algo === activeAlgo;
      const isDefault = algo === data.defaultAlgo;
      return `
        <m3e-list-option value="${algo}" ${isSelected ? 'selected' : ''}>
          ${algo}
          <span slot="supporting-text">${getAlgoDescription(algo)}</span>
          ${isDefault ? '<m3e-badge slot="trailing" size="large" class="m3e-tag-boot">Default</m3e-badge>' : ''}
        </m3e-list-option>
      `;
    })
    .join('');

  grid.innerHTML = `
    <m3e-card variant="elevated" class="tuning-card net-card">
      <div slot="content" class="tuning-card-inner">
        <div class="tuning-card-header">
          <span class="tuning-card-title">/proc/sys/net/ipv4/tcp_congestion_control</span>
        </div>
        <div class="tuning-stats-row">
          <span>Active</span>
          <span class="tuning-stat-val" id="net-active-lbl">${data.currentAlgo} ${data.currentAlgo === data.defaultAlgo ? '(Default)' : ''}</span>
        </div>
        <m3e-selection-list id="net-algo-radio-list" variant="segmented">
          ${optionsHtml}
        </m3e-selection-list>
      </div>
    </m3e-card>
  `;
}

// Frequency Bottom Sheet Helper (M3E)
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
  const sheet = document.getElementById('freq-sheet') as M3eBottomSheetElement | null;
  const sheetTitle = document.getElementById('freq-sheet-title');
  const sheetSubtitle = document.getElementById('freq-sheet-subtitle');
  const sheetOptions = document.getElementById('freq-sheet-options') as M3eSelectionListElement | null;

  if (!sheet || !sheetOptions) return;

  try {
    history.pushState({ modal: true }, '');
  } catch (_) {}

  if (sheetTitle) sheetTitle.innerText = opts.title;
  if (sheetSubtitle) sheetSubtitle.innerText = opts.subtitle;

  sheetOptions.innerHTML = opts.availFreqs
    .map((freq) => {
      const isSelected = freq === opts.currentVal;
      const isSweet = !opts.isGpu && freq === opts.sweetclockMax;
      const isHwMax = freq === opts.hwMax;
      const isDefault =
        opts.isGpu &&
        ((opts.title.includes('Min') && freq === 264) ||
          (opts.title.includes('Max') && freq === 937));

      let badgeHtml = '';
      if (isSweet) badgeHtml += '<m3e-badge size="large" class="m3e-tag-modified">★ Sweetclock</m3e-badge>';
      if (isDefault) badgeHtml += '<m3e-badge size="large" class="m3e-tag-boot">Default</m3e-badge>';
      if (isHwMax) badgeHtml += '<m3e-badge size="large" class="m3e-tag-ro">HW Max</m3e-badge>';

      const freqLabel = opts.isGpu ? `${freq} MHz` : formatFreqMHz(freq);

      return `
        <m3e-list-option value="${freq}" ${isSelected ? 'selected' : ''}>
          ${freqLabel}
          ${badgeHtml ? `<span slot="trailing" style="display:inline-flex;gap:4px;">${badgeHtml}</span>` : ''}
        </m3e-list-option>
      `;
    })
    .join('');

  const onChange = () => {
    const val = sheetOptions.value;
    const raw = Array.isArray(val) ? val[0] : val;
    if (raw) {
      sheet.hide();
      opts.onSelect(parseInt(raw, 10));
    }
  };

  sheetOptions.onchange = onChange;
  sheet.show(0);
}

// Governor / Scheduler Bottom Sheet Helper (M3E)
function openGovernorSheetDialog(opts: {
  title: string;
  subtitle: string;
  availGovs: string[];
  currentGov: string;
  defaultGov?: string;
  onSelect: (gov: string) => void;
}): void {
  const sheet = document.getElementById('gov-sheet') as M3eBottomSheetElement | null;
  const sheetTitle = document.getElementById('gov-sheet-title');
  const sheetSubtitle = document.getElementById('gov-sheet-subtitle');
  const sheetOptions = document.getElementById('gov-sheet-options') as M3eSelectionListElement | null;

  if (!sheet || !sheetOptions) return;

  try {
    history.pushState({ modal: true }, '');
  } catch (_) {}

  if (sheetTitle) sheetTitle.innerText = opts.title;
  if (sheetSubtitle) sheetSubtitle.innerText = opts.subtitle;

  sheetOptions.innerHTML = opts.availGovs
    .map((gov) => {
      const isSelected = gov === opts.currentGov;
      let badgeHtml = '';
      if (opts.defaultGov && gov === opts.defaultGov) {
        badgeHtml = '<m3e-badge size="large" class="m3e-tag-boot">Default</m3e-badge>';
      } else if (gov === 'schedutil') {
        badgeHtml = '<m3e-badge size="large" class="m3e-tag-modified">Recommended</m3e-badge>';
      }

      return `
        <m3e-list-option value="${gov}" ${isSelected ? 'selected' : ''}>
          ${gov}
          ${badgeHtml ? `<span slot="trailing">${badgeHtml}</span>` : ''}
        </m3e-list-option>
      `;
    })
    .join('');

  const onChange = () => {
    const val = sheetOptions.value;
    const raw = Array.isArray(val) ? val[0] : val;
    if (raw) {
      sheet.hide();
      opts.onSelect(raw);
    }
  };

  sheetOptions.onchange = onChange;
  sheet.show(0);
}

export function initTuningScreen(): void {
  // Feature items in Tuning Hub
  const tuneItems = document.querySelectorAll<HTMLElement>('[data-tune-feature]');
  tuneItems.forEach((item) => {
    item.addEventListener('click', () => {
      const feature = item.getAttribute('data-tune-feature');
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

  // I/O Toggle Switch
  const ioEnableToggle = document.getElementById('io-enable-toggle') as M3eSwitchElement | null;
  ioEnableToggle?.addEventListener('change', async () => {
    if (ioEnableToggle.checked) {
      await renderIoView(true);
    } else {
      if (currentIoData) currentIoData.enabled = false;
      const grid = document.getElementById('io-tuning-grid');
      if (grid) {
        grid.innerHTML =
          '<div class="grid-placeholder">I/O Management is disabled. Turn ON the toggle above to inspect and customize block device schedulers.</div>';
      }
    }
  });

  // Network Toggle Switch
  const netEnableToggle = document.getElementById('net-enable-toggle') as M3eSwitchElement | null;
  netEnableToggle?.addEventListener('change', async () => {
    if (netEnableToggle.checked) {
      await renderNetView(true);
    } else {
      if (currentNetData) currentNetData.enabled = false;
      const grid = document.getElementById('net-tuning-grid');
      if (grid) {
        grid.innerHTML =
          '<div class="grid-placeholder">Network Tuning is disabled. Turn ON the toggle above to inspect and customize TCP congestion controls.</div>';
      }
    }
  });

  // Apply Action FAB
  const applyBtn = document.getElementById('apply-tuning-btn');
  applyBtn?.addEventListener('click', async () => {
    const currentSub = store.get('currentTuningSubView');

    if (currentSub === 'gpu-clocks') {
      const checkbox = document.getElementById('gpu-acknowledge-checkbox') as M3eCheckboxElement | null;
      if (!checkbox || !checkbox.checked) {
        toast("Please check 'I know what I am doing' before applying GPU custom clocks");
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
      const ioEnable = document.getElementById('io-enable-toggle') as M3eSwitchElement | null;
      const isEnabled = ioEnable?.checked ?? false;

      const configMap: Record<string, string> = {};
      document.querySelectorAll<HTMLElement>('#io-tuning-grid .io-card').forEach((card) => {
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

      toast('Applying I/O scheduler configuration...');
      const ok = await applyIoConfig(configMap, choice, isEnabled);
      if (ok) {
        toast(
          choice
            ? 'I/O configuration applied and saved to boot!'
            : 'I/O configuration applied for current session!'
        );
        renderIoView();
      } else {
        toast('Failed to apply I/O configuration');
      }
    } else if (currentSub === 'net-management') {
      const netEnable = document.getElementById('net-enable-toggle') as M3eSwitchElement | null;
      const isEnabled = netEnable?.checked ?? false;

      const netList = document.getElementById('net-algo-radio-list') as M3eSelectionListElement | null;
      const val = netList?.value;
      const selectedAlgo =
        (Array.isArray(val) ? val[0] : val) ||
        currentNetData?.customAlgo ||
        currentNetData?.currentAlgo ||
        'cubic';

      const choice = await askApplyBoot({
        title: 'Apply at Boot?',
        message: `Do you want to re-apply TCP congestion control (${selectedAlgo}) on system boot, or only apply it for the current session?`
      });
      if (choice === null) return;

      toast('Applying TCP congestion control...');
      const ok = await applyNetConfig(selectedAlgo, choice, isEnabled);
      if (ok) {
        toast(
          choice
            ? `TCP ${selectedAlgo} applied and saved to boot!`
            : `TCP ${selectedAlgo} applied for current session!`
        );
        renderNetView();
      } else {
        toast('Failed to apply network configuration');
      }
    }
  });

  // Reset Sweetclock Action FAB
  const resetBtn = document.getElementById('reset-sweetclock-btn');
  resetBtn?.addEventListener('click', async () => {
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

  setupPropsListeners();
}
