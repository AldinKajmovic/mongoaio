/* =============================================
   Main Process — Saved Connections Store
   ============================================= */

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

function getConfigPath() {
  return path.join(app.getPath('userData'), 'connections.json');
}

function encAvailable() {
  try { return safeStorage.isEncryptionAvailable(); } catch (_) { return false; }
}

let warnedPlaintext = false;

function encodeUrl(url) {
  if (encAvailable()) {
    try { return { enc: safeStorage.encryptString(url).toString('base64') }; }
    catch (_) { /* fall through to plaintext */ }
  }
  if (!warnedPlaintext) {
    warnedPlaintext = true;
    log('warn', 'connections', 'OS keychain encryption unavailable — saved connection strings are stored in plaintext', {
      hint: 'On Linux install/unlock a secret service (gnome-keyring, KWallet)'
    });
  }
  return url;
}

/** Whether connection strings are encrypted at rest. */
function getStorageInfo() {
  const raw = readRaw();
  const plaintextEntries = Object.values(raw).filter(e => typeof e === 'string').length;
  return { encrypted: encAvailable(), plaintextEntries };
}

function decodeUrl(entry) {
  if (entry && typeof entry === 'object' && typeof entry.enc === 'string') {
    try { return safeStorage.decryptString(Buffer.from(entry.enc, 'base64')); }
    catch (_) { return null; }
  }
  return typeof entry === 'string' ? entry : null;
}

// Read the raw on-disk map (values may be encrypted or plaintext).
function readRaw() {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (_) { /* unreadable or corrupt — start empty */ }
  return {};
}

function writeRaw(raw) {
  // Owner-only: the file holds connection strings (plaintext when no keychain).
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), { mode: 0o600 });
  try { fs.chmodSync(configPath, 0o600); } catch (_) { /* e.g. Windows ACLs — best effort */ }
}

function getConnections() {
  const raw = readRaw();
  const out = {};
  let needsMigration = false;
  for (const [alias, entry] of Object.entries(raw)) {
    const url = decodeUrl(entry);
    if (url === null) {
      log('warn', 'connections', `Could not decrypt saved connection "${alias}"`, {
        hint: 'connections.json may have been created on another machine or user account'
      });
      out[alias] = '';
    } else {
      out[alias] = url;
    }
    if (encAvailable() && typeof entry === 'string') needsMigration = true;
  }
  if (needsMigration) {
    const migrated = {};
    for (const [alias, entry] of Object.entries(raw)) {
      migrated[alias] = (typeof entry === 'string') ? encodeUrl(entry) : entry;
    }
    try { writeRaw(migrated); } catch (_) { /* non-fatal */ }
  }
  return out;
}

// An alias is a JSON key: these would reach the prototype instead of the map.
const RESERVED_ALIASES = new Set(['__proto__', 'constructor', 'prototype']);

function assertAlias(alias) {
  if (RESERVED_ALIASES.has(alias)) throw new Error(`"${alias}" can't be used as a connection name.`);
}

function saveConnection(alias, url) {
  assertAlias(alias);
  const raw = readRaw();
  raw[alias] = encodeUrl(url);
  writeRaw(raw);
  return getConnections();
}

/** Rename and/or change the URL of a saved connection, keeping its list position. */
function updateConnection(oldAlias, newAlias, url) {
  assertAlias(newAlias);
  const raw = readRaw();
  if (!Object.hasOwn(raw, oldAlias)) throw new Error(`Saved connection "${oldAlias}" no longer exists.`);
  if (newAlias !== oldAlias && Object.hasOwn(raw, newAlias)) {
    throw new Error(`A connection named "${newAlias}" already exists.`);
  }
  const next = {};
  for (const [alias, entry] of Object.entries(raw)) {
    if (alias === oldAlias) next[newAlias] = encodeUrl(url);
    else next[alias] = entry;
  }
  writeRaw(next);
  return getConnections();
}

function deleteConnection(alias) {
  const raw = readRaw();
  delete raw[alias];
  writeRaw(raw);
  return getConnections();
}

module.exports = { getConnections, saveConnection, updateConnection, deleteConnection, getConfigPath, getStorageInfo };
