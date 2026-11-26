import { getLogs, clearLogs, copyLogs } from '../../logs/reader';
import { VirtualLogList } from '../../logs/virtual-list';
import { formatBytes } from '../formatters';
import { showConfirmDialog } from '../components/confirmDialog';

let virtualList: VirtualLogList | null = null;
let currentRawLogs = '';

export function initLogsScreen(): void {
  const container = document.getElementById('log-viewer');
  if (container) {
    virtualList = new VirtualLogList({
      container,
      itemHeight: 20,
      overscan: 10
    });
  }

  const searchBar = document.getElementById('log-search-bar');
  const searchInput = document.getElementById('log-search') as HTMLInputElement | null;
  if (searchInput && virtualList) {
    searchInput.addEventListener('input', () => {
      virtualList?.setSearchTerm(searchInput.value);
    });
  }
  if (searchBar && virtualList) {
    searchBar.addEventListener('clear', () => {
      virtualList?.setSearchTerm('');
    });
  }

  const clearBtn = document.getElementById('clear-log-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const confirmed = await showConfirmDialog({
        title: 'Clear Log File?',
        message: 'Are you sure you want to clear the system log file? This cannot be undone.',
        confirmLabel: 'Clear Logs',
        cancelLabel: 'Cancel',
        isDanger: true
      });
      if (confirmed) {
        await clearLogs();
        await updateLogsView();
      }
    });
  }

  const copyBtn = document.getElementById('copy-log-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      copyLogs(currentRawLogs);
    });
  }
}

export async function updateLogsView(): Promise<void> {
  try {
    const data = await getLogs(300);
    currentRawLogs = data.rawText;

    const sizeEl = document.getElementById('log-size-info');
    if (sizeEl) {
      sizeEl.innerText = `Size: ${formatBytes(data.size)}`;
    }

    if (virtualList) {
      const searchInput = document.getElementById('log-search') as HTMLInputElement | null;
      const isSearching = searchInput && searchInput.value.trim().length > 0;
      virtualList.setEntries(data.entries, !isSearching);
    }
  } catch (err) {
    console.error('Failed to update logs view:', err);
  }
}
