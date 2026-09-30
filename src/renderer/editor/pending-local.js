/* =============================================
   Editor — Local Copies of Saved Documents
   ============================================= */

import { currentRenderedItems, currentEJSONItems, markViewsStale } from './query.js';
import { docKeyFor } from './pending-edits.js';
import { syncDocFieldCount } from './pending-dom.js';

/** Find a document in the rendered results by its pending-store key. */
export function locateDocIndex(docKey, hintIndex) {
  const cached = currentRenderedItems[hintIndex];
  if (cached && docKeyFor(cached._id) === docKey) return hintIndex;
  return currentRenderedItems.findIndex(doc => docKeyFor(doc._id) === docKey);
}

/** Swap in the saved copy of a document so every view stays current without re-querying. */
export function replaceLocalDoc(index, saved) {
  if (index < 0) return;
  currentRenderedItems[index] = saved.document;
  if (currentEJSONItems.length > index) currentEJSONItems[index] = saved.documentEJSON;
  syncDocFieldCount(index, saved.document);
  markViewsStale(['json', 'table']);
}
