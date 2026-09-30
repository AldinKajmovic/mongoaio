/* =============================================
   Editor — Row Value Store
   ============================================= */

let store = new Map();
let seq = 0;

/** Stash a value and return the attribute text that references it. */
export function stashValue(val) {
  const key = `v${++seq}`;
  store.set(key, val);
  return key;
}

export function clearValueStore() {
  store = new Map();
}
export function elementValue(el) {
  if (!el) return undefined;
  const ref = el.dataset.valueRef;
  if (ref !== undefined) return store.get(ref);
  const raw = el.dataset.value;
  if (raw === undefined) return undefined;
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

/** Same as elementValue, but as the JSON text (for copy/expand affordances). */
export function elementValueText(el) {
  if (!el) return '';
  const ref = el.dataset.valueRef;
  if (ref !== undefined) {
    const val = store.get(ref);
    return val === undefined ? '' : JSON.stringify(val);
  }
  return el.dataset.value ?? '';
}

const TRUNCATED = Symbol('truncated');

/**
 * Serialize a value to at most `max` characters, giving up as soon as the
 * budget is spent. JSON.stringify has no early exit, so a 1.7 MB field cost a
 * full serialization per cell to produce a 50-character preview.
 */
export function previewJson(val, max) {
  if (val === null || typeof val !== 'object') return String(val).slice(0, max);

  let out = '';
  const emit = (s) => {
    if (out.length >= max) throw TRUNCATED;
    out += s.length > max ? s.slice(0, max) : s;
  };
  const walk = (v) => {
    if (v === null || typeof v !== 'object' || typeof v.toJSON === 'function') {
      emit(JSON.stringify(v) ?? 'null');
    } else if (Array.isArray(v)) {
      emit('[');
      v.forEach((item, i) => { if (i) emit(','); walk(item); });
      emit(']');
    } else {
      emit('{');
      Object.entries(v).forEach(([k, item], i) => {
        if (i) emit(',');
        emit(`${JSON.stringify(k)}:`);
        walk(item);
      });
      emit('}');
    }
  };

  try { walk(val); } catch (e) { if (e !== TRUNCATED) throw e; }
  return out.slice(0, max);
}
