// Main Application Controller for BLS
document.addEventListener('DOMContentLoaded', async () => {
  // Application State
  const state = {
    selectedFolder: '',
    isRunning: false,
    serverDetails: null,
    settings: {
      port: 8080,
      localhostOnly: true,
      https: false,
      cors: true,
      directoryListing: true,
      spaFallback: false,
      disableCache: true,
      lastFolder: ''
    }
  };

  // DOM Elements
  const currentFolderPathEl = document.getElementById('currentFolderPath');
  const browseFolderBtn = document.getElementById('browseFolderBtn');
  const openFolderBtn = document.getElementById('openFolderBtn');
  const dropZone = document.getElementById('dropZone');
  const loadSampleBtn = document.getElementById('loadSampleBtn');
  const clearRecentsBtn = document.getElementById('clearRecentsBtn');

  const toggleServerBtn = document.getElementById('toggleServerBtn');
  const openBrowserBtn = document.getElementById('openBrowserBtn');
  const copyUrlBtn = document.getElementById('copyUrlBtn');
  const copyPrimaryUrlBtn = document.getElementById('copyPrimaryUrlBtn');
  const primaryUrlLink = document.getElementById('primaryUrlLink');

  const portInput = document.getElementById('portInput');
  const portChips = document.querySelectorAll('.port-chip');
  const httpsToggle = document.getElementById('httpsToggle');
  const localhostToggle = document.getElementById('localhostToggle');
  const directoryListingToggle = document.getElementById('directoryListingToggle');
  const corsToggle = document.getElementById('corsToggle');
  const spaToggle = document.getElementById('spaToggle');
  const noCacheToggle = document.getElementById('noCacheToggle');

  const logFilterInput = document.getElementById('logFilterInput');
  const toggleAutoscrollBtn = document.getElementById('toggleAutoscrollBtn');
  const clearLogsBtn = document.getElementById('clearLogsBtn');

  // 1. Initialize Settings & State
  async function init() {
    try {
      const config = await window.blsAPI.loadSettings();
      if (config && config.settings) {
        state.settings = { ...state.settings, ...config.settings };
      }

      // Apply settings to form
      portInput.value = state.settings.port || 8080;
      httpsToggle.checked = Boolean(state.settings.https);
      localhostToggle.checked = state.settings.localhostOnly !== false;
      directoryListingToggle.checked = state.settings.directoryListing !== false;
      corsToggle.checked = state.settings.cors !== false;
      spaToggle.checked = Boolean(state.settings.spaFallback);
      noCacheToggle.checked = state.settings.disableCache !== false;

      // Check for last folder or default
      if (state.settings.lastFolder) {
        setSelectedFolder(state.settings.lastFolder);
      } else {
        // Fallback to sample folder or default
        const samplePath = await getSampleFolderPath();
        setSelectedFolder(samplePath);
      }

      // Render recent folders
      const recents = await window.blsAPI.getRecentFolders();
      UI.renderRecentFolders(recents, (folder) => {
        setSelectedFolder(folder);
        UI.showToast(`Selected: ${folder}`, 'info');
      });

      // Check current server status
      const status = await window.blsAPI.getServerStatus();
      if (status && status.running) {
        state.isRunning = true;
        state.serverDetails = status;
        UI.setServerState(true, status);
        UI.renderUrls(status);
      }
    } catch (err) {
      console.error('Initialization error:', err);
    }
  }

  // Helper to get sample folder path
  async function getSampleFolderPath() {
    try {
      return await window.blsAPI.getSamplePath();
    } catch (e) {
      return '';
    }
  }

  // Set selected folder helper
  function setSelectedFolder(folderPath) {
    state.selectedFolder = folderPath || '';
    if (folderPath) {
      currentFolderPathEl.textContent = folderPath;
      currentFolderPathEl.title = folderPath;
      openFolderBtn.removeAttribute('disabled');
    } else {
      currentFolderPathEl.textContent = 'No folder selected (Click Browse or Drag & Drop)';
      currentFolderPathEl.title = 'No folder selected';
      openFolderBtn.setAttribute('disabled', 'true');
    }
    saveCurrentSettings();
  }

  // Collect current options from UI
  function getServerOptions() {
    return {
      rootPath: state.selectedFolder,
      port: parseInt(portInput.value, 10) || 8080,
      localhostOnly: localhostToggle.checked,
      https: httpsToggle.checked,
      cors: corsToggle.checked,
      directoryListing: directoryListingToggle.checked,
      spaFallback: spaToggle.checked,
      disableCache: noCacheToggle.checked
    };
  }

  // Save current UI settings to config
  async function saveCurrentSettings() {
    state.settings = {
      port: parseInt(portInput.value, 10) || 8080,
      localhostOnly: localhostToggle.checked,
      https: httpsToggle.checked,
      cors: corsToggle.checked,
      directoryListing: directoryListingToggle.checked,
      spaFallback: spaToggle.checked,
      disableCache: noCacheToggle.checked,
      lastFolder: state.selectedFolder
    };
    await window.blsAPI.saveSettings(state.settings);
  }

  // 2. Start / Stop Server Logic
  async function startServer() {
    if (!state.selectedFolder) {
      UI.showToast('Please select a folder to serve first!', 'error');
      // Trigger browse dialog
      selectFolderDialog();
      return;
    }

    const options = getServerOptions();

    UI.showToast('Starting BLS server...', 'info');

    try {
      const res = await window.blsAPI.startServer(options);

      if (res.success) {
        state.isRunning = true;
        state.serverDetails = res.status;
        UI.setServerState(true, res.status);
        UI.renderUrls(res.status);
        UI.showToast(`BLS Server live on ${res.status.urls.localhost}`, 'success');

        // Refresh recents
        const recents = await window.blsAPI.getRecentFolders();
        UI.renderRecentFolders(recents, (folder) => setSelectedFolder(folder));
      } else {
        UI.showToast(`Failed to start: ${res.error}`, 'error');
      }
    } catch (err) {
      UI.showToast(`Error: ${err.message}`, 'error');
    }
  }

  async function stopServer() {
    try {
      const res = await window.blsAPI.stopServer();
      state.isRunning = false;
      state.serverDetails = null;
      UI.setServerState(false);
      UI.showToast('Server stopped', 'info');
    } catch (err) {
      UI.showToast(`Error stopping: ${err.message}`, 'error');
    }
  }

  async function toggleServer() {
    if (state.isRunning) {
      await stopServer();
    } else {
      await startServer();
    }
  }

  // 3. Folder Selection Handlers
  async function selectFolderDialog() {
    const selected = await window.blsAPI.selectDirectory();
    if (selected) {
      setSelectedFolder(selected);
      UI.showToast(`Selected: ${selected}`, 'info');

      // Refresh recents
      const recents = await window.blsAPI.getRecentFolders();
      UI.renderRecentFolders(recents, (folder) => setSelectedFolder(folder));

      // If server is running, ask or restart
      if (state.isRunning) {
        UI.showToast('Restarting server for new folder...', 'info');
        await startServer();
      }
    }
  }

  browseFolderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectFolderDialog();
  });

  dropZone.addEventListener('click', () => {
    selectFolderDialog();
  });

  openFolderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.selectedFolder) {
      window.blsAPI.openFolder(state.selectedFolder);
    }
  });

  // Drag and drop support on the dropzone
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file && file.path) {
        setSelectedFolder(file.path);
        UI.showToast(`Folder loaded: ${file.path}`, 'success');
        if (state.isRunning) {
          startServer();
        }
      }
    }
  });

  // Use Demo Folder Button
  loadSampleBtn.addEventListener('click', async () => {
    const sampleDir = await getSampleFolderPath();
    if (sampleDir) {
      setSelectedFolder(sampleDir);
      UI.showToast('Loaded BLS Demo Folder! Click Start Server.', 'success');
      if (state.isRunning) {
        startServer();
      }
    }
  });

  // Clear recents
  clearRecentsBtn.addEventListener('click', async () => {
    await window.blsAPI.clearRecentFolders();
    UI.renderRecentFolders([], null);
    UI.showToast('Recent folders cleared', 'info');
  });

  // 4. Server Controls & URL Actions
  toggleServerBtn.addEventListener('click', toggleServer);

  openBrowserBtn.addEventListener('click', () => {
    if (state.serverDetails && state.serverDetails.urls) {
      window.blsAPI.openExternal(state.serverDetails.urls.localhost);
    }
  });

  primaryUrlLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.serverDetails && state.serverDetails.urls) {
      window.blsAPI.openExternal(state.serverDetails.urls.localhost);
    }
  });

  function copyUrlAction(url) {
    window.blsAPI.copyToClipboard(url);
    const copyIcon = document.getElementById('copyIcon');
    const copyText = document.getElementById('copyText');
    if (copyIcon && copyText) {
      copyIcon.textContent = '✓';
      copyText.textContent = 'Copied!';
      setTimeout(() => {
        copyIcon.textContent = '📋';
        copyText.textContent = 'Copy URL';
      }, 1800);
    }
    UI.showToast(`Copied ${url} to clipboard!`, 'success');
  }

  copyUrlBtn.addEventListener('click', () => {
    if (state.serverDetails && state.serverDetails.urls) {
      copyUrlAction(state.serverDetails.urls.localhost);
    }
  });

  copyPrimaryUrlBtn.addEventListener('click', () => {
    if (state.serverDetails && state.serverDetails.urls) {
      copyUrlAction(state.serverDetails.urls.localhost);
    }
  });

  // 5. Settings Inputs Handlers
  portChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const port = chip.getAttribute('data-port');
      portInput.value = port;
      saveCurrentSettings();
      if (state.isRunning) {
        UI.showToast(`Port changed to ${port}. Restarting...`, 'info');
        startServer();
      }
    });
  });

  portInput.addEventListener('change', () => {
    let port = parseInt(portInput.value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      port = 8080;
      portInput.value = 8080;
    }
    saveCurrentSettings();
    if (state.isRunning) {
      UI.showToast(`Port set to ${port}. Restarting...`, 'info');
      startServer();
    }
  });

  const allToggles = [httpsToggle, localhostToggle, directoryListingToggle, corsToggle, spaToggle, noCacheToggle];
  allToggles.forEach(toggle => {
    toggle.addEventListener('change', () => {
      saveCurrentSettings();
      if (state.isRunning) {
        UI.showToast('Settings updated. Restarting server...', 'info');
        startServer();
      }
    });
  });

  // 6. Terminal Log Controls
  logFilterInput.addEventListener('input', (e) => {
    UI.filterLogs(e.target.value);
  });

  toggleAutoscrollBtn.addEventListener('click', () => {
    UI.autoScroll = !UI.autoScroll;
    if (UI.autoScroll) {
      toggleAutoscrollBtn.classList.add('active');
      toggleAutoscrollBtn.innerHTML = '<span>⬇️ Auto-scroll</span>';
    } else {
      toggleAutoscrollBtn.classList.remove('active');
      toggleAutoscrollBtn.innerHTML = '<span>⏸️ Paused</span>';
    }
  });

  clearLogsBtn.addEventListener('click', () => {
    UI.clearLogs();
  });

  // 7. IPC Log Subscriptions
  window.blsAPI.onServerLog((logEntry) => {
    UI.addLog(logEntry);
  });

  window.blsAPI.onServerStopped(() => {
    if (state.isRunning) {
      state.isRunning = false;
      state.serverDetails = null;
      UI.setServerState(false);
      UI.showToast('Server has stopped', 'info');
    }
  });

  // 8. Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // Avoid triggering when user is actively typing in text / search input
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      if (e.key === 'Enter' && e.ctrlKey) {
        toggleServer();
      }
      return;
    }

    if (e.code === 'Space' || (e.ctrlKey && e.key === 'Enter')) {
      e.preventDefault();
      toggleServer();
    }
  });

  // Initialize
  await init();
});
