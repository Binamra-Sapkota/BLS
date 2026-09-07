const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const serverManager = require('./server');

let mainWindow = null;

// Config file in userData
const configPath = path.join(app.getPath('userData'), 'bls-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
  return {
    recentFolders: [],
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
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving config:', e);
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, '../renderer/assets/icon.png');

  mainWindow = new BrowserWindow({
    width: 960,
    height: 760,
    minWidth: 780,
    minHeight: 640,
    backgroundColor: '#070c0a',
    title: 'BLS // Local Web Server',
    icon: iconPath,
    show: false,
    frame: true, // Clean native window frame with dark styling
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', async () => {
    mainWindow = null;
    await serverManager.stop();
  });
}

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', async () => {
  await serverManager.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// 1. Directory picker dialog
ipcMain.handle('dialog:openDirectory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Folder to Serve',
    properties: ['openDirectory', 'createDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selected = result.filePaths[0];
    const config = loadConfig();
    
    // Add to recent folders
    const recents = (config.recentFolders || []).filter(p => p !== selected);
    recents.unshift(selected);
    config.recentFolders = recents.slice(0, 8); // Keep top 8
    config.settings.lastFolder = selected;
    saveConfig(config);

    return selected;
  }
  return null;
});

// 2. Server operations
ipcMain.handle('server:start', async (event, options) => {
  try {
    const status = await serverManager.start(options, (logEntry) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server:log', logEntry);
      }
    });

    // Save active folder in config
    if (options.rootPath) {
      const config = loadConfig();
      const recents = (config.recentFolders || []).filter(p => p !== options.rootPath);
      recents.unshift(options.rootPath);
      config.recentFolders = recents.slice(0, 8);
      config.settings.lastFolder = options.rootPath;
      saveConfig(config);
    }

    return { success: true, status };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('server:stop', async () => {
  try {
    const res = await serverManager.stop();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server:stopped', res);
    }
    return res;
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('server:getStatus', () => {
  return serverManager.getStatus();
});

// 3. System Shell
ipcMain.handle('shell:openExternal', async (event, url) => {
  if (url) {
    await shell.openExternal(url);
  }
});

ipcMain.handle('shell:openFolder', async (event, folderPath) => {
  if (folderPath && fs.existsSync(folderPath)) {
    await shell.openPath(folderPath);
  }
});

ipcMain.handle('clipboard:write', (event, text) => {
  if (text) {
    clipboard.writeText(text);
    return true;
  }
  return false;
});

// 4. Network Info
ipcMain.handle('app:getNetworkIps', () => {
  return serverManager.getNetworkAddresses();
});

ipcMain.handle('app:getDefaultDir', () => {
  return os.homedir();
});

ipcMain.handle('app:getSamplePath', () => {
  return path.join(__dirname, '../../test-sample');
});

// 5. Settings & Recents
ipcMain.handle('app:loadSettings', () => {
  return loadConfig();
});

ipcMain.handle('app:saveSettings', (event, newSettings) => {
  const config = loadConfig();
  config.settings = { ...config.settings, ...newSettings };
  saveConfig(config);
  return config.settings;
});

ipcMain.handle('app:getRecentFolders', () => {
  const config = loadConfig();
  return config.recentFolders || [];
});

ipcMain.handle('app:addRecentFolder', (event, folder) => {
  const config = loadConfig();
  const recents = (config.recentFolders || []).filter(p => p !== folder);
  recents.unshift(folder);
  config.recentFolders = recents.slice(0, 8);
  saveConfig(config);
  return config.recentFolders;
});

ipcMain.handle('app:clearRecentFolders', () => {
  const config = loadConfig();
  config.recentFolders = [];
  saveConfig(config);
  return [];
});

// 6. Window Controls (optional)
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});
