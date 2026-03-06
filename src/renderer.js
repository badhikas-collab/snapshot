import './index.css';

// ── IPC Bridge (uses preload.js contextBridge) ──────────────────────────────
const ipc = window.ipc;

let currentSnapshot = null;
let allSnapshots = [];

// ── DOM Refs ─────────────────────────────────────────────────────────────────
let newSnapshotBtn, snapshotNameInput, snapshotList, emptyState, snapshotDetail;
let detailTitle, detailTimestamp, deleteBtn, processSearch, processList;
let compareSelect, compareBtn, comparisonView, integrityInfo, uploadBtn;
let headerMeta, snapshotCount;

// ── Toast Notification System ─────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<div class="toast-dot"></div><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.25s ease forwards';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// ── Modal Confirm (replaces window.confirm) ───────────────────────────────────
function showConfirm(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="modalCancel">Cancel</button>
          <button class="btn btn-danger" id="modalConfirm">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#modalConfirm').addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
    overlay.querySelector('#modalCancel').addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); resolve(false); }
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
  newSnapshotBtn   = document.getElementById('newSnapshotBtn');
  snapshotNameInput = document.getElementById('snapshotName');
  snapshotList     = document.getElementById('snapshotList');
  emptyState       = document.getElementById('emptyState');
  snapshotDetail   = document.getElementById('snapshotDetail');
  detailTitle      = document.getElementById('detailTitle');
  detailTimestamp  = document.getElementById('detailTimestamp');
  deleteBtn        = document.getElementById('deleteBtn');
  processSearch    = document.getElementById('processSearch');
  processList      = document.getElementById('processList');
  compareSelect    = document.getElementById('compareSelect');
  compareBtn       = document.getElementById('compareBtn');
  comparisonView   = document.getElementById('comparisonView');
  integrityInfo    = document.getElementById('integrityInfo');
  uploadBtn        = document.getElementById('uploadBtn');
  headerMeta       = document.getElementById('headerMeta');
  snapshotCount    = document.getElementById('snapshotCount');

  if (!newSnapshotBtn) {
    console.error('ERROR: Could not find newSnapshotBtn');
    return;
  }

  // ── Event Listeners ────────────────────────────────────────────────────────
  newSnapshotBtn.addEventListener('click', () => {
    const name = snapshotNameInput.value.trim() || `snapshot_${Date.now()}`;
    takeNewSnapshot(name);
    snapshotNameInput.value = '';
  });

  snapshotNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') newSnapshotBtn.click();
  });

  deleteBtn?.addEventListener('click', () => {
    if (currentSnapshot) deleteSnapshot(currentSnapshot);
  });

  processSearch?.addEventListener('input', (e) => {
    filterProcesses(e.target.value.toLowerCase());
  });

  compareBtn?.addEventListener('click', () => {
    const selected = compareSelect.value;
    if (selected) {
      performComparison(currentSnapshot, selected);
    } else {
      showToast('Select a snapshot to compare with', 'info');
    }
  });

  document.getElementById('closeComparisonBtn')?.addEventListener('click', () => {
    comparisonView.style.display = 'none';
  });

  uploadBtn?.addEventListener('click', async () => {
    if (!currentSnapshot) return;
    uploadBtn.disabled = true;
    uploadBtn.textContent = '↑ Uploading...';
    try {
      const result = await ipc.invoke('upload-snapshot', currentSnapshot);
      if (result.success) {
        showToast('Snapshot uploaded successfully', 'success');
        uploadBtn.textContent = '✓ Uploaded';
        setTimeout(() => { uploadBtn.textContent = '↑ Upload'; uploadBtn.disabled = false; }, 2000);
      } else {
        showToast(`Upload failed: ${result.error}`, 'error');
        uploadBtn.textContent = '↑ Upload';
        uploadBtn.disabled = false;
      }
    } catch (e) {
      showToast(`Upload error: ${e.message}`, 'error');
      uploadBtn.textContent = '↑ Upload';
      uploadBtn.disabled = false;
    }
  });

  setHeaderMeta('READY');
  loadSnapshotList();
}

// ── Header status indicator ───────────────────────────────────────────────────
function setHeaderMeta(text) {
  if (headerMeta) headerMeta.textContent = text;
}

// ── Snapshot List ─────────────────────────────────────────────────────────────
async function loadSnapshotList() {
  try {
    allSnapshots = await ipc.invoke('list-snapshots');
    renderSnapshotList();
    if (allSnapshots.length === 0) {
      snapshotList.innerHTML = '<p class="loading">No snapshots yet</p>';
    }
    if (snapshotCount) snapshotCount.textContent = allSnapshots.length;
  } catch (e) {
    console.error('Error loading snapshots:', e);
    showToast('Failed to load snapshots', 'error');
  }
}

function renderSnapshotList() {
  snapshotList.innerHTML = '';
  allSnapshots.forEach((name) => {
    const item = document.createElement('div');
    item.className = `snapshot-item ${name === currentSnapshot ? 'active' : ''}`;
    item.textContent = name;
    item.addEventListener('click', () => loadSnapshot(name));
    snapshotList.appendChild(item);
  });

  if (compareSelect) {
    compareSelect.innerHTML = '<option value="">Compare with...</option>';
    allSnapshots.forEach((name) => {
      if (name !== currentSnapshot) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        compareSelect.appendChild(option);
      }
    });
    compareSelect.value = '';
  }

  if (snapshotCount) snapshotCount.textContent = allSnapshots.length;
}

// ── Load & Display Snapshot ───────────────────────────────────────────────────
async function loadSnapshot(name) {
  try {
    setHeaderMeta('LOADING...');
    const data = await ipc.invoke('load-snapshot', name);
    if (data) {
      currentSnapshot = name;
      displaySnapshot(data);
      renderSnapshotList();
      compareSelect.value = '';
      comparisonView.style.display = 'none';
      setHeaderMeta(`VIEWING: ${name}`);
    }
  } catch (e) {
    console.error('Error loading snapshot:', e);
    showToast('Failed to load snapshot', 'error');
    setHeaderMeta('ERROR');
  }
}

function displaySnapshot(data) {
  emptyState.style.display = 'none';
  snapshotDetail.style.display = 'flex';

  detailTitle.textContent = currentSnapshot;
  detailTimestamp.textContent = new Date(data.metadata.timestamp).toLocaleString();

  if (data.integrity) {
    integrityInfo.style.display = 'inline-flex';
    integrityInfo.innerHTML = `✓ SHA256: ${data.integrity.sha256_checksum.substring(0, 16)}...`;
  } else {
    integrityInfo.style.display = 'none';
  }

  // System info
  document.getElementById('cpuManufacturer').textContent = data.system.cpu_manufacturer || '—';
  document.getElementById('cpuBrand').textContent        = data.system.cpu_brand || '—';
  document.getElementById('cpuCores').textContent        = data.system.cpu_cores || '—';
  document.getElementById('totalMemory').textContent     = `${data.system.total_memory_gb} GB  (${data.system.used_memory_gb} GB used)`;
  document.getElementById('osInfo').textContent          = `${data.system.os_distro || '—'} ${data.system.os_release || ''}`;
  document.getElementById('diskInfo').textContent        = `${data.system.total_disk_size_gb} GB`;

  // Network Interfaces
  const networkInterfacesEl = document.getElementById('networkInterfaces');
  networkInterfacesEl.innerHTML = '';
  if (data.network?.interfaces) {
    data.network.interfaces.slice(0, 5).forEach(iface => {
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.innerHTML = `<strong>${iface.iface}</strong>  ${iface.ip4 || 'N/A'}  <span style="color:var(--text-muted)">${iface.type || ''}</span>`;
      networkInterfacesEl.appendChild(item);
    });
  }

  // Listening Ports
  const listeningPortsEl = document.getElementById('listeningPorts');
  listeningPortsEl.innerHTML = '';
  if (data.network?.listening_ports) {
    data.network.listening_ports.slice(0, 10).forEach(port => {
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.innerHTML = `<strong>${port.process_name || 'unknown'}</strong>  ${port.protocol.toUpperCase()}:${port.local_port}`;
      listeningPortsEl.appendChild(item);
    });
  }

  // File System
  const filesystemInfoEl = document.getElementById('filesystemInfo');
  filesystemInfoEl.innerHTML = '';
  if (data.system?.filesystem_info) {
    data.system.filesystem_info.slice(0, 5).forEach(fs => {
      const pct = parseFloat(fs.use_percent);
      const color = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--orange)' : 'var(--green)';
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.innerHTML = `<strong>${fs.mount}</strong>  ${fs.used_gb} GB / ${fs.size_gb} GB  <span style="color:${color};font-weight:600">${fs.use_percent}%</span>`;
      filesystemInfoEl.appendChild(item);
    });
  }

  renderProcesses(data.running_processes);
}

// ── Process List ──────────────────────────────────────────────────────────────
function renderProcesses(processes) {
  processList.innerHTML = '';
  processes.forEach((proc) => {
    const cpu = proc.cpu_usage || 0;
    const mem = proc.mem_usage || 0;
    const cpuClass = cpu > 10 ? 'high' : cpu > 3 ? 'med' : '';
    const memClass = mem > 10 ? 'high' : mem > 3 ? 'med' : '';

    const item = document.createElement('div');
    item.className = 'process-item';
    item.innerHTML = `
      <span class="process-name">${proc.name}</span>
      <span class="process-pid">${proc.pid}</span>
      <div class="process-stats">
        <div class="stat">
          <span class="stat-label">CPU</span>
          <span class="stat-value ${cpuClass}">${cpu.toFixed(1)}%</span>
        </div>
        <div class="stat">
          <span class="stat-label">MEM</span>
          <span class="stat-value ${memClass}">${mem.toFixed(1)}%</span>
        </div>
      </div>
    `;
    processList.appendChild(item);
  });
}

function filterProcesses(query) {
  processList.querySelectorAll('.process-item').forEach((item) => {
    const name = item.querySelector('.process-name').textContent.toLowerCase();
    item.style.display = name.includes(query) ? 'flex' : 'none';
  });
}

// ── Take Snapshot ─────────────────────────────────────────────────────────────
async function takeNewSnapshot(name) {
  if (!ipc) {
    showToast('IPC bridge not available', 'error');
    return;
  }

  newSnapshotBtn.disabled = true;
  newSnapshotBtn.textContent = '⏳ Capturing...';
  setHeaderMeta('CAPTURING...');

  try {
    const data = await ipc.invoke('take-snapshot', name);
    if (data) {
      showToast(`Snapshot "${name}" saved`, 'success');
      await loadSnapshotList();
      await loadSnapshot(name);
    }
  } catch (e) {
    console.error('Error taking snapshot:', e);
    showToast(`Snapshot failed: ${e.message}`, 'error');
    setHeaderMeta('ERROR');
  } finally {
    newSnapshotBtn.disabled = false;
    newSnapshotBtn.textContent = '+ Take Snapshot';
  }
}

// ── Delete Snapshot ───────────────────────────────────────────────────────────
async function deleteSnapshot(name) {
  const confirmed = await showConfirm(
    'Delete Snapshot',
    `Permanently delete "${name}"? This cannot be undone.`
  );
  if (!confirmed) return;

  try {
    const success = await ipc.invoke('delete-snapshot', name);
    if (success) {
      showToast(`"${name}" deleted`, 'info');
      currentSnapshot = null;
      await loadSnapshotList();
      emptyState.style.display = 'flex';
      snapshotDetail.style.display = 'none';
      setHeaderMeta('READY');
    } else {
      showToast('Delete failed', 'error');
    }
  } catch (e) {
    console.error('Error deleting snapshot:', e);
    showToast('Delete error', 'error');
  }
}

// ── Compare Snapshots ─────────────────────────────────────────────────────────
async function performComparison(baselineName, afterName) {
  setHeaderMeta('COMPARING...');
  try {
    const comparison = await ipc.invoke('compare-snapshots', baselineName, afterName);
    if (comparison) {
      displayComparison(comparison);
      setHeaderMeta(`DIFF: ${baselineName} ↔ ${afterName}`);
    }
  } catch (e) {
    console.error('Error comparing snapshots:', e);
    showToast('Comparison failed', 'error');
    setHeaderMeta(`VIEWING: ${currentSnapshot}`);
  }
}

function displayComparison(comparison) {
  comparisonView.style.display = 'block';

  const renderList = (id, items, renderFn, emptyMsg) => {
    const el = document.getElementById(id);
    el.innerHTML = '';
    if (items.length > 0) {
      items.forEach(item => el.appendChild(renderFn(item)));
    } else {
      el.innerHTML = `<p class="comparison-empty">${emptyMsg}</p>`;
    }
  };

  renderList('newProcessesList', comparison.new_processes, (proc) => {
    const el = document.createElement('div');
    el.className = 'comparison-item warning';
    el.innerHTML = `<strong>${proc.name}</strong>  PID ${proc.pid}<br>CPU ${proc.cpu_usage.toFixed(1)}%  MEM ${proc.mem_usage.toFixed(1)}%`;
    return el;
  }, 'None');

  renderList('removedProcessesList', comparison.removed_processes, (proc) => {
    const el = document.createElement('div');
    el.className = 'comparison-item danger';
    el.innerHTML = `<strong>${proc.name}</strong>  PID ${proc.pid}`;
    return el;
  }, 'None');

  const significantChanges = comparison.process_changes
    .sort((a, b) => Math.abs(b.cpu_change) - Math.abs(a.cpu_change))
    .slice(0, 10);

  renderList('processChangesList', significantChanges, (change) => {
    const el = document.createElement('div');
    el.className = `comparison-item ${Math.abs(change.cpu_change) > 2 ? 'warning' : ''}`;
    const cpuSign = change.cpu_change > 0 ? '+' : '';
    const memSign = change.mem_change > 0 ? '+' : '';
    el.innerHTML = `<strong>${change.name}</strong><br>CPU ${change.cpu_before.toFixed(1)}→${change.cpu_after.toFixed(1)}% (${cpuSign}${change.cpu_change.toFixed(1)}%)  MEM ${memSign}${change.mem_change.toFixed(1)}%`;
    return el;
  }, 'No significant changes');

  const ports = comparison.new_listening_ports.slice(0, 10);
  renderList('newPortsList', ports, (port) => {
    const el = document.createElement('div');
    el.className = 'comparison-item warning';
    el.innerHTML = `<strong>${port.process_name || 'unknown'}</strong>  PID ${port.pid}<br>${port.protocol.toUpperCase()} ${port.local_address}:${port.local_port}`;
    return el;
  }, 'None');
}