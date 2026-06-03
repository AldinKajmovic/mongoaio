const { getClient } = require('./connection');
const { SHELL_RESULT_LIMIT, SHELL_PAGE_SIZE } = require('./constants');
const { serializeValue } = require('./shell-serialize');
const { FIND_META, buildDbProxy, buildBsonHelpers } = require('./shell-proxies');
const { readBatch, storeCursor, shellCursorNext, closeShellCursor } = require('./shell-cursors');

// ===========================================================================
// SECURITY: this module intentionally evaluates arbitrary user-authored
// JavaScript (a MongoDB shell — same capability as `mongosh`). The operator is
// the local user typing into their own desktop app, so executing their own
// code against their own connections is the feature, not an injection vector.
//
// This is an ACCEPTED, DOCUMENTED exception to the "no eval()/Function()" rule
// in AGENTS.md §6/§7 (owner: maintainer; scope: local single-user shell only).
//
// NOT A SANDBOX: the `SHADOWED` list below is defense-in-depth to keep casual
// typos (`require`, `process`, ...) from resolving, but it does NOT contain a
// determined escape (e.g. via `constructor`). Do not rely on it for isolation,
// and do not expose this evaluator to any remote/untrusted input. If untrusted
// input ever reaches here, replace this with a real isolate (separate process /
// vm with a hardened context), not more shadowing.
// ===========================================================================

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Names of globals shadowed (set undefined) inside the evaluation scope. */
const SHADOWED = ['require', 'module', 'exports', 'process', 'global', 'globalThis', '__dirname', '__filename'];

/** Split source on top-level `;`, ignoring those inside brackets or strings. */
function splitTopLevelSemicolons(code) {
  const parts = [];
  let depth = 0;
  let str = null;
  let start = 0;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (str) {
      if (ch === '\\') { i++; continue; }
      if (ch === str) str = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { str = ch; continue; }
    else if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ';' && depth === 0) { parts.push(code.slice(start, i)); start = i + 1; }
  }
  parts.push(code.slice(start));
  return parts;
}

// Statements whose leading keyword means the segment is not a bare expression.
const STMT_KEYWORD = /^\s*(?:return|throw|break|continue|if|else|for|while|do|switch|try|catch|finally|var|let|const|function|class|with|debugger|import|export|yield)\b|^\s*[{}]/;

/** Turn a multi-statement block into a body whose final bare expression is returned. */
function buildStatementBody(code) {
  const parts = splitTopLevelSemicolons(code);
  let lastIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].trim()) { lastIdx = i; break; }
  }
  if (lastIdx >= 0 && !STMT_KEYWORD.test(parts[lastIdx])) {
    parts[lastIdx] = `\nreturn ( ${parts[lastIdx]}\n )`;
  }
  return parts.join(';');
}

/**
 * Build the function that runs the user code. Tries, in order:
 *   1. expression mode — a single expression (supports a leading `await`);
 *   2. statement mode — multiple statements, returning the final bare
 *      expression's value, with top-level `await` supported throughout;
 *   3. plain mode — let a genuine syntax error surface to the caller.
 */
function compile(code, paramNames) {
  const wrap = (body) => new Function(...paramNames, body);
  try {
    return wrap(`"use strict"; return (async () => ( ${code}\n ))();`);
  } catch (_) { /* fall through */ }
  try {
    return wrap(`"use strict"; return (async () => { ${buildStatementBody(code)}\n })();`);
  } catch (_) { /* fall through */ }
  return wrap(`"use strict"; return (async () => { ${code}\n })();`);
}

/** A find()-style cursor that can be re-positioned with skip()/limit(). */
function isFindCursor(v) {
  return !!v
    && typeof v.toArray === 'function'
    && typeof v.skip === 'function'
    && typeof v.limit === 'function'
    && typeof v.then !== 'function';
}

// Mutating ops make re-running the code (on each page request) unsafe.
const MUTATORS = 'insert|insertOne|insertMany|update|updateOne|updateMany|delete|deleteOne|deleteMany|remove|replaceOne|save|drop|dropDatabase|dropCollection|createCollection|createIndex|ensureIndex|renameCollection|bulkWrite|findAndModify|findOneAndUpdate|findOneAndReplace|findOneAndDelete';
// Catches dot calls (`.insertOne(`), bracket calls (`["insertOne"]`) and
// aggregation write stages (`$out`/`$merge`). A false positive only disables
// pagination (safe); a false negative could re-run a mutation on page jumps.
const MUTATING_RE = new RegExp(`\\b(?:${MUTATORS})\\s*\\(|\\[\\s*['"](?:${MUTATORS})['"]\\s*\\]|\\$out|\\$merge`);
// If the user already applied paging, don't override it with ours.
const USER_PAGED_RE = /\.(skip|limit)\s*\(/;

/** Only paginate read-only find()s the user didn't already page themselves. */
function canServerPaginate(code) {
  return !MUTATING_RE.test(code) && !USER_PAGED_RE.test(code);
}

/**
 * Fetch a single page from a find cursor, plus a total count when the
 * originating collection/filter are recoverable. Fetches pageSize + 1 docs to
 * detect a next page even when the count is unavailable.
 */
async function paginateFindCursor(cursor, page, pageSize) {
  const skip = (page - 1) * pageSize;
  const fetched = await cursor.skip(skip).limit(pageSize + 1).toArray();
  const hasMore = fetched.length > pageSize;
  const docs = hasMore ? fetched.slice(0, pageSize) : fetched;

  let total;
  const meta = cursor[FIND_META];
  if (meta && meta.collection && typeof meta.collection.countDocuments === 'function') {
    try { total = await meta.collection.countDocuments(meta.filter || {}); }
    catch (_) { /* count unsupported/failed — leave undefined, rely on hasMore */ }
  }

  return { docs, hasMore, total };
}

async function resolveResult(value) {
  if (value && typeof value.then === 'function') value = await value;

  // Driver cursors (FindCursor / AggregationCursor / ListIndexesCursor / ...)
  if (value && typeof value.toArray === 'function' && typeof value.then !== 'function') {
    // Pull at most SHELL_RESULT_LIMIT + 1 docs so truncation can be flagged
    // without draining the whole (possibly enormous) result set into memory.
    // Draining via toArray() on an unbounded find({}) is what freezes the app
    // on large collections — fetch lazily and stop once the limit is reached.
    if (typeof value.hasNext === 'function' && typeof value.next === 'function') {
      const docs = [];
      while (docs.length <= SHELL_RESULT_LIMIT && await value.hasNext()) {
        docs.push(await value.next());
      }
      if (typeof value.close === 'function') { try { await value.close(); } catch (_) { /* ignore */ } }
      if (docs.length > SHELL_RESULT_LIMIT) {
        return { docs: docs.slice(0, SHELL_RESULT_LIMIT), truncated: true, total: undefined };
      }
      return { docs, truncated: false, total: docs.length };
    }
    const docs = await value.toArray();
    if (docs.length > SHELL_RESULT_LIMIT) {
      return { docs: docs.slice(0, SHELL_RESULT_LIMIT), truncated: true, total: docs.length };
    }
    return { docs, truncated: false, total: docs.length };
  }
  return { value };
}

/**
 * Evaluate a mongosh-style command/script.
 *
 * @param {'source'|'target'} side
 * @param {string} dbName
 * @param {string} code   Raw mongosh JavaScript.
 * @returns {Promise<object>} { result, isArray, count, truncated, printed }
 */
async function evaluateShell(side, dbName, code, options = {}) {
  const client = getClient(side);
  const db = buildDbProxy(client, dbName);

  const printed = [];
  const print = (...args) => {
    printed.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(serializeValue(a)))).join(' '));
  };
  const consoleShim = { log: print, info: print, warn: print, error: print, debug: print };

  const scope = {
    db,
    print,
    printjson: print,
    console: consoleShim,
    ...buildBsonHelpers(),
  };
  for (const name of SHADOWED) scope[name] = undefined;

  const names = Object.keys(scope);
  const fn = compile(code, names);
  const values = names.map((n) => scope[n]);

  let raw = await fn(...values);
  if (raw && typeof raw.then === 'function') raw = await raw;

  // Server-side pagination: for a plain read-only find(), fetch only the
  // requested page (plus a count) instead of draining the whole result set.
  if (isFindCursor(raw) && canServerPaginate(code)) {
    const pageSize = Math.min(200, Math.max(1, Number(options.pageSize) || SHELL_PAGE_SIZE));

    // A jump (explicit page) re-queries with skip/limit — random access the
    // forward-only cursor can't give us. The initial run instead opens a live
    // cursor so sequential Next streams batches (mongosh `it` semantics).
    if (options.page) {
      const page = Math.max(1, Number(options.page));
      const { docs, hasMore, total } = await paginateFindCursor(raw, page, pageSize);
      return { result: serializeValue(docs), isArray: true, paginated: true, page, pageSize, hasMore, total, count: total, printed };
    }

    const { docs, hasMore } = await readBatch(raw, pageSize);
    let total;
    const fm = raw[FIND_META];
    if (fm && fm.collection && typeof fm.collection.countDocuments === 'function') {
      try { total = await fm.collection.countDocuments(fm.filter || {}); }
      catch (_) { /* count unavailable — rely on hasMore */ }
    }
    const cursorId = storeCursor(raw, pageSize);
    return { result: serializeValue(docs), isArray: true, paginated: true, page: 1, pageSize, hasMore, total, count: total, cursorId, printed };
  }

  const resolved = await resolveResult(raw);

  if (resolved.docs !== undefined) {
    return {
      result: serializeValue(resolved.docs),
      isArray: true,
      count: resolved.total,
      truncated: resolved.truncated,
      printed,
    };
  }

  const isArray = Array.isArray(resolved.value);
  return {
    result: serializeValue(resolved.value),
    isArray,
    count: isArray ? resolved.value.length : undefined,
    truncated: false,
    printed,
  };
}

module.exports = {
  evaluateShell,
  shellCursorNext,
  closeShellCursor,
  serializeValue,
};
