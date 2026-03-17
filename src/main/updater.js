const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

let mainWindow = null;

/**
 * Send update events to the renderer via IPC.
 */
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Initialize the auto-updater.
 * @param {BrowserWindow} win — the main application window
 */
function initUpdater(win) {
  mainWindow = win;

  // Don't auto-download — let the user decide
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update-download-progress', {
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on('update-downloaded', () => {
    sendToRenderer('update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    sendToRenderer('update-error', { message: err.message });
  });

  // IPC handlers for renderer to trigger actions
  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('get-version', () => {
    const { app } = require('electron');
    return app.getVersion();
  });

  // Check for updates shortly after launch (give the app time to fully load)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);
}

module.exports = { initUpdater };
