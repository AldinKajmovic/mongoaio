import { state, elements } from '../utils/state.js';
import {
  clearTags, tagCollection, isTagged,
  getClipboard, getTagged, copyTaggedToClipboard,
  showContextMenu, setAnchor, getAnchor, tagRange,
} from './tree-selection.js';
import { editorConnectAlias, editorLoadCollections } from './tree-data.js';
import { updateShellContext } from './shell.js';
import * as actions from './tree-actions.js';

let clickTimer = null;
let pendingClickNode = null;

/**
 * Handle collection single-click (tagging)
 */
function handleCollectionClick(e, collNode) {
  const { alias, db, coll } = collNode.dataset;
  if (e.shiftKey && getAnchor()) {
    tagRange(collNode);
  } else {
    clearTags();
    tagCollection(alias, db, coll, collNode);
    setAnchor(collNode);

    state.editor.alias = alias;
    state.editor.db = db;
    state.editor.coll = coll;
    updateShellContext();
  }
}

/**
 * Handle collection double-click (opening)
 */
function handleCollectionDblClick(header, collNode, selectCollectionFn) {
  const { alias, db, coll } = collNode.dataset;
  selectCollectionFn(header, alias, db, coll);
}

/**
 * Setup all click and context menu handlers for the tree
 */
export function setupTreeHandlers(selectCollectionFn, toggleNodeFn) {
  if (!elements.editorTree) return;

  // 1. Click Handling (Delegated)
  elements.editorTree.addEventListener('click', async (e) => {
    const header = e.target.closest('.tree-node-header');
    if (!header) return;

    const node = header.parentElement;
    const type = node.dataset.type;

    if (type === 'connection' || type === 'database') {
      toggleNodeFn(node);
      state.editor.alias = node.dataset.alias;
      state.editor.db = type === 'database' ? node.dataset.db : null;
      state.editor.coll = null;
      updateShellContext();

      if (type === 'database' && node.classList.contains('expanded')) {
        const placeholder = node.querySelector('[data-type="placeholder"]');
        if (placeholder) {
          editorLoadCollections(node.dataset.alias, node.dataset.db, node);
        }
      }
      return;
    }

    const placeholder = e.target.closest('[data-type="placeholder"]');
    if (placeholder) {
      const action = placeholder.dataset.action;
      if (action === 'connect') editorConnectAlias(placeholder.dataset.alias);
      else if (action === 'load-collections') {
        const dbNode = placeholder.closest('.tree-database');
        editorLoadCollections(placeholder.dataset.alias, placeholder.dataset.db, dbNode);
      }
      return;
    }

    const collNode = e.target.closest('.tree-collection');
    if (collNode) {
      if (clickTimer && pendingClickNode === collNode) {
        clearTimeout(clickTimer);
        clickTimer = null;
        pendingClickNode = null;
        handleCollectionDblClick(header, collNode, selectCollectionFn);
      } else {
        if (clickTimer) clearTimeout(clickTimer);
        pendingClickNode = collNode;
        const ev = { shiftKey: e.shiftKey };
        clickTimer = setTimeout(() => {
          clickTimer = null;
          pendingClickNode = null;
          handleCollectionClick(ev, collNode);
        }, 250);
      }
    }
  });

  // 2. Context Menu Handling
  elements.editorTree.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const header = e.target.closest('.tree-node-header');
    if (!header) return;

    const node = header.parentElement;
    const type = node.dataset.type;
    const items = [];

    if (type === 'connection') {
      const { alias } = node.dataset;
      items.push({ label: 'Open Shell', action: () => actions.openShell(alias) });
      items.push({ label: 'Add Database', action: () => actions.addDatabase(alias) });
      items.push({ separator: true });
      items.push({ label: 'Copy Name', action: () => actions.copyText(alias) });
      items.push({ label: 'Export URI', action: () => actions.exportUri(alias) });
      items.push({ separator: true });
      const hasClipboard = getClipboard().length > 0;
      items.push({
        label: 'Paste Database',
        disabled: !hasClipboard,
        action: () => actions.pasteIntoNewDatabase(alias)
      });
      items.push({ separator: true });
      items.push({ label: 'Disconnect', action: () => actions.disconnectServer(alias) });
      items.push({ label: 'Disconnect All', action: () => actions.disconnectAll() });
    } else if (type === 'database') {
      const { alias, db } = node.dataset;
      const hasClipboard = getClipboard().length > 0;

      items.push({ label: 'Open Shell', action: () => actions.openShell(alias, db) });
      items.push({ separator: true });
      items.push({ label: 'Copy Database', action: () => actions.copyDatabase(alias, db) });
      items.push({ label: 'Copy all collections', action: () => actions.copyAllCollections(alias, db) });
      items.push({ label: 'Export collections', action: () => actions.exportCollections(alias, db) });
      items.push({ separator: true });
      items.push({ label: 'Drop Database', action: () => actions.dropDatabase(alias, db) });
      items.push({ label: 'Add Collection', action: () => actions.addCollection(alias, db) });
      items.push({ separator: true });
      items.push({
        label: `Paste Collection(s) into ${db}`,
        disabled: !hasClipboard,
        action: () => actions.pasteCollections(alias, db),
      });
    } else if (type === 'collection') {
      const { alias, db, coll } = node.dataset;
      const tagged = isTagged(alias, db, coll);
      const taggedList = getTagged();
      const hasClipboard = getClipboard().length > 0;

      items.push({ label: 'Open Collection', action: () => selectCollectionFn(header, alias, db, coll) });
      items.push({ separator: true });
      items.push({
        label: `Copy${taggedList.length > 1 ? ` (${taggedList.length})` : ''}`,
        disabled: taggedList.length === 0 && !tagged,
        action: () => {
          if (!isTagged(alias, db, coll)) tagCollection(alias, db, coll, node);
          copyTaggedToClipboard();
        }
      });
      items.push({
        label: `Paste Here (into ${db})`,
        disabled: !hasClipboard,
        action: () => actions.pasteCollections(alias, db),
      });
    }

    if (items.length > 0) showContextMenu(e.clientX, e.clientY, items);
  });
}
