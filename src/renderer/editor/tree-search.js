/* =============================================
   Editor — Tree Search Matching & Expand Budget
   ============================================= */

let matchMemo = new WeakMap();
let matchMemoQuery = null;

export function subtreeMatchesSearch(val, sq) {
  if (!sq) return false;
  if (matchMemoQuery !== sq) {
    matchMemo = new WeakMap();
    matchMemoQuery = sq;
  }
  return walkMatches(val, sq);
}

function walkMatches(val, sq) {
  if (val === null || typeof val !== 'object') {
    return String(val).toLowerCase().includes(sq);
  }
  const cached = matchMemo.get(val);
  if (cached !== undefined) return cached;

  let found = false;
  if (Array.isArray(val)) {
    for (const item of val) {
      if (walkMatches(item, sq)) { found = true; break; }
    }
  } else {
    for (const [k, v] of Object.entries(val)) {
      if (k.toLowerCase().includes(sq) || walkMatches(v, sq)) { found = true; break; }
    }
  }
  matchMemo.set(val, found);
  return found;
}

export const MAX_AUTO_EXPANDED_ROWS = 2000;
let autoExpandBudget = MAX_AUTO_EXPANDED_ROWS;
let autoExpandedRows = 0;
let autoExpandTruncated = false;

/**
 * Reset the eager-expansion budget — called once per results render. Clears the
 * truncation flag, so only a full re-render may declare the tree complete again.
 */
export function resetAutoExpandBudget(rows = MAX_AUTO_EXPANDED_ROWS) {
  autoExpandBudget = rows;
  autoExpandedRows = 0;
  autoExpandTruncated = false;
}

/**
 * Give the next subtree its own slice of rows, without clearing the "matches
 * were left collapsed" flag. Each document on the page gets a share, so one fat
 * document can't spend the whole page's budget and leave the rest unexpanded.
 * Also used for a manual expand, which says nothing about the rest of the tree.
 */
export function allocAutoExpandBudget(rows) {
  autoExpandBudget = rows;
  autoExpandedRows = 0;
}

/** True when the last render left matching branches collapsed for budget. */
export function wasAutoExpandTruncated() {
  return autoExpandTruncated;
}

/**
 * Charge one row against the current allowance and report whether a branch with
 * matches may be eagerly expanded. Records that matches were left collapsed
 * when the allowance is spent.
 */
export function claimAutoExpand(branchMatches) {
  autoExpandedRows++;
  const autoExpand = branchMatches && autoExpandedRows < autoExpandBudget;
  if (branchMatches && !autoExpand) autoExpandTruncated = true;
  return autoExpand;
}

/**
 * Count how many times the query occurs across a value's keys and primitives —
 * the number of highlights a fully expanded render would produce. Used to keep
 * the result counter honest when expansion was capped.
 */
export function countMatches(val, sq) {
  if (!sq) return 0;
  let n = 0;
  const countIn = (str) => {
    const hay = str.toLowerCase();
    let i = hay.indexOf(sq);
    while (i !== -1) { n++; i = hay.indexOf(sq, i + sq.length); }
  };
  const walk = (v) => {
    if (v === null || typeof v !== 'object') { countIn(String(v)); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    for (const [k, child] of Object.entries(v)) {
      countIn(k);
      walk(child);
    }
  };
  walk(val);
  return n;
}
