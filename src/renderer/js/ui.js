// UI Helper Utilities and DOM Component Managers
const UI = {
  toastTimer: null,
  uptimeInterval: null,
  uptimeSeconds: 0,
  autoScroll: true,
  logs: [],

  // Display toast notification
  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');

    if (!toast || !toastMsg) return;

    if (this.toastTimer) clearTimeout(this.toastTimer);

    toastMsg.textContent = message;
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    
    if (type === 'error') {
      toastIcon.textContent = '⚠️';
    } else if (type === 'success') {
      toastIcon.textContent = '✓';
    } else {
      toastIcon.textContent = '⚡';
    }

    toast.classList.remove('hidden');

    this.toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 3200);
  },

  // Update Server Status in UI
  setServerState(running, details = {}) {
    const statusBadge = document.getElementById('statusBadge');
    const statusText = document.getElementById('statusText');
    const toggleBtn = document.getElementById('toggleServerBtn');
    const toggleBtnText = document.getElementById('toggleBtnText');
    const serverActiveBanner = document.getElementById('serverActiveBanner');
    const serverStatsBadge = document.getElementById('serverStatsBadge');
    const openFolderBtn = document.getElementById('openFolderBtn');

    if (running) {
      statusBadge.className = 'status-badge running';
      statusText.textContent = `ONLINE :${details.port || 8080}`;

      toggleBtn.className = 'btn-power stop';
      toggleBtnText.textContent = 'STOP SERVER';

      serverActiveBanner.classList.remove('hidden');
      serverStatsBadge.classList.remove('hidden');

      this.startUptime();
    } else {
      statusBadge.className = 'status-badge stopped';
      statusText.textContent = 'OFFLINE';

      toggleBtn.className = 'btn-power start';
      toggleBtnText.textContent = 'START SERVER';

      serverActiveBanner.classList.add('hidden');
      serverStatsBadge.classList.add('hidden');

      this.stopUptime();
    }
  },

  // Render URLs in the Active Server Banner
  renderUrls(details) {
    const primaryUrlLink = document.getElementById('primaryUrlLink');
    const bannerRootDesc = document.getElementById('bannerRootDesc');
    const netContainer = document.getElementById('networkUrlsContainer');

    if (!details || !details.urls) return;

    const localUrl = details.urls.localhost;
    primaryUrlLink.href = localUrl;
    primaryUrlLink.textContent = localUrl;

    if (details.rootPath) {
      bannerRootDesc.textContent = `Serving: ${details.rootPath}`;
    }

    // Render LAN network URLs if any
    netContainer.innerHTML = '';
    const netUrls = details.urls.network || [];

    if (netUrls.length > 0 && !details.localhostOnly) {
      netContainer.classList.remove('hidden');
      netUrls.forEach(item => {
        const row = document.createElement('div');
        row.className = 'url-row';
        row.innerHTML = `
          <span class="url-badge net">LAN (${item.name})</span>
          <a href="${item.url}" class="url-link" target="_blank">${item.url}</a>
          <button class="btn-tiny-copy" data-copy="${item.url}">Copy</button>
        `;
        netContainer.appendChild(row);
      });

      // Bind copy buttons for network urls
      netContainer.querySelectorAll('.btn-tiny-copy').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const toCopy = btn.getAttribute('data-copy');
          window.blsAPI.copyToClipboard(toCopy);
          btn.textContent = '✓ Copied';
          setTimeout(() => btn.textContent = 'Copy', 1500);
          UI.showToast(`Copied LAN URL: ${toCopy}`, 'success');
        });
      });
    } else {
      netContainer.classList.add('hidden');
    }
  },

  // Add Log Entry to the Live Terminal
  addLog(log) {
    this.logs.push(log);
    const terminalBody = document.getElementById('terminalLogBody');
    const logCountBadge = document.getElementById('logCountBadge');
    const statRequests = document.getElementById('statRequests');

    // Remove welcome message on first real log
    const welcome = terminalBody.querySelector('.terminal-welcome');
    if (welcome) {
      terminalBody.innerHTML = '';
    }

    // Status category class
    let statusClass = 's-2xx';
    if (log.status >= 500) statusClass = 's-5xx';
    else if (log.status >= 400) statusClass = 's-4xx';
    else if (log.status >= 300) statusClass = 's-3xx';

    const row = document.createElement('div');
    row.className = 'log-row';
    row.setAttribute('data-search', `${log.method} ${log.url} ${log.status} ${log.clientIp}`.toLowerCase());

    row.innerHTML = `
      <span class="log-time">[${log.timestamp}]</span>
      <span class="log-method ${log.method}">${log.method}</span>
      <span class="log-status ${statusClass}">${log.status}</span>
      <span class="log-path">${this.escapeHtml(log.url)}</span>
      <div class="log-details">
        <span>${log.durationMs}ms</span>
        <span>${log.sizeFormatted}</span>
        <span>${log.clientIp}</span>
      </div>
    `;

    terminalBody.appendChild(row);

    // Filter check
    const filterInput = document.getElementById('logFilterInput');
    if (filterInput && filterInput.value.trim()) {
      const q = filterInput.value.trim().toLowerCase();
      if (!row.getAttribute('data-search').includes(q)) {
        row.style.display = 'none';
      }
    }

    // Update log counters
    const totalCount = this.logs.length;
    if (logCountBadge) logCountBadge.textContent = `${totalCount} log${totalCount === 1 ? '' : 's'}`;
    if (statRequests) statRequests.textContent = `${totalCount} reqs`;

    // Limit DOM rows to prevent lag
    if (terminalBody.children.length > 500) {
      terminalBody.removeChild(terminalBody.firstChild);
    }

    if (this.autoScroll) {
      terminalBody.scrollTop = terminalBody.scrollHeight;
    }
  },

  filterLogs(query) {
    const q = query.toLowerCase().trim();
    const rows = document.querySelectorAll('.log-row');
    rows.forEach(row => {
      const searchData = row.getAttribute('data-search') || '';
      if (!q || searchData.includes(q)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  },

  clearLogs() {
    this.logs = [];
    const terminalBody = document.getElementById('terminalLogBody');
    const logCountBadge = document.getElementById('logCountBadge');
    const statRequests = document.getElementById('statRequests');

    terminalBody.innerHTML = `
      <div class="terminal-welcome">
        <p class="welcome-text">[Logs cleared. Listening for incoming traffic...]</p>
      </div>
    `;
    if (logCountBadge) logCountBadge.textContent = '0 logs';
    if (statRequests) statRequests.textContent = '0 reqs';
  },

  // Render recent folder chips
  renderRecentFolders(folders, onSelect) {
    const wrap = document.getElementById('recentFoldersWrap');
    const container = document.getElementById('recentChips');

    if (!folders || folders.length === 0) {
      wrap.classList.add('hidden');
      return;
    }

    wrap.classList.remove('hidden');
    container.innerHTML = '';

    folders.slice(0, 5).forEach(folderPath => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'recent-chip';
      const parts = folderPath.split(/[/\\]/);
      const label = parts[parts.length - 1] || folderPath;
      chip.textContent = label;
      chip.title = folderPath;
      chip.addEventListener('click', () => onSelect(folderPath));
      container.appendChild(chip);
    });
  },

  // Uptime timer
  startUptime() {
    this.uptimeSeconds = 0;
    const uptimeEl = document.getElementById('statUptime');
    if (uptimeEl) uptimeEl.textContent = '00:00';

    if (this.uptimeInterval) clearInterval(this.uptimeInterval);

    this.uptimeInterval = setInterval(() => {
      this.uptimeSeconds++;
      const mins = String(Math.floor(this.uptimeSeconds / 60)).padStart(2, '0');
      const secs = String(this.uptimeSeconds % 60).padStart(2, '0');
      if (uptimeEl) uptimeEl.textContent = `${mins}:${secs}`;
    }, 1000);
  },

  stopUptime() {
    if (this.uptimeInterval) {
      clearInterval(this.uptimeInterval);
      this.uptimeInterval = null;
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
};
