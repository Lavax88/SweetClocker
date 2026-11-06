import { formatFreqShort } from '../formatters';

export function openFrequencySheet(options: {
  title: string;
  subtitle: string;
  frequencies: number[];
  currentFreq: number;
  sweetclockFreq?: number;
  onSelect: (freq: number) => void;
}): void {
  const backdrop = document.getElementById('freq-sheet-backdrop');
  const titleEl = document.getElementById('freq-sheet-title');
  const subtitleEl = document.getElementById('freq-sheet-subtitle');
  const optionsEl = document.getElementById('freq-sheet-options');
  const closeBtn = document.getElementById('freq-sheet-close');

  if (!backdrop || !optionsEl) return;

  if (titleEl) titleEl.innerText = options.title;
  if (subtitleEl) subtitleEl.innerText = options.subtitle;

  optionsEl.innerHTML = '';

  const closeSheet = () => {
    backdrop.classList.remove('active');
    setTimeout(() => {
      backdrop.style.visibility = 'hidden';
    }, 280);
  };

  backdrop.style.visibility = 'visible';
  requestAnimationFrame(() => backdrop.classList.add('active'));

  if (closeBtn) {
    closeBtn.onclick = closeSheet;
  }
  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeSheet();
  };

  for (const freq of options.frequencies) {
    const item = document.createElement('div');
    const isSelected = freq === options.currentFreq;
    const isSweet = options.sweetclockFreq && freq === options.sweetclockFreq;

    item.className = `m3-sheet-item ${isSelected ? 'active' : ''}`;
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-weight: 500;">${formatFreqShort(freq)}</span>
        ${isSweet ? '<span class="sweetspot-badge">Sweet Spot</span>' : ''}
      </div>
      <div class="m3-radio-circle ${isSelected ? 'selected' : ''}"></div>
    `;

    item.onclick = () => {
      options.onSelect(freq);
      closeSheet();
    };

    optionsEl.appendChild(item);
  }
}

export function openGovernorSheet(options: {
  title: string;
  subtitle: string;
  governors: string[];
  currentGov: string;
  onSelect: (gov: string) => void;
}): void {
  const backdrop = document.getElementById('gov-sheet-backdrop');
  const titleEl = document.getElementById('gov-sheet-title');
  const subtitleEl = document.getElementById('gov-sheet-subtitle');
  const optionsEl = document.getElementById('gov-sheet-options');
  const closeBtn = document.getElementById('gov-sheet-close');

  if (!backdrop || !optionsEl) return;

  if (titleEl) titleEl.innerText = options.title;
  if (subtitleEl) subtitleEl.innerText = options.subtitle;

  optionsEl.innerHTML = '';

  const closeSheet = () => {
    backdrop.classList.remove('active');
    setTimeout(() => {
      backdrop.style.visibility = 'hidden';
    }, 280);
  };

  backdrop.style.visibility = 'visible';
  requestAnimationFrame(() => backdrop.classList.add('active'));

  if (closeBtn) {
    closeBtn.onclick = closeSheet;
  }
  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeSheet();
  };

  for (const gov of options.governors) {
    const item = document.createElement('div');
    const isSelected = gov === options.currentGov;

    item.className = `m3-sheet-item ${isSelected ? 'active' : ''}`;
    item.innerHTML = `
      <span style="font-weight: 500;">${gov}</span>
      <div class="m3-radio-circle ${isSelected ? 'selected' : ''}"></div>
    `;

    item.onclick = () => {
      options.onSelect(gov);
      closeSheet();
    };

    optionsEl.appendChild(item);
  }
}
