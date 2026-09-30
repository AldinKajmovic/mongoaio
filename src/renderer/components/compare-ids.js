/* =============================================
   Components — Compare Item Keys
   ============================================= */

import { state } from '../utils/state.js';

/** The compare result item for a DOM key, or null. */
export function compareItem(key) {
  return state.docComparison?.items[Number(key)] ?? null;
}

/** The _id to send to the main process for writes (EJSON; compound ids stay intact). */
export function compareWriteId(key) {
  const ref = state.docComparison?.itemIds?.[Number(key)];
  return ref ? ref.writeId : compareItem(key)?._id;
}

/** The _id as shown to the user. */
export function compareIdLabel(key) {
  const ref = state.docComparison?.itemIds?.[Number(key)];
  if (ref) return ref.label;
  const id = compareItem(key)?._id;
  return typeof id === 'object' ? JSON.stringify(id) : String(id);
}

/** The document shown for `side` (common items hold both sides; unique ones are the doc itself). */
export function compareDoc(key, side) {
  const item = compareItem(key);
  if (!item) return null;
  if (state.activeDocTab !== 'different') return item;
  return side === 'source' ? item.source : item.target;
}
