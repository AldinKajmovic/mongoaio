import { state, elements } from '../utils/state.js';
import { toast } from '../utils/ui.js';
import { debounce } from '../utils/dom.js';
import { appendShellResult } from './shell-renderer.js';
import { initShellTabs } from './shell-tabs.js';

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

    // Validation with Debounce
    elements.editorShellTextarea.addEventListener('input', debounce(() => {
      validateShellContent();
    }, 500));
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

const READ_METHODS = ['find', 'findOne', 'countDocuments', 'aggregate'];
const WRITE_METHODS = ['deleteMany', 'deleteOne', 'insertOne', 'insertMany', 'updateOne', 'updateMany'];
const ALL_METHODS = [...READ_METHODS, ...WRITE_METHODS].join('|');
const SHELL_PATTERN = new RegExp(
  `db\\.(?:getCollection\\(['\"](.+?)['\"]\\)|([a-zA-Z0-9_$]+))\\.(${ALL_METHODS})\\(([\\s\\S]*?)\\)`
);

/**
 * Split top-level comma-separated JSON parameters, respecting nesting.
 * @returns {string[]}
 */
function splitParams(raw) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(raw.substring(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(raw.substring(start).trim());
  return parts.filter(Boolean);
}

/**
 * Parse a shell command string into a structured command.
 * @returns {{ method: string, query?: object, params?: Array, targetColl?: string, error?: string }}
 */
function parseShellCommand(code) {
  let targetColl = state.editor.coll;
  const match = code.match(SHELL_PATTERN);

  if (match) {
    targetColl = match[1] || match[2];
    const method = match[3];
    const rawParams = match[4].trim();

    if (READ_METHODS.includes(method)) {
      let query = {};
      if (rawParams) {
        try { query = JSON.parse(rawParams); }
        catch (e) {
          const blockMatch = rawParams.match(/\{[\s\S]*\}/);
          if (blockMatch) {
            try { query = JSON.parse(blockMatch[0]); }
            catch (e2) { return { error: `Parameter Parse Error: ${e2.message}` }; }
          }
        }
      }
      return { method: 'read', query, targetColl };
    }

    // Write operation — parse potentially multiple params
    const parts = splitParams(rawParams);
    try {
      const parsed = parts.length > 0 ? parts.map(p => JSON.parse(p)) : [{}];
      return { method, params: parsed, targetColl };
    } catch (e) {
      return { error: `Parameter Parse Error: ${e.message}` };
    }
  }

  // Fallback: raw JSON filter
  try {
    const query = JSON.parse(code);
    return { method: 'read', query, targetColl };
  } catch (err) {
    return { error: `Syntax Error: Could not parse as mongosh command or JSON filter. Ensure your query is valid JSON. Error: ${err.message}` };
  }
}

async function executeBlock(text) {
  const code = text.replace(/\/\/.*/g, '').trim();
  if (!code) return;

  const parsed = parseShellCommand(code);
  if (parsed.error) {
    appendShellResult(code, parsed.error, 'error');
    return;
  }

  const { targetColl } = parsed;

  if (!targetColl) {
    toast('No collection target. Use db.collection.find() or select one in the tree.', 'warning');
    return;
  }

  if (!state.editor.db) {
    toast('No database selected. Click on a database in the tree sidebar first.', 'warning');
    return;
  }

  try {
    const side = state.editor.side || 'source';
    const dbName = state.editor.db;

    if (parsed.method === 'read') {
      const result = await window.api.executeQuery(side, dbName, targetColl, { filter: parsed.query });
      if (result.error) {
        appendShellResult(code, result.error, 'error');
      } else {
        appendShellResult(code, result.items, 'success', result);
      }
    } else {
      const result = await window.api.shellExecute(side, dbName, targetColl, parsed.method, parsed.params);
      if (result.error) {
        appendShellResult(code, result.error, 'error');
      } else {
        appendShellResult(code, result, 'success');
      }
    }
  } catch (err) {
    appendShellResult(code, `Execution Error: ${err.message}`, 'error');
  }
}

function validateShellContent() {
  const text = elements.editorShellTextarea.value.replace(/\/\/.*/g, '').trim();
  if (!text) {
    elements.shellJsonError.classList.add('u-hidden');
    return;
  }

  try {
    JSON.parse(text);
    elements.shellJsonError.classList.add('u-hidden');
  } catch (e) {
    elements.shellJsonError.textContent = 'Invalid JSON';
    elements.shellJsonError.classList.remove('u-hidden');
  }
}
