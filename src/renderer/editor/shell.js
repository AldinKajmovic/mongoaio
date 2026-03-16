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
    elements.btnShellRunLine.addEventListener('click', () => runSelectedLines(true));
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
  const tabs = [
    { btn: elements.btnEditorViewCollections, content: elements.editorViewCollectionsContent },
    { btn: elements.btnEditorViewShell, content: elements.editorViewShellContent }
  ];

  tabs.forEach(tab => {
    if (tab.btn) {
      tab.btn.addEventListener('click', () => {
        tabs.forEach(t => {
          if (t.btn) t.btn.classList.remove('active');
          if (t.content) t.content.classList.add('u-hidden');
        });
        tab.btn.classList.add('active');
        tab.content.classList.remove('u-hidden');

        if (tab.btn === elements.btnEditorViewShell) {
          updateShellContext();
        }
      });
    }
  });
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

async function runSelectedLines(oneLineOnly = false) {
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
 * Parse a shell command string into a query object and target collection.
 * @returns {{ query?: object, targetColl?: string, error?: string }}
 */
function parseShellCommand(code) {
  let query = {};
  let targetColl = state.editor.coll;

  const pattern = /db\.(?:getCollection\(['"](.+?)['"]\)|([a-zA-Z0-9_$]+))\.(find|findOne|countDocuments|aggregate)\(([\s\S]*?)\)/;
  const match = code.match(pattern);

  if (match) {
    targetColl = match[1] || match[2];
    const params = match[4].trim();
    if (params) {
      try {
        query = JSON.parse(params);
      } catch (e) {
        const blockMatch = params.match(/\{[\s\S]*\}/);
        if (blockMatch) {
          try { query = JSON.parse(blockMatch[0]); }
          catch (e2) { return { error: `Parameter Parse Error: ${e2.message}` }; }
        }
      }
    }
  } else {
    try {
      query = JSON.parse(code);
    } catch (err) {
      return { error: `Syntax Error: Could not parse as mongosh command or JSON filter. Ensure your query is valid JSON. Error: ${err.message}` };
    }
  }

  return { query, targetColl };
}

async function executeBlock(text) {
  const code = text.replace(/\/\/.*/g, '').trim();
  if (!code) return;

  const parsed = parseShellCommand(code);
  if (parsed.error) {
    appendShellResult(code, parsed.error, 'error');
    return;
  }

  const { query, targetColl } = parsed;

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
    const result = await window.api.executeQuery(side, dbName, targetColl, { filter: query });

    if (result.error) {
      appendShellResult(code, result.error, 'error');
    } else {
      appendShellResult(code, result.items, 'success', result);
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
