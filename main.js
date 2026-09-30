const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./ipc-handlers');
const { initUpdater } = require('./src/main/updater');
const { initLogger, log, logError, logStartupBanner, getLogFilePath } = require('./src/main/logger');
const { initProcessDiagnostics, initAppDiagnostics } = require('./src/main/diagnostics');
const db = require('./src/db');

// Before anything else: a crash during startup should still be reported.
initProcessDiagnostics();

let mainWindow = null;
const getWindow = () => mainWindow;

function confirmDiscardOnClose(event) {
  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning',
    buttons: ['Discard changes and close', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Unsaved changes',
    message: 'You have staged edits that were not applied.',
    detail: 'Closing now will discard them.',
  });
  if (choice === 0) event.preventDefault(); // preventDefault here means "allow the unload"
}

/** The UI is a local file: never navigate away from it or open new windows. */
function lockDownNavigation(contents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (url !== contents.getURL()) event.preventDefault();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'MongoAIO',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    backgroundColor: '#0f0f1a',
    autoHideMenuBar: true,
  });

  lockDownNavigation(mainWindow.webContents);
  mainWindow.webContents.on('will-prevent-unload', confirmDiscardOnClose);
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.loadFile('index.html').catch(err => logError('window', err, { file: 'index.html' }));
  log('info', 'window', 'Main window created');
}

app.whenReady().then(() => {
  initLogger();
  initAppDiagnostics();
  logStartupBanner();
  console.log(`Logging to: ${getLogFilePath() || '(console only)'}`);
  // IPC handlers and the updater are process-wide: register them once, not per window.
  registerIpcHandlers(getWindow);
  initUpdater(getWindow);
  createWindow();
}).catch(err => logError('startup', err));

app.on('window-all-closed', () => {
  log('info', 'app', 'All windows closed — quitting');
  app.quit();
});

let closingConnections = false;
app.on('before-quit', (event) => {
  if (closingConnections) return;
  closingConnections = true;
  event.preventDefault();
  db.disconnectBoth()
    .catch(err => logError('app', err, { phase: 'disconnect-on-quit' }))
    .finally(() => app.quit());
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
