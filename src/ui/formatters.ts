export function formatFreq(khz: number): string {
  if (!khz || khz === 0) return '—';
  const mhz = khz / 1000;
  if (mhz >= 1000) {
    return `${(mhz / 1000).toFixed(2)} GHz`;
  }
  return `${Math.round(mhz)} MHz`;
}

export function formatFreqMHz(khz: number): string {
  if (!khz || khz === 0) return '—';
  const mhz = khz / 1000;
  const rounded = Math.round(mhz * 10) / 10;
  return `${rounded} MHz`;
}

export function formatFreqShort(khz: number): string {
  if (!khz || khz === 0) return '—';
  const mhz = khz / 1000;
  if (mhz >= 1000) return `${(mhz / 1000).toFixed(1)}G`;
  return `${Math.round(mhz)}M`;
}

export function formatFreqMinMaxShort(minKhz: number, maxKhz: number): string {
  if (!minKhz || !maxKhz) return '—';
  const fmt = (khz: number) => {
    const mhz = khz / 1000;
    if (mhz >= 1000) return `${(mhz / 1000).toFixed(1)}G`;
    return `${Math.round(mhz)}M`;
  };
  return `${fmt(minKhz)}-${fmt(maxKhz)}`;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}
