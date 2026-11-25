import type { M3eLinearProgressIndicatorElement } from '@m3e/web/progress-indicator';
import type { TelemetrySnapshot, CoreStats } from '../../telemetry/types';
import { formatFreq, formatFreqShort } from '../formatters';

export function renderDashboard(data: TelemetrySnapshot): void {
  // 1. Service Status Chip
  const statusDot = document.getElementById('service-status-dot');
  const statusText = document.getElementById('service-status-text');
  if (statusDot && statusText) {
    if (data.serviceRunning) {
      statusDot.className = 'status-dot success';
      statusText.innerText = 'Active';
    } else {
      statusDot.className = 'status-dot error';
      statusText.innerText = 'Stopped';
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
      if (data.gpu.temp >= 70) {
        gpuTemp.style.setProperty('--m3e-outlined-chip-outline-color', 'var(--md-sys-color-error)');
        gpuTemp.style.setProperty('--m3e-chip-label-text-color', 'var(--md-sys-color-error)');
      } else if (data.gpu.temp >= 55) {
        gpuTemp.style.setProperty('--m3e-outlined-chip-outline-color', 'var(--md-sys-color-warning)');
        gpuTemp.style.setProperty('--m3e-chip-label-text-color', 'var(--md-sys-color-warning)');
      } else {
        gpuTemp.style.setProperty('--m3e-outlined-chip-outline-color', 'var(--md-sys-color-success)');
        gpuTemp.style.setProperty('--m3e-chip-label-text-color', 'var(--md-sys-color-success)');
      }
    }

    const gpuUsage = document.getElementById('gpu-usage-value');
    if (gpuUsage) gpuUsage.innerText = `${data.gpu.usage}%`;

    const gpuProgress = document.getElementById('gpu-progress-bar') as M3eLinearProgressIndicatorElement | null;
    if (gpuProgress) {
      gpuProgress.value = Math.max(0, Math.min(100, data.gpu.usage));
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

    const tempBadge = card.querySelector<HTMLElement>('.temp-pill');
    if (tempBadge) {
      tempBadge.innerText = c.temp > 0 ? `${c.temp}°C` : '—';
      let tempClass = 'temp-cold';
      if (c.temp >= 45 && c.temp < 60) tempClass = 'temp-warm';
      else if (c.temp >= 60) tempClass = 'temp-hot';
      tempBadge.className = `temp-pill ${tempClass}`;
    }

    const nameEl = card.querySelector<HTMLElement>('.core-name');
    if (nameEl) nameEl.innerHTML = `CPU ${c.id} <span class="cluster-tag">${c.cluster}</span>`;

    const subEl = card.querySelector<HTMLElement>('.core-sub-compact');
    if (subEl) subEl.innerText = c.governor;

    const progress = card.querySelector<M3eLinearProgressIndicatorElement>('m3e-linear-progress-indicator');
    if (progress) progress.value = Math.max(0, Math.min(100, c.usage));

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

function createCoreCardElement(core: CoreStats): HTMLElement {
  const card = document.createElement('m3e-card');
  card.setAttribute('variant', 'elevated');
  card.className = 'core-card';
  card.setAttribute('data-core-id', String(core.id));

  let tempClass = 'temp-cold';
  if (core.temp >= 45 && core.temp < 60) tempClass = 'temp-warm';
  else if (core.temp >= 60) tempClass = 'temp-hot';

  const usage = Math.max(0, Math.min(100, core.usage));

  card.innerHTML = `
    <div slot="content" class="core-card-inner">
      <div class="core-header-compact">
        <div class="core-title-col">
          <span class="core-name">CPU ${core.id} <span class="cluster-tag">${core.cluster}</span></span>
          <span class="core-sub-compact">${core.governor}</span>
        </div>
        <div class="core-metrics-col">
          <span class="temp-pill ${tempClass}">${core.temp > 0 ? core.temp + '°C' : '—'}</span>
          <span class="core-usage-lbl">${usage}%</span>
        </div>
      </div>

      <m3e-linear-progress-indicator
        mode="determinate"
        max="100"
        value="${usage}"
        variant="flat"
      ></m3e-linear-progress-indicator>

      <div class="freq-compact-list">
        <span class="min-freq-val">${formatFreqShort(core.minFreq)}</span>
        <span class="cur-freq-val">${formatFreq(core.curFreq)}</span>
        <span class="max-freq-val">${formatFreqShort(core.maxFreq)}</span>
      </div>
    </div>
  `;

  return card;
}
