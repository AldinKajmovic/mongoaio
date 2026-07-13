// Import/Export buttons.
// Contract: export initImportExport() (called once at startup from renderer.js).
// Wires #btn-editor-export and #btn-editor-import to window.api.exportData /
// window.api.importData (both open native OS dialogs in the main process).
import { state, elements } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { parseRelaxedJSON, escapeHtml } from '../utils/dom.js';
import { openPopover, closePopover } from '../utils/popover.js';
import { runEditorQuery } from './query.js';

// --- Export -----------------------------------------------------------------

function openExportPopover(anchorEl) {
  const html = `
    <div class="io-popover-header">Export documents</div>
    <div class="io-popover-body">
      <div class="io-popover-field">
        <label for="io-export-format">Format</label>
        <select id="io-export-format" class="io-popover-select">
          <option value="json" selected>JSON (array)</option>
          <option value="jsonl">JSON Lines</option>
          <option value="csv">CSV</option>
        </select>
      </div>
      <div class="io-popover-field">
        <label for="io-export-scope">Scope</label>
        <select id="io-export-scope" class="io-popover-select">
          <option value="query" selected>Current query results</option>
          <option value="all">Entire collection</option>
        </select>
      </div>
    </div>
    <div class="io-popover-footer">
      <button type="button" class="btn btn-ghost btn-sm" id="io-export-cancel">Cancel</button>
      <button type="button" class="btn btn-primary btn-sm" id="io-export-confirm">Export</button>
    </div>
  `;

  const pop = openPopover(anchorEl, html, { className: 'io-popover io-export-popover' });
  pop.querySelector('#io-export-cancel').addEventListener('click', closePopover);
  pop.querySelector('#io-export-confirm').addEventListener('click', () => {
    const format = pop.querySelector('#io-export-format').value;
    const scope = pop.querySelector('#io-export-scope').value;
    closePopover();
    doExport(format, scope);
  });
}

async function doExport(format, scope) {
  const side = state.editor.side || 'source';
  const dbName = state.editor.db;
  const collName = state.editor.coll;
  if (!dbName || !collName) {
    toast('Select a collection in the sidebar first', 'warning');
    return;
  }

  const params = { side, dbName, collName, format, scope };

  if (scope === 'query') {
    let filter, sort, projection;
    try {
      filter = parseRelaxedJSON(elements.editorQueryFilter.value.trim() || '{}');
      sort = parseRelaxedJSON(elements.editorQuerySort.value.trim() || '{}');
      projection = parseRelaxedJSON(elements.editorQueryProjection.value.trim() || '{}');
    } catch (e) {
      toast(`Invalid query: ${e.message}`, 'error');
      return;
    }
    params.filter = filter;
    params.sort = sort;
    params.projection = projection;
    const limit = parseInt(elements.editorQueryLimit.value, 10);
    if (!isNaN(limit) && limit > 0) params.limit = limit;
  }

  showLoading('Exporting documents...');
  try {
    const result = await window.api.exportData(params);
    if (result && result.canceled) return;
    if (result && result.error) { toast(result.error, 'error'); return; }
    toast(`Exported ${result.count} documents to ${result.filePath}`, 'success');
  } catch (err) {
    toast(`Export failed: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// --- Import -----------------------------------------------------------------

function openImportPopover(anchorEl) {
  const dbName = state.editor.db;
  const collName = state.editor.coll;
  const html = `
    <div class="io-popover-header">Import documents</div>
    <div class="io-popover-body">
      <p class="io-popover-text">
        Documents will be inserted into <strong>${escapeHtml(String(dbName))}.${escapeHtml(String(collName))}</strong>.
        Pick a JSON, JSON Lines (.jsonl/.ndjson) or CSV file — the format is
        detected automatically from its extension.
      </p>
    </div>
    <div class="io-popover-footer">
      <button type="button" class="btn btn-ghost btn-sm" id="io-import-cancel">Cancel</button>
      <button type="button" class="btn btn-primary btn-sm" id="io-import-confirm">Choose file &amp; import</button>
    </div>
  `;

  const pop = openPopover(anchorEl, html, { className: 'io-popover io-import-popover' });
  pop.querySelector('#io-import-cancel').addEventListener('click', closePopover);
  pop.querySelector('#io-import-confirm').addEventListener('click', () => {
    closePopover();
    doImport();
  });
}

async function doImport() {
  const side = state.editor.side || 'source';
  const dbName = state.editor.db;
  const collName = state.editor.coll;
  if (!dbName || !collName) {
    toast('Select a collection in the sidebar first', 'warning');
    return;
  }

  showLoading('Importing documents...');
  try {
    const result = await window.api.importData({ side, dbName, collName });
    if (result && result.canceled) return;
    if (result && result.error) { toast(result.error, 'error'); return; }
    const skipped = result.skipped || 0;
    if (skipped > 0) {
      toast(`Imported ${result.insertedCount} documents · ${skipped} skipped (duplicates or invalid)`, 'warning');
    } else {
      toast(`Imported ${result.insertedCount} documents`, 'success');
    }
    if (state.editor.db && state.editor.coll) runEditorQuery();
  } catch (err) {
    toast(`Import failed: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// --- Wiring ------------------------------------------------------------------

export function initImportExport() {
  if (elements.btnEditorExport) {
    elements.btnEditorExport.addEventListener('click', () => {
      const dbName = state.editor.db;
      const collName = state.editor.coll;
      if (!dbName || !collName) {
        toast('Select a collection in the sidebar first', 'warning');
        return;
      }
      openExportPopover(elements.btnEditorExport);
    });
  }

  if (elements.btnEditorImport) {
    elements.btnEditorImport.addEventListener('click', () => {
      const dbName = state.editor.db;
      const collName = state.editor.coll;
      if (!dbName || !collName) {
        toast('Select a collection in the sidebar first', 'warning');
        return;
      }
      openImportPopover(elements.btnEditorImport);
    });
  }
}
