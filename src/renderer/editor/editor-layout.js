import { $ } from '../utils/state.js';

export function initEditorShell() {
  const container = $('#db-editor-view-container');
  if (!container) return;

  container.innerHTML = `
    <div id="db-editor-view" class="editor-container">
      <header class="editor-header">
        <div class="editor-header-left">
          <button id="btn-editor-back" class="btn btn-ghost btn-sm" title="Back to Connections"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
          <div class="logo-sm">CompareDB</div>
          <nav class="editor-nav">
            <button id="btn-editor-view-collections" class="btn btn-ghost btn-sm active">Collections</button>
            <button id="btn-editor-view-shell" class="btn btn-ghost btn-sm">Shell</button>
          </nav>
        </div>
        <div class="editor-header-right">
        </div>
      </header>

      <div class="editor-layout">
        <!-- Sidebar -->
        <aside class="editor-sidebar">
          <div class="editor-sidebar-header">
            <div class="u-flex u-w-full u-gap-8 u-justify-end">
              <button class="btn btn-ghost btn-icon btn-sm" id="btn-editor-tree-refresh" title="Refresh Tree"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>
            </div>
            <input type="text" id="editor-tree-search" placeholder="Filter collections..." spellcheck="false" class="editor-search-input u-w-full">
          </div>
          <div class="editor-tree" id="editor-tree">
            <div class="u-p-20 u-text-center u-text-muted u-font-small">Loading database tree...</div>
          </div>
          <div class="editor-sidebar-footer">
            <button class="btn btn-ghost btn-icon btn-sm" id="btn-import-connections" title="Import connections"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
          </div>
        </aside>

        <div class="editor-resize-handle editor-resize-sidebar" id="editor-resize-sidebar"></div>

        <!-- Main Workspace -->
        <div class="editor-main">



          <div id="editor-result-container">
            <!-- Collections View Content -->
            <div id="editor-view-collections-content">
              <div class="editor-main-toolbar">
                <div class="editor-query-bar">
                  <div class="editor-query-row">
                    <label class="editor-query-label">Query</label>
                    <div class="u-flex u-grow u-gap-4 u-items-center">
                      <input type="text" id="editor-query-filter" class="editor-query-input" value="{}" spellcheck="false">
                      <button id="btn-editor-run-query" class="btn btn-primary btn-sm">Run</button>
                    </div>
                    <label class="editor-query-label">Sort</label>
                    <div class="u-flex u-grow u-gap-4 u-items-center">
                      <input type="text" id="editor-query-sort" class="editor-query-input" value="{}" spellcheck="false">
                      <button id="btn-editor-sort-asc" class="btn btn-ghost btn-sm">↑</button>
                      <button id="btn-editor-sort-desc" class="btn btn-ghost btn-sm">↓</button>
                    </div>
                  </div>
                  <div class="editor-query-row">
                    <label class="editor-query-label">Projection</label>
                    <input type="text" id="editor-query-projection" class="editor-query-input" value="{}" spellcheck="false">
                    <label class="editor-query-label">Limit</label>
                    <input type="text" id="editor-query-limit" class="editor-query-input editor-query-input-sm" value="10">
                    <label class="editor-query-label">Skip</label>
                    <input type="text" id="editor-query-skip" class="editor-query-input editor-query-input-sm" value="0">
                  </div>
                </div>

                <div class="editor-result-tabs">
                  <button class="editor-result-tab active" data-editor-tab="result">Result</button>
                </div>

                <div class="editor-pagination-bar">
                  <div class="editor-pagination-left">
                    <button class="btn btn-ghost btn-icon btn-sm" id="btn-editor-refresh"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>
                    <button class="btn btn-ghost btn-icon btn-sm" id="btn-editor-first">|&#8249;</button>
                    <button class="btn btn-ghost btn-icon btn-sm" id="btn-editor-prev">&#8249;</button>
                    <button class="btn btn-ghost btn-icon btn-sm" id="btn-editor-next">&#8250;</button>
                    <button class="btn btn-ghost btn-icon btn-sm" id="btn-editor-last">&#8250;|</button>
                    <select class="editor-page-size-select" id="editor-page-size-select">
                      <option value="10" selected>10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option>
                    </select>
                    <span class="editor-pagination-info" id="editor-pagination-info">Documents 0 to 0</span>
                  </div>
                  <div class="editor-pagination-right">
                    <button class="btn btn-ghost btn-icon btn-sm" id="btn-editor-search-local" title="Search loaded (Ctrl+F)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
                    <button class="btn btn-ghost btn-icon btn-sm" id="btn-editor-add-doc" title="Add document"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
                    <div class="editor-view-dropdown" id="editor-view-dropdown">
                      <button class="btn btn-ghost btn-sm editor-view-dropdown-btn" id="editor-view-dropdown-btn">
                        <span id="editor-current-view-label">Tree View</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                      <div class="editor-view-dropdown-menu" id="editor-view-options">
                        <button class="editor-view-option active" data-view="tree">Tree View</button>
                        <button class="editor-view-option" data-view="json">JSON View</button>
                        <button class="editor-view-option" data-view="table">Table View</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div id="editor-search-bar" class="editor-search-bar">
                <input type="text" id="editor-search-input" class="editor-search-bar-input" placeholder="Search in results...">
                <span id="editor-search-count" class="editor-search-bar-count"></span>
                <button id="editor-search-prev" class="btn btn-ghost btn-icon btn-sm">&#8249;</button>
                <button id="editor-search-next" class="btn btn-ghost btn-icon btn-sm">&#8250;</button>
                <button id="editor-search-clear" class="btn btn-ghost btn-icon btn-sm">&times;</button>
              </div>

              <div class="editor-data-panel" id="editor-data-tree">
                <div class="editor-data-header" id="editor-tree-header">
                  <span class="editor-data-col editor-data-col-key">Key<span class="col-resize-handle" data-col="0"></span></span>
                  <span class="editor-data-col editor-data-col-value">Value<span class="col-resize-handle" data-col="1"></span></span>
                  <span class="editor-data-col editor-data-col-type">Type</span>
                </div>
                <div class="editor-data-rows" id="editor-tree-rows"></div>
              </div>
              <div class="editor-data-panel" id="editor-data-json"><pre>[]</pre></div>
              <div class="editor-data-panel" id="editor-data-table">
                <div class="editor-table-wrapper"><table class="editor-table" id="editor-table"><thead><tr id="editor-table-head"><th class="editor-table-th">#</th></tr></thead><tbody id="editor-table-body"></tbody></table></div>
              </div>

            </div>

            <!-- Shell View Content (separate from editor) -->
            <div id="editor-view-shell-content" class="u-hidden">
              <div class="editor-shell-container">
                <div id="shell-tab-bar" class="shell-tab-bar"></div>
                <div class="editor-shell-context-bar" id="shell-context-bar">
                  <span class="u-text-muted">Target:</span>
                  <span id="shell-active-target" class="u-font-mono u-text-amber">No collection selected</span>
                </div>
                <div id="shell-tab-body" class="editor-shell-body">
                  <div class="editor-shell-editor-wrap">
                    <div class="editor-shell-toolbar">
                      <button id="btn-shell-run-line" class="btn btn-ghost btn-sm">Run Line</button>
                      <button id="btn-shell-run-all" class="btn btn-primary btn-sm">Run All</button>
                      <div id="shell-json-error" class="shell-error-pill u-hidden">Invalid JSON</div>
                    </div>
                    <textarea id="editor-shell-textarea" class="editor-shell-textarea" spellcheck="false" placeholder="// Write queries here...&#10;// e.g. {&quot;age&quot;: {&quot;$gt&quot;: 20}}"></textarea>
                  </div>
                  <div id="editor-shell-results" class="editor-shell-results">
                    <div class="u-p-16 u-text-muted u-italic">No results yet.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="editor-status-bar">
            <span class="editor-status-info">0 items selected</span>
            <div class="editor-status-right">
              <button class="btn btn-ghost btn-sm">Count Documents</button>
              <span class="editor-status-time">0.000s</span>
            </div>
          </div>
        </div>
        <div class="editor-resize-handle editor-resize-querypanel" id="editor-resize-querypanel"></div>
        <aside class="editor-query-panel">
          <div class="editor-query-panel-header"><span>Query Builder</span></div>
          <div class="editor-query-panel-section">
            <label class="editor-query-panel-label">Query Mode</label>
            <select class="editor-query-panel-select" id="editor-qb-mode">
              <option value="all">Match all</option>
              <option value="any">Match any</option>
              <option value="nor">Match none ($nor)</option>
              <option value="elemMatch">Has array element matching</option>
              <option value="notElemMatch">Has no array element matching</option>
            </select>
          </div>
          <div class="editor-query-panel-section editor-qb-fields-section">
            <div class="editor-query-panel-section-header"><span>Fields</span></div>
            <div id="editor-qb-fields" class="editor-qb-fields"></div>
            <div class="editor-query-panel-dropzone" id="editor-qb-dropzone">+ Drag fields here</div>
          </div>
          <div class="editor-query-panel-section editor-qb-actions">
            <button class="btn btn-ghost btn-sm" id="btn-qb-clear">Clear</button>
            <button class="btn btn-primary btn-sm" id="btn-qb-run">Run</button>
          </div>
        </aside>
      </div>
    </div>
  `;
}
function toggleEditorViewDropdown() {
  const menu = document.getElementById('editor-view-options');
  if (menu) menu.classList.toggle('show');
}

function setEditorView(view) {
  const menu = document.getElementById('editor-view-options');
  if (menu) menu.classList.remove('show');

  const label = document.getElementById('editor-current-view-label');
  if (label) {
    const viewName = view.charAt(0).toUpperCase() + view.slice(1);
    label.textContent = viewName + ' View';
  }

  document.querySelectorAll('.editor-view-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.view === view);
  });

  // Toggle panels
  document.querySelectorAll('.editor-data-panel').forEach(p => {
    p.classList.add('u-hidden');
    p.style.display = 'none'; // Ensure both methods are used
  });

  const target = document.getElementById(`editor-data-${view}`);
  if (target) {
    target.classList.remove('u-hidden');
    target.style.display = 'block';
  }
}

// Global Delegation for Editor Layout
document.addEventListener('click', (e) => {
  const dropBtn = e.target.closest('.editor-view-dropdown-btn');
  if (dropBtn) {
    toggleEditorViewDropdown();
    e.stopPropagation();
    return;
  }

  const optBtn = e.target.closest('.editor-view-option');
  if (optBtn) {
    const view = optBtn.dataset.view;
    if (view) setEditorView(view);
    return;
  }

  // Close dropdown when clicking outside
  const menu = document.getElementById('editor-view-options');
  if (menu && menu.classList.contains('show') && !e.target.closest('.editor-view-dropdown')) {
    menu.classList.remove('show');
  }
});
