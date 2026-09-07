const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blsAPI', {
  // Dialogs
  selectDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

  // Server operations
  startServer: (config) => ipcRenderer.invoke('server:start', config),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  getServerStatus: () => ipcRenderer.invoke('server:getStatus'),

  // System shell
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openFolder: (path) => ipcRenderer.invoke('shell:openFolder', path),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),

  // Network & System Info
  getNetworkIps: () => ipcRenderer.invoke('app:getNetworkIps'),
  getDefaultDir: () => ipcRenderer.invoke('app:getDefaultDir'),
  getSamplePath: () => ipcRenderer.invoke('app:getSamplePath'),

  // Settings & History
  loadSettings: () => ipcRenderer.invoke('app:loadSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('app:saveSettings', settings),
  getRecentFolders: () => ipcRenderer.invoke('app:getRecentFolders'),
  addRecentFolder: (folder) => ipcRenderer.invoke('app:addRecentFolder', folder),
  clearRecentFolders: () => ipcRenderer.invoke('app:clearRecentFolders'),

  // Events
  onServerLog: (callback) => {
    const subscription = (_event, log) => callback(log);
    ipcRenderer.on('server:log', subscription);
    return () => ipcRenderer.removeListener('server:log', subscription);
  },
  onServerStopped: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('server:stopped', subscription);
    return () => ipcRenderer.removeListener('server:stopped', subscription);
  },

  // Window Controls (if custom titlebar is used)
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close')
});
