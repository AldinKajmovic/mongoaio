/* =============================================
   Main Process — Crash & Error Diagnostics
   ============================================= */

const { app, dialog } = require('electron');
const { log, logError, getLogFilePath, redact } = require('./logger');

/** Console levels Electron reports, old (numeric) and new (string) shapes. */
const CONSOLE_LEVELS = ['debug', 'info', 'warn', 'error'];

/** Only one fatal dialog — a crash loop shouldn't bury the screen in boxes. */
let fatalDialogShown = false;

/** Anything can be thrown or rejected; normalize it so we always get a stack. */
function toError(value) {
  if (value instanceof Error) return value;
  try {
    return new Error(typeof value === 'string' ? value : JSON.stringify(value));
  } catch (_) {
    return new Error(String(value));
  }
}

/**
 * Show what happened. In a packaged app there is no terminal to read, so a
 * fatal error has to say the problem, the stack and where the log lives.
 */
function showFatalDialog(title, err, extra) {
  if (fatalDialogShown) return;
  fatalDialogShown = true;

  const parts = [
    redact(String(err.stack || `${err.name}: ${err.message}`)),
    extra ? `\nDetails: ${redact(JSON.stringify(extra))}` : '',
    `\nLog file: ${getLogFilePath() || '(file logging unavailable)'}`
  ];

  try {
    dialog.showErrorBox(title, parts.join('\n'));
  } catch (dialogErr) {
    console.error(`[diagnostics] could not show the error dialog: ${dialogErr.message}`);
  }
}

/** Crashes in the main process itself — previously silent in a packaged build. */
function initProcessDiagnostics() {
  process.on('uncaughtException', (err, origin) => {
    logError('uncaught-exception', err, { origin });
    showFatalDialog('MongoAIO — uncaught exception', toError(err), { origin });
  });

  process.on('unhandledRejection', (reason) => {
    const err = toError(reason);
    logError('unhandled-rejection', err);
    showFatalDialog('MongoAIO — unhandled promise rejection', err);
  });

  process.on('warning', (warning) => {
    log('warn', 'process', `${warning.name}: ${warning.message}`);
  });
}

/**
 * Forward the renderer's console to the terminal and the log file, so a UI
 * error is visible without opening DevTools.
 */
function forwardConsole(...args) {
  // Electron ≤35 passes (event, level, message, line, sourceId); newer versions
  // pass (event, details). Accept both so an upgrade doesn't silence this.
  const [, second, third, fourth, fifth] = args;
  const details = (second && typeof second === 'object')
    ? second
    : { level: second, message: third, lineNumber: fourth, sourceId: fifth };

  const level = typeof details.level === 'number'
    ? (CONSOLE_LEVELS[details.level] || 'info')
    : (CONSOLE_LEVELS.includes(details.level) ? details.level : 'info');

  const where = details.sourceId ? `${details.sourceId}:${details.lineNumber ?? 0}` : 'renderer';
  log(level, 'renderer', String(details.message ?? ''), { at: where });
}

/** Everything a window's web contents can tell us about going wrong. */
function attachWebContents(contents) {
  contents.on('console-message', (...args) => forwardConsole(...args));

  contents.on('preload-error', (_event, preloadPath, error) => {
    logError('preload', error, { preloadPath });
    showFatalDialog('MongoAIO — preload script failed', toError(error), { preloadPath });
  });

  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    log('error', 'renderer', `Page failed to load: ${errorDescription}`, {
      errorCode, url: validatedURL, isMainFrame
    });
  });

  contents.on('unresponsive', () => log('warn', 'renderer', 'Window became unresponsive'));
  contents.on('responsive', () => log('info', 'renderer', 'Window is responsive again'));
}

/** App-level lifecycle and process-death reporting. */
function initAppDiagnostics() {
  app.on('web-contents-created', (_event, contents) => attachWebContents(contents));

  app.on('render-process-gone', (_event, _contents, details) => {
    log('error', 'render-process', `Renderer gone: ${details.reason}`, details);
    showFatalDialog(
      'MongoAIO — the window crashed',
      new Error(`Renderer process gone: ${details.reason} (exit code ${details.exitCode})`),
      details
    );
  });

  app.on('child-process-gone', (_event, details) => {
    log('error', 'child-process', `${details.type} process gone: ${details.reason}`, details);
  });

  app.on('quit', (_event, exitCode) => log('info', 'app', 'Quit', { exitCode }));
}

module.exports = { initProcessDiagnostics, initAppDiagnostics, attachWebContents };
