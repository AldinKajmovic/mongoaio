import { $ } from '../utils/state.js';

export function initModalsShell() {
  const container = $('#modals-container');
  if (!container) return;

  container.innerHTML = `
    <!-- Insert Document Modal -->
    <div id="insert-doc-overlay" class="modal-overlay">
      <div class="modal glass-panel insert-doc-modal">
        <div class="modal-header">
          <h3 id="insert-doc-title">Insert JSON Document</h3>
          <div class="modal-header-actions">
            <button id="insert-doc-minimize" class="btn btn-ghost btn-icon btn-sm" title="Minimize">&#9723;</button>
            <button id="insert-doc-close" class="btn btn-ghost btn-icon btn-sm insert-doc-close-btn" title="Close">&times;</button>
          </div>
        </div>
        <div class="modal-body insert-doc-body">
          <div class="insert-doc-editor-wrap">
            <div id="insert-doc-line-numbers" class="insert-doc-line-numbers">1\n2\n3</div>
            <textarea id="insert-doc-editor" class="insert-doc-textarea" spellcheck="false">{\n\n}</textarea>
          </div>
          <p id="insert-doc-error" class="modal-error"></p>
        </div>
        <div class="modal-footer insert-doc-footer">
          <div class="insert-doc-tools">
            <button id="insert-doc-validate" class="btn btn-outline btn-sm">Validate JSON</button>
            <button id="insert-doc-format" class="btn btn-outline btn-sm">Format JSON</button>
            <label class="insert-doc-wordwrap-label"><input type="checkbox" id="insert-doc-wordwrap"> Word wrap</label>
          </div>
          <div class="insert-doc-actions">
            <button id="insert-doc-add-continue" class="btn btn-ghost">Add &amp; Continue</button>
            <button id="insert-doc-cancel" class="btn btn-ghost">Cancel</button>
            <button id="insert-doc-add" class="btn btn-success">Add Document</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div id="modal-overlay" class="modal-overlay">
      <div class="modal glass-panel">
        <div class="modal-header">
          <h3 id="modal-title">Edit Document</h3>
          <button id="modal-close" class="btn btn-ghost btn-icon">&times;</button>
        </div>
        <div class="modal-body">
          <textarea id="modal-editor" class="json-editor" spellcheck="false"></textarea>
          <div id="modal-sync-list" class="sync-field-list"></div>
          <p id="modal-error" class="modal-error"></p>
        </div>
        <div class="modal-footer">
          <button id="modal-cancel" class="btn btn-ghost">Cancel</button>
          <button id="modal-confirm" class="btn btn-primary">Save Changes</button>
        </div>
      </div>
    </div>

    <!-- Confirmation Modal -->
    <div id="confirm-overlay" class="modal-overlay">
      <div class="modal glass-panel modal-sm">
        <div class="modal-header">
          <h3 id="confirm-title">Confirm</h3>
          <button id="confirm-close" class="btn btn-ghost btn-icon">&times;</button>
        </div>
        <div class="modal-body"><p id="confirm-message"></p></div>
        <div class="modal-footer">
          <button id="confirm-cancel" class="btn btn-ghost">Cancel</button>
          <button id="confirm-ok" class="btn btn-danger">Confirm</button>
        </div>
      </div>
    </div>
    <!-- Delete Documents Modal -->
    <div id="delete-docs-overlay" class="modal-overlay">
      <div class="modal glass-panel delete-docs-modal">
        <div class="modal-header">
          <h3 id="delete-docs-title">Delete Documents</h3>
          <button id="delete-docs-close" class="btn btn-ghost btn-icon btn-sm">&times;</button>
        </div>
        <div class="modal-body delete-docs-body">
          <p class="u-mb-8">Delete document(s) matching the query below:</p>
          <div class="insert-doc-editor-wrap">
            <div id="delete-docs-line-numbers" class="insert-doc-line-numbers">1</div>
            <textarea id="delete-docs-editor" class="insert-doc-textarea" spellcheck="false">{}</textarea>
          </div>
          <div class="delete-docs-options u-mt-12">
            <div class="u-flex u-items-center u-gap-8 u-mb-8">
              <span>Apply predefined query:</span>
              <select id="delete-docs-predefined" class="btn btn-outline btn-sm u-grow">
                <option value="selected">Selected Document(s)</option>
                <option value="custom">Custom Query</option>
              </select>
            </div>
            <label class="u-flex u-items-start u-gap-8 u-font-small">
              <input type="checkbox" id="delete-docs-history" checked>
              <span>Add documents deleted through this operation to Collection History. This may increase the time necessary to complete this operation.</span>
            </label>
          </div>
          <p id="delete-docs-error" class="modal-error"></p>
        </div>
        <div class="modal-footer">
          <button id="delete-docs-validate" class="btn btn-ghost btn-sm u-mr-auto">Validate JSON</button>
          <button id="delete-docs-cancel" class="btn btn-ghost">Cancel</button>
          <button id="delete-docs-confirm" class="btn btn-danger">Delete</button>
        </div>
      </div>
    </div>

    <!-- Add Database Modal -->
    <div id="add-db-overlay" class="modal-overlay">
      <div class="modal glass-panel add-db-modal">
        <div class="modal-header">
          <h3>Add Database</h3>
          <button id="add-db-close" class="btn btn-ghost btn-icon btn-sm">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group u-mb-16">
            <label class="u-mb-4 d-block">Database Name</label>
            <input type="text" id="add-db-name" class="form-input" placeholder="Enter database name" autocomplete="off">
          </div>
          
          <div class="info-box u-mb-16">
            <div class="u-flex u-items-start u-gap-8">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="u-text-cyan u-mt-2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <div class="u-font-small">
                <p class="u-mb-8">This will add a database node in the connection tree.</p>
                <p class="u-text-muted">Note that MongoDB does not provide a way to create an empty database. The database is automatically created when a collection is created in it. Therefore the newly added node will disappear on refresh unless you add at least one collection to it.</p>
              </div>
            </div>
          </div>
          <p id="add-db-error" class="modal-error"></p>
        </div>
        <div class="modal-footer u-justify-end">
          <button id="add-db-cancel" class="btn btn-ghost">Cancel</button>
          <button id="add-db-confirm" class="btn btn-success add-db-confirm-btn">OK</button>
        </div>
      </div>
    </div>

    <!-- Loading overlay -->
    <div id="loading-overlay" class="loading-overlay">
      <div class="spinner"></div>
      <p id="loading-text">Connecting...</p>
    </div>
  `;
}
