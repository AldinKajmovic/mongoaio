const { autoUpdater } = require('electron-updater');
const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

/** @type {() => (import('electron').BrowserWindow|null)} */
let getWindow = () => null;

/**
 * Send update events to the renderer via IPC.
 */
function sendToRenderer(channel, data) {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

/** Why this install can't self-update, or null. electron-updater only updates AppImage and builder-tagged deb/rpm installs on Linux. */
function unsupportedReason() {
  if (!app.isPackaged) return 'not a packaged build';
  if (process.platform !== 'linux' || process.env.APPIMAGE) return null;
  const packageType = path.join(process.resourcesPath, 'package-type');
  return fs.existsSync(packageType) ? null : 'Linux install is neither an AppImage nor a tagged deb/rpm';
}

/** Initialize the auto-updater. */
function initUpdater(windowGetter) {
  getWindow = windowGetter;

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

  const reason = unsupportedReason();
  if (reason) {
    log('info', 'updater', `Auto-update disabled: ${reason}`);
    return;
  }

  // Check for updates shortly after launch (give the app time to fully load)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('Auto-update check failed:', err.message);
    });
  }, 5000);
}

module.exports = { initUpdater };
