import type { TelemetrySnapshot, CoreStats } from '../../telemetry/types';
import { formatFreq, formatFreqShort } from '../formatters';

export function renderDashboard(data: TelemetrySnapshot): void {
  // 1. Bypass & CPU Usage in Hero Card
  const bypassStatus = document.getElementById('bypass-status');
  if (bypassStatus) {
    bypassStatus.innerText = data.bypassActive ? 'Yes (Active)' : 'No';
  }

  const totalCpuUsage = document.getElementById('total-cpu-usage');
  if (totalCpuUsage) {
    totalCpuUsage.innerText = `${data.totalLoad}%`;
  }

  const bypassOff = document.getElementById('bypass-off-btn');
  const bypassOn = document.getElementById('bypass-on-btn');
  if (bypassOff && bypassOn) {
    if (data.bypassActive) {
      bypassOn.classList.add('active');
      bypassOff.classList.remove('active');
    } else {
      bypassOff.classList.add('active');
      bypassOn.classList.remove('active');
    }
  }

  // 2. Service Status Badge
  const svcBadge = document.getElementById('service-status');
  if (svcBadge) {
    const indicator = svcBadge.querySelector('.status-indicator');
    const label = svcBadge.querySelector('.status-text') as HTMLElement | null;
    if (indicator && label) {
      if (data.serviceRunning) {
        indicator.className = 'status-indicator success';
        label.innerText = 'Active';
      } else {
        indicator.className = 'status-indicator error';
        label.innerText = 'Stopped';
      }
    }
  }

  // 3. Render / Update Cores Grid
  renderCoresGrid(data.cores);

  // 4. Update GPU Card
  if (data.gpu) {
    const gpuName = document.getElementById('gpu-card-name');
    if (gpuName && data.gpu.model) {
      gpuName.innerText = data.gpu.model;
    }

    const gpuTemp = document.getElementById('gpu-temp-badge');
    if (gpuTemp) {
      gpuTemp.innerText = data.gpu.temp > 0 ? `${data.gpu.temp}°C` : 'N/A';
      if (data.gpu.temp >= 70) {
        gpuTemp.style.backgroundColor = 'var(--md-sys-color-error-container)';
        gpuTemp.style.color = 'var(--md-sys-color-on-error-container)';
      } else if (data.gpu.temp >= 55) {
        gpuTemp.style.backgroundColor = 'var(--md-sys-color-warning-container)';
        gpuTemp.style.color = 'var(--md-sys-color-on-warning-container)';
      } else {
        gpuTemp.style.backgroundColor = 'var(--md-sys-color-success-container)';
        gpuTemp.style.color = 'var(--md-sys-color-on-success-container)';
      }
    }

    const gpuUsage = document.getElementById('gpu-usage-value');
    if (gpuUsage) gpuUsage.innerText = `${data.gpu.usage}%`;

    const gpuProgress = document.getElementById('gpu-progress-bar');
    if (gpuProgress) gpuProgress.style.transform = `scaleX(${Math.max(0, Math.min(100, data.gpu.usage)) / 100})`;

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

  const existingCards = grid.querySelectorAll<HTMLDivElement>('.core-card');
  if (existingCards.length !== cores.length) {
    grid.innerHTML = '';
    for (const c of cores) {
      const card = createCoreCardElement(c);
      grid.appendChild(card);
    }
    return;
  }

  cores.forEach((c, idx) => {
    const card = existingCards[idx];
    if (!card) return;

    const tempBadge = card.querySelector<HTMLElement>('.temp-badge');
    if (tempBadge) {
      tempBadge.innerText = c.temp > 0 ? `${c.temp}°C` : '—';
      let tempClass = 'temp-cold';
      if (c.temp >= 45 && c.temp < 60) tempClass = 'temp-warm';
      else if (c.temp >= 60) tempClass = 'temp-hot';
      tempBadge.className = `temp-badge ${tempClass}`;
    }

    const nameEl = card.querySelector<HTMLElement>('.core-name');
    if (nameEl) nameEl.innerHTML = `CPU ${c.id} <span class="cluster-name">${c.cluster}</span>`;

    const subEl = card.querySelector<HTMLElement>('.core-sub-compact');
    if (subEl) subEl.innerText = c.governor;

    const fill = card.querySelector<HTMLElement>('.progress-bar-fill');
    if (fill) fill.style.transform = `scaleX(${Math.max(0, Math.min(100, c.usage)) / 100})`;

    const usageLbl = card.querySelector<HTMLElement>('.core-usage-lbl');
    if (usageLbl) usageLbl.innerText = `${c.usage}%`;

    const minFreqVal = card.querySelector<HTMLElement>('.min-freq-val');
    if (minFreqVal) minFreqVal.innerText = formatFreqShort(c.minFreq);

    const curFreqVal = card.querySelector<HTMLElement>('.cur-freq-val');
    if (curFreqVal) curFreqVal.innerText = formatFreq(c.curFreq);

    const maxFreqVal = card.querySelector<HTMLElement>('.max-freq-val');
    if (maxFreqVal) maxFreqVal.innerText = formatFreqShort(c.maxFreq);
  });
}

function createCoreCardElement(core: CoreStats): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'card card-elevated core-card';
  card.setAttribute('data-core-id', String(core.id));

  let tempClass = 'temp-cold';
  if (core.temp >= 45 && core.temp < 60) tempClass = 'temp-warm';
  else if (core.temp >= 60) tempClass = 'temp-hot';

  card.innerHTML = `
    <div class="core-header-compact">
      <div style="display: flex; flex-direction: column; min-width: 0;">
        <span class="core-name">CPU ${core.id} <span class="cluster-name">${core.cluster}</span></span>
        <span class="core-sub-compact">${core.governor}</span>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0;">
        <span class="temp-badge ${tempClass}">${core.temp > 0 ? core.temp + '°C' : '—'}</span>
        <span class="core-usage-lbl">${core.usage}%</span>
      </div>
    </div>
    
    <div class="progress-bar-track" style="margin-top: 2px;">
      <div class="progress-bar-fill" style="transform: scaleX(${Math.max(0, Math.min(100, core.usage)) / 100});"></div>
    </div>
    
    <div class="freq-compact-list" style="display: flex; justify-content: space-between;">
      <span class="min-freq-val">${formatFreqShort(core.minFreq)}</span>
      <span class="cur-freq-val">${formatFreq(core.curFreq)}</span>
      <span class="max-freq-val">${formatFreqShort(core.maxFreq)}</span>
    </div>
  `;

  return card;
}
