/* =============================================
   Main Process — File + Console Logger
   ============================================= */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/** Rotate once the active log passes this size. */
const MAX_LOG_BYTES = 5 * 1024 * 1024;
/** Longest single stack trace written per entry. */
const MAX_STACK_CHARS = 8000;

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

let logFilePath = null;
let stream = null;
const minLevel = LEVELS[String(process.env.MONGOAIO_LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

/**
 * SECURITY: connection strings carry credentials and must never reach a log
 * file or the terminal. Everything written goes through this first.
 * @param {string} text
 * @returns {string}
 */
function redact(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/mongodb(\+srv)?:\/\/[^\s,)}\]'"]+/gi, 'mongodb://***');
}

/** Serialize the structured tail of an entry, never throwing on odd input. */
function formatMeta(meta) {
  if (meta === undefined || meta === null) return '';
  try {
    const json = typeof meta === 'string' ? meta : JSON.stringify(meta);
    return json === undefined ? '' : ` ${redact(json)}`;
  } catch (err) {
    return ` [unserializable meta: ${err.message}]`;
  }
}

/** Move the current log aside when it gets big, keeping one previous file. */
function rotateIfNeeded(file) {
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_LOG_BYTES) {
      fs.renameSync(file, `${file}.1`);
    }
  } catch (_) { /* rotation is best effort — never block startup */ }
}

/**
 * Open the log file under the user data directory. Safe to call once, after
 * the app is ready. Logging still works (console only) if this fails.
 * @returns {string|null} the log file path
 */
function initLogger() {
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    logFilePath = path.join(dir, 'mongoaio.log');
    rotateIfNeeded(logFilePath);
    stream = fs.createWriteStream(logFilePath, { flags: 'a' });
    stream.on('error', (err) => {
      stream = null;
      console.error(`[logger] file logging disabled: ${err.message}`);
    });
  } catch (err) {
    stream = null;
    console.error(`[logger] could not open log file: ${err.message}`);
  }
  return logFilePath;
}

/** @returns {string|null} */
function getLogFilePath() {
  return logFilePath;
}

/**
 * Write one entry to the terminal and the log file.
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} scope - where it came from, e.g. `ipc:connect`
 * @param {string} message
 * @param {*} [meta] - extra structured detail
 */
function log(level, scope, message, meta) {
  const rank = LEVELS[level] ?? LEVELS.info;
  if (rank < minLevel) return;

  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] `
    + `${redact(String(message))}${formatMeta(meta)}`;

  if (rank >= LEVELS.error) console.error(line);
  else if (rank >= LEVELS.warn) console.warn(line);
  else console.log(line);

  if (stream) {
    try { stream.write(`${line}\n`); } catch (_) { /* best effort */ }
  }
}

/**
 * Log an error with its full stack — the detail that makes a packaged-app
 * crash report actually usable.
 * @param {string} scope
 * @param {*} err - an Error, or anything that was thrown/rejected
 * @param {*} [meta]
 */
function logError(scope, err, meta) {
  const error = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  const stack = redact(String(error.stack || `${error.name}: ${error.message}`)).slice(0, MAX_STACK_CHARS);
  log('error', scope, `${error.name}: ${error.message}`, meta);

  const stackLine = stack.split('\n').slice(1).join('\n');
  if (stackLine) {
    console.error(stackLine);
    if (stream) {
      try { stream.write(`${stackLine}\n`); } catch (_) { /* best effort */ }
    }
  }
  return stack;
}

/** Record the environment a report was produced in. */
function logStartupBanner() {
  log('info', 'app', 'MongoAIO starting', {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    packaged: app.isPackaged,
    logFile: logFilePath,
    logLevel: Object.keys(LEVELS).find(k => LEVELS[k] === minLevel)
  });
}

module.exports = { initLogger, log, logError, logStartupBanner, getLogFilePath, redact };
