const { dialog } = require('electron');
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { BSON } = require('mongodb');
const { getClient } = require('../db/connection');
const { serializeDocEJSON } = require('../db/serialize');
const { reviveExtendedJson } = require('../db/query');
const { SOCKET_TIMEOUT_MS } = require('../db/constants');

const EXT = { json: 'json', jsonl: 'jsonl', csv: 'csv' };
const INSERT_BATCH = 1000;

function filtersFor(format) {
  if (format === 'csv') return [{ name: 'CSV', extensions: ['csv'] }];
  if (format === 'jsonl') return [{ name: 'JSON Lines', extensions: ['jsonl', 'ndjson'] }];
  return [{ name: 'JSON', extensions: ['json'] }];
}

// --- CSV helpers -----------------------------------------------------------

function csvCell(value) {
  let s;
  if (value === null || value === undefined) s = '';
  else if (typeof value === 'object') s = JSON.stringify(serializeDocEJSON(value));
  else s = String(value);
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Flatten a document to dot-path scalar cells for CSV export. */
function flatten(doc, prefix, out) {
  for (const [key, value] of Object.entries(doc)) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)
      && !(value instanceof Date) && !value._bsontype && !Buffer.isBuffer(value)) {
      flatten(value, p, out);
    } else {
      out[p] = value;
    }
  }
  return out;
}

/** Minimal RFC-4180-ish CSV parser (handles quotes, escaped quotes, CRLF). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (ch === '\r') {
      // swallow — handled with the following \n
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Coerce a CSV string cell into a number/boolean/JSON where it clearly is one. */
function coerceCell(raw) {
  if (raw === '') return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    try { return BSON.EJSON.parse(raw, { relaxed: true }); } catch (_) { /* keep string */ }
  }
  return raw;
}

// --- Export ----------------------------------------------------------------

/**
 * Export documents to a file chosen via a save dialog.
 * @param {object} params { side, dbName, collName, format, scope, filter, sort, projection, limit }
 * @returns {Promise<{canceled?: boolean, filePath?, count?}>}
 */
async function exportData(win, _db, params) {
  const {
    side = 'source', dbName, collName,
    format = 'json', scope = 'query',
    filter = {}, sort = {}, projection = {}, limit,
  } = params;
  if (!dbName || !collName) throw new Error('dbName and collName are required');

  const ext = EXT[format] || 'json';
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export documents',
    defaultPath: `${collName}.${ext}`,
    filters: filtersFor(format),
  });
  if (canceled || !filePath) return { canceled: true };

  const coll = getClient(side).db(dbName).collection(collName);
  const query = scope === 'all' ? {} : reviveExtendedJson(filter || {});
  const makeCursor = () => {
    let c = coll.find(query, { projection: projection || {} }).sort(sort || {}).maxTimeMS(SOCKET_TIMEOUT_MS);
    if (typeof limit === 'number' && limit > 0) c = c.limit(limit);
    return c;
  };

  const ws = fs.createWriteStream(filePath, 'utf8');
  const write = (s) => new Promise((res, rej) => ws.write(s, (e) => (e ? rej(e) : res())));
  let count = 0;

  try {
    if (format === 'csv') {
      // Single pass: buffer flattened rows while collecting the header union,
      // then write header + rows. A two-pass approach would re-query the
      // cursor, and with a limit + no deterministic sort the second pass can
      // return a DIFFERENT set of docs — silently dropping columns. Buffering
      // is O(rows) in memory, acceptable for a desktop export.
      const headerSet = new Set();
      const rows = [];
      for await (const doc of makeCursor()) {
        const flat = flatten(doc, '', {});
        rows.push(flat);
        Object.keys(flat).forEach((k) => headerSet.add(k));
      }
      const headers = Array.from(headerSet);
      await write(headers.map(csvCell).join(',') + '\n');
      for (const flat of rows) {
        await write(headers.map((h) => csvCell(flat[h])).join(',') + '\n');
        count++;
      }
    } else if (format === 'jsonl') {
      for await (const doc of makeCursor()) {
        await write(JSON.stringify(serializeDocEJSON(doc)) + '\n');
        count++;
      }
    } else {
      await write('[\n');
      let first = true;
      for await (const doc of makeCursor()) {
        await write((first ? '' : ',\n') + '  ' + JSON.stringify(serializeDocEJSON(doc)));
        first = false;
        count++;
      }
      await write('\n]\n');
    }
  } finally {
    await new Promise((res) => ws.end(res));
  }

  return { filePath, count, format };
}

// --- Import ----------------------------------------------------------------

// Parse a whole-file JSON array or CSV into documents. JSON Lines is handled
// separately by importJsonl() so large files stream instead of loading whole.
function docsFromFile(filePath, format) {
  const text = fs.readFileSync(filePath, 'utf8');

  if (format === 'csv') {
    const rows = parseCsv(text);
    if (rows.length < 1) return [];
    const headers = rows[0];
    return rows.slice(1).map((cells) => {
      const doc = {};
      headers.forEach((h, i) => {
        const v = coerceCell(cells[i] ?? '');
        if (v !== undefined) doc[h] = v;
      });
      return doc;
    });
  }

  const parsed = BSON.EJSON.parse(text, { relaxed: true });
  return Array.isArray(parsed) ? parsed : [parsed];
}

// Insert one batch, tolerating per-document failures under { ordered: false }.
// A duplicate _id or schema-validation failure rejects insertMany even though
// the other docs in the batch were written — so we read the partial count and
// error list off the BulkWriteError instead of losing everything. Genuine
// failures (connection lost, auth) still propagate.
async function flushBatch(coll, batch) {
  if (batch.length === 0) return { inserted: 0, skipped: 0 };
  try {
    const res = await coll.insertMany(batch, { ordered: false });
    return { inserted: res.insertedCount || 0, skipped: 0 };
  } catch (err) {
    const inserted = typeof err.insertedCount === 'number'
      ? err.insertedCount
      : (err.result && typeof err.result.insertedCount === 'number' ? err.result.insertedCount : 0);
    const writeErrors = err.writeErrors || (err.result && err.result.writeErrors) || [];
    const nErr = Array.isArray(writeErrors) ? writeErrors.length : 0;
    const isPerDocFailure = err.name === 'MongoBulkWriteError' || nErr > 0
      || /E11000|duplicate key|validation/i.test(err.message || '');
    if (!isPerDocFailure) throw err;
    return { inserted, skipped: nErr > 0 ? nErr : Math.max(0, batch.length - inserted) };
  }
}

// Stream a JSON Lines / NDJSON file, inserting in batches so memory stays
// bounded regardless of file size. Malformed lines are counted as skipped.
async function importJsonl(coll, filePath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, 'utf8'),
    crlfDelay: Infinity,
  });
  let batch = [];
  let insertedCount = 0;
  let skipped = 0;
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    let doc;
    try { doc = BSON.EJSON.parse(t, { relaxed: true }); }
    catch (_) { skipped += 1; continue; }
    batch.push(doc);
    if (batch.length >= INSERT_BATCH) {
      const r = await flushBatch(coll, batch);
      insertedCount += r.inserted; skipped += r.skipped; batch = [];
    }
  }
  const r = await flushBatch(coll, batch);
  insertedCount += r.inserted; skipped += r.skipped;
  return { insertedCount, skipped };
}

/**
 * Import documents from a file chosen via an open dialog into a collection.
 * @param {object} params { side, dbName, collName, format? }
 * @returns {Promise<{canceled?: boolean, insertedCount?, skipped?, filePath?}>}
 */
async function importData(win, _db, params) {
  const { side = 'source', dbName, collName, format } = params;
  if (!dbName || !collName) throw new Error('dbName and collName are required');

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import documents',
    properties: ['openFile'],
    filters: [
      { name: 'Data files', extensions: ['json', 'jsonl', 'ndjson', 'csv'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (canceled || !filePaths || !filePaths.length) return { canceled: true };

  const filePath = filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  const fmt = format || (ext === '.csv' ? 'csv' : (ext === '.jsonl' || ext === '.ndjson') ? 'jsonl' : 'json');
  const coll = getClient(side).db(dbName).collection(collName);

  // JSON Lines streams; JSON arrays / CSV are read whole (an array can't be
  // parsed incrementally without a streaming JSON parser).
  if (fmt === 'jsonl') {
    const { insertedCount, skipped } = await importJsonl(coll, filePath);
    return { insertedCount, skipped, filePath };
  }

  const docs = docsFromFile(filePath, fmt);
  if (!docs.length) return { insertedCount: 0, skipped: 0, filePath };

  let insertedCount = 0;
  let skipped = 0;
  for (let i = 0; i < docs.length; i += INSERT_BATCH) {
    const r = await flushBatch(coll, docs.slice(i, i + INSERT_BATCH));
    insertedCount += r.inserted; skipped += r.skipped;
  }
  return { insertedCount, skipped, filePath };
}

module.exports = { exportData, importData };
