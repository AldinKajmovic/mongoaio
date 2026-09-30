const TTL_MS = 30000;
const MAX_ENTRIES = 4;

/** @type {Map<string, { at: number, value: any }>} */
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached(key, value) {
  cache.delete(key);
  cache.set(key, { at: Date.now(), value });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

function invalidateCompareCache() {
  cache.clear();
}

module.exports = { getCached, setCached, invalidateCompareCache };
