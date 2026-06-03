import { state, elements } from '../utils/state.js';
import { toast } from '../utils/ui.js';
import { appendShellResult } from './shell-renderer.js';
import { initShellTabs } from './shell-tabs.js';
import { hideMetricsPanel } from './metrics.js';

/**
 * Initialize Shell Tab Event Listeners
 */
export function initEditorShellLogic() {
  // Tab Switching
  setupTabSwitching();

  // Initialize multi-tab support
  initShellTabs();

  // Run Actions
  if (elements.btnShellRunLine) {
    elements.btnShellRunLine.addEventListener('click', () => runSelectedLines());
  }
  if (elements.btnShellRunAll) {
    elements.btnShellRunAll.addEventListener('click', () => runAllLines());
  }

  // Keyboard Shortcuts
  if (elements.editorShellTextarea) {
    elements.editorShellTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const start = elements.editorShellTextarea.selectionStart;
        const end = elements.editorShellTextarea.selectionEnd;

        if (start !== end) {
          runSelectedLines();
        } else {
          runAllLines();
        }
      }
    });
  }
}

function setupTabSwitching() {
  // Shell button opens shell panel inside the result area
  if (elements.btnEditorViewShell) {
    elements.btnEditorViewShell.addEventListener('click', () => {
      showShellPanel();
    });
  }

  // Collections button returns to data view
  if (elements.btnEditorViewCollections) {
    elements.btnEditorViewCollections.addEventListener('click', () => {
      hideShellPanel();
    });
  }

}

/**
 * Show the shell panel, hiding the collections/editor content
 */
export function showShellPanel() {
  hideMetricsPanel();
  if (elements.editorViewCollectionsContent) elements.editorViewCollectionsContent.classList.add('u-hidden');
  if (elements.editorViewShellContent) elements.editorViewShellContent.classList.remove('u-hidden');

  if (elements.btnEditorViewShell) elements.btnEditorViewShell.classList.add('active');
  if (elements.btnEditorViewCollections) elements.btnEditorViewCollections.classList.remove('active');

  updateShellContext();
}

/**
 * Hide the shell panel, returning to the collections/editor view
 */
export function hideShellPanel() {
  hideMetricsPanel();
  if (elements.editorViewShellContent) elements.editorViewShellContent.classList.add('u-hidden');
  if (elements.editorViewCollectionsContent) elements.editorViewCollectionsContent.classList.remove('u-hidden');

  if (elements.btnEditorViewShell) elements.btnEditorViewShell.classList.remove('active');
  if (elements.btnEditorViewCollections) elements.btnEditorViewCollections.classList.add('active');
}

/**
 * Update the UI label showing the active DB/Collection for the shell
 */
export function updateShellContext() {
  if (!elements.shellActiveTarget) return;

  const alias = state.editor.alias || '';
  const db = state.editor.db || '';
  const coll = state.editor.coll || '';

  if (db && coll) {
    elements.shellActiveTarget.textContent = `${alias} > ${db}.${coll}`;
    elements.shellActiveTarget.classList.remove('u-text-error');
    elements.shellActiveTarget.classList.add('u-text-amber');
  } else if (db) {
    elements.shellActiveTarget.textContent = `${alias} > ${db}`;
    elements.shellActiveTarget.classList.remove('u-text-error');
    elements.shellActiveTarget.classList.add('u-text-amber');
  } else {
    elements.shellActiveTarget.textContent = 'No database/collection selected';
    elements.shellActiveTarget.classList.remove('u-text-amber');
    elements.shellActiveTarget.classList.add('u-text-error');
  }
}

async function runSelectedLines() {
  const textarea = elements.editorShellTextarea;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  let text = '';

  if (start !== end) {
    text = textarea.value.substring(start, end);
  } else {
    // Get current line
    const currentPos = textarea.selectionStart;
    const lines = textarea.value.split('\n');
    let charCount = 0;
    for (const line of lines) {
      if (charCount <= currentPos && currentPos <= charCount + line.length) {
        text = line;
        break;
      }
      charCount += line.length + 1; // +1 for newline
    }
  }

  if (!text.trim()) return;
  executeBlock(text);
}

async function runAllLines() {
  const text = elements.editorShellTextarea.value;
  if (!text.trim()) return;

  // For "Run All", we could either run as one block or split by lines.
  // Given the "JSON validator", running as one block (one big JSON) makes more sense.
  executeBlock(text);
}

/**
 * Strip JS comments from a command block without touching string contents.
 * Removes // line comments and block comments while leaving quoted text intact.
 */
function stripComments(code) {
  let out = '';
  let str = null; // active quote char, or null
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];
    if (str) {
      out += ch;
      if (ch === '\\') { out += code[++i] ?? ''; continue; }
      if (ch === str) str = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { str = ch; out += ch; continue; }
    if (ch === '/' && next === '/') { while (i < code.length && code[i] !== '\n') i++; out += '\n'; continue; }
    if (ch === '/' && next === '*') { i += 2; while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++; i++; continue; }
    out += ch;
  }
  return out;
}

/**
 * If the block is a bare JSON filter (mongosh shorthand), turn it into a
 * find() against the currently-selected collection.
 */
function expandBareFilter(code) {
  const trimmed = code.trim();
  if (!trimmed.startsWith('{')) return code;
  try {
    JSON.parse(trimmed);
  } catch (_) {
    return code; // not valid JSON — let the engine parse it as JS
  }
  const coll = state.editor.coll;
  if (!coll) return code;
  return `db.getCollection(${JSON.stringify(coll)}).find(${trimmed})`;
}

async function executeBlock(text) {
  const code = expandBareFilter(stripComments(text).trim());
  if (!code) return;

  if (!state.editor.db) {
    toast('No database selected. Click on a database in the tree sidebar first.', 'warning');
    return;
  }

  const side = state.editor.side || 'source';
  const dbName = state.editor.db;

  try {
    const res = await window.api.shellEval(side, dbName, code);
    if (res.error) {
      appendShellResult(text, res.error, 'error');
      return;
    }

    const content = res.result === undefined ? '(no value returned)' : res.result;
    const meta = {
      total: res.total !== undefined ? res.total : (res.isArray ? res.count : undefined),
      printed: res.printed || [],
      truncated: !!res.truncated,
      // Server-side pagination: keep what's needed to fetch other pages.
      paginated: !!res.paginated,
      pageSize: res.pageSize || 10,
      hasMore: !!res.hasMore,
      side, db: dbName, code,
      // Live cursor for sequential Next (mongosh `it`); cache visited pages so
      // Prev/First are instant; cursorPage tracks how far the cursor has read.
      cursorId: res.cursorId || null,
      cursorPage: 1,
      cache: res.paginated ? { 1: content } : null,
    };
    appendShellResult(text, content, 'success', meta);

    if (res.truncated && !res.paginated) {
      const shown = Array.isArray(res.result) ? res.result.length : '';
      const ofTotal = res.count !== undefined ? ` of ${res.count}` : '';
      toast(`Result truncated to the first ${shown}${ofTotal} documents. Use .limit() / .skip() to page through more.`, 'warning');
    }
  } catch (err) {
    appendShellResult(text, `Execution Error: ${err.message}`, 'error');
  }
}
