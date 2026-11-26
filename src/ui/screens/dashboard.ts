import type { M3eLinearProgressIndicatorElement } from '@m3e/web/progress-indicator';
import type { TelemetrySnapshot, CoreStats } from '../../telemetry/types';
import { formatFreq, formatFreqShort } from '../formatters';

const smoothProgressSheet = new CSSStyleSheet();
smoothProgressSheet.replaceSync(`
  :host(:is(:state(--determinate), :--determinate)) .primary {
    transition: width 480ms cubic-bezier(0.2, 0, 0, 1);
    will-change: width;
  }
  @media (prefers-reduced-motion: reduce) {
    :host(:is(:state(--determinate), :--determinate)) .primary {
      transition: none;
    }
  }
`);

function enableSmoothProgress(el: M3eLinearProgressIndicatorElement | null): void {
  if (!el) return;
  const attach = () => {
    const sr = el.shadowRoot;
    if (sr && !sr.adoptedStyleSheets.includes(smoothProgressSheet)) {
      sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, smoothProgressSheet];
    }
  };
  if (el.shadowRoot) {
    attach();
  } else {
    customElements.whenDefined('m3e-linear-progress-indicator').then(attach);
  }
}

function getTempBadgeColors(temp: number): { bg: string; fg: string; text: string } {
  if (temp >= 60) {
    return {
      bg: 'var(--md-sys-color-error-container)',
      fg: 'var(--md-sys-color-on-error-container)',
      text: 'var(--md-sys-color-error)'
    };
  }
  if (temp >= 45) {
    return {
      bg: 'var(--md-sys-color-warning-container)',
      fg: 'var(--md-sys-color-on-warning-container)',
      text: 'var(--md-sys-color-warning)'
    };
  }
  return {
    bg: 'var(--md-sys-color-success-container)',
    fg: 'var(--md-sys-color-on-success-container)',
    text: 'var(--md-sys-color-success)'
  };
}

export function renderDashboard(data: TelemetrySnapshot): void {
  // 1. Service Status Badge
  const statusBadge = document.getElementById('service-status');
  if (statusBadge) {
    if (data.serviceRunning) {
      statusBadge.style.setProperty('--m3e-badge-container-color', 'var(--md-sys-color-success-container)');
      statusBadge.style.setProperty('--m3e-badge-color', 'var(--md-sys-color-on-success-container)');
      statusBadge.innerText = 'Active';
    } else {
      statusBadge.style.setProperty('--m3e-badge-container-color', 'var(--md-sys-color-error-container)');
      statusBadge.style.setProperty('--m3e-badge-color', 'var(--md-sys-color-on-error-container)');
      statusBadge.innerText = 'Inactive';
    }
  }

  // 2. Render / Update Cores Grid
  renderCoresGrid(data.cores);

  // 3. Update GPU Card
  if (data.gpu) {
    const gpuName = document.getElementById('gpu-card-name');
    if (gpuName && data.gpu.model) {
      gpuName.innerText = data.gpu.model;
    }

    const gpuTemp = document.getElementById('gpu-temp-badge');
    if (gpuTemp) {
      gpuTemp.innerText = data.gpu.temp > 0 ? `${data.gpu.temp}°C` : 'N/A';
      const { bg, fg } = getTempBadgeColors(data.gpu.temp);
      gpuTemp.style.setProperty('--m3e-badge-container-color', bg);
      gpuTemp.style.setProperty('--m3e-badge-color', fg);
    }

    const gpuUsage = document.getElementById('gpu-usage-value');
    if (gpuUsage) gpuUsage.innerText = `${data.gpu.usage}%`;

    const gpuProgress = document.getElementById(
      'gpu-progress-bar'
    ) as M3eLinearProgressIndicatorElement | null;
    if (gpuProgress) {
      enableSmoothProgress(gpuProgress);
      // Keep value >= 0.5 so m3e-linear-progress-indicator does not remove .primary at 0% and skip CSS width transitions
      gpuProgress.value = Math.max(0.5, Math.min(100, data.gpu.usage));
    }

    const gpuGov = document.getElementById('gpu-card-gov');
    if (gpuGov && data.gpu.governor) gpuGov.innerText = data.gpu.governor;

    const gpuFreqMin = document.getElementById('gpu-freq-min');
    if (gpuFreqMin) {
      gpuFreqMin.innerText = data.gpu.minFreq > 0 ? `${data.gpu.minFreq} MHz` : '—';
    }

    const gpuFreqNow = document.getElementById('gpu-freq-now');
    if (gpuFreqNow) {
      gpuFreqNow.innerText = data.gpu.curFreq > 0 ? `${data.gpu.curFreq} MHz` : 'Idle';
    }

    const gpuFreqMax = document.getElementById('gpu-freq-max');
    if (gpuFreqMax) {
      gpuFreqMax.innerText = data.gpu.maxFreq > 0 ? `${data.gpu.maxFreq} MHz` : '—';
    }
  }
}

function renderCoresGrid(cores: CoreStats[]): void {
  const grid = document.getElementById('cores-grid');
  if (!grid) return;

  const existingCards = grid.querySelectorAll<HTMLElement>('.core-card');
  if (existingCards.length !== cores.length) {
    grid.innerHTML = '';
    for (const c of cores) {
      grid.appendChild(createCoreCardElement(c));
    }
    return;
  }

  cores.forEach((c, idx) => {
    const card = existingCards[idx];
    if (!card) return;

    const tempLbl = card.querySelector<HTMLElement>('.core-temp-lbl');
    if (tempLbl) {
      tempLbl.innerText = c.temp > 0 ? `${c.temp}°C` : '—';
      const { text } = getTempBadgeColors(c.temp);
      tempLbl.style.color = text;
    }

    const nameEl = card.querySelector<HTMLElement>('.core-name');
    if (nameEl) {
      nameEl.innerHTML = `CPU ${c.id} <m3e-badge size="small" class="cluster-badge">${c.cluster}</m3e-badge>`;
    }

    const subEl = card.querySelector<HTMLElement>('.core-sub-compact');
    if (subEl) subEl.innerText = c.governor;

    const progress = card.querySelector<M3eLinearProgressIndicatorElement>(
      'm3e-linear-progress-indicator'
    );
    if (progress) {
      enableSmoothProgress(progress);
      progress.value = Math.max(0.5, Math.min(100, c.usage));
    }

    const minFreqVal = card.querySelector<HTMLElement>('.min-freq-val');
    if (minFreqVal) minFreqVal.innerText = formatFreqShort(c.minFreq);

    const curFreqVal = card.querySelector<HTMLElement>('.cur-freq-val');
    if (curFreqVal) curFreqVal.innerText = formatFreq(c.curFreq);

    const maxFreqVal = card.querySelector<HTMLElement>('.max-freq-val');
    if (maxFreqVal) maxFreqVal.innerText = formatFreqShort(c.maxFreq);
  });
}

function createCoreCardElement(core: CoreStats): HTMLElement {
  const card = document.createElement('m3e-card');
  card.setAttribute('variant', 'elevated');
  card.className = 'core-card';
  card.setAttribute('data-core-id', String(core.id));

  const { text } = getTempBadgeColors(core.temp);
  const usage = Math.max(0, Math.min(100, core.usage));
  const barUsage = Math.max(0.5, usage);

  card.innerHTML = `
    <div slot="content" class="core-card-inner">
      <div class="core-header-compact">
        <div class="core-title-col">
          <span class="core-name">CPU ${core.id} <m3e-badge size="small" class="cluster-badge">${core.cluster}</m3e-badge></span>
          <span class="core-sub-compact">${core.governor}</span>
        </div>
        <span class="core-temp-lbl" style="color: ${text};">${core.temp > 0 ? core.temp + '°C' : '—'}</span>
      </div>

      <m3e-linear-progress-indicator
        mode="determinate"
        max="100"
        value="${barUsage}"
        variant="flat"
      ></m3e-linear-progress-indicator>

      <div class="freq-compact-list">
        <span class="min-freq-val">${formatFreqShort(core.minFreq)}</span>
        <span class="cur-freq-val">${formatFreq(core.curFreq)}</span>
        <span class="max-freq-val">${formatFreqShort(core.maxFreq)}</span>
      </div>
    </div>
  `;

  const progress = card.querySelector<M3eLinearProgressIndicatorElement>(
    'm3e-linear-progress-indicator'
  );
  enableSmoothProgress(progress);

  return card;
}
